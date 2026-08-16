/**
 * dsh-ops-console — Host half.
 *
 * Registers a set of HTTP routes on the webServer service that power the
 * settings-page "运维控制台" (ops console): account balance, server status &
 * log tail, engine version check, one-click restart, and the Tailscale remote
 * access toggle. All process/filesystem/network work uses Node builtins, so
 * the bundle has no runtime dependencies beyond the `webServer` service.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const name = 'dsh-ops-console'
export const inject = ['webServer']

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PROFILE_DIR = join(DSH_HOME, 'profiles', argvProfile() ?? 'web')
const PATCH_FILE = join(PROFILE_DIR, 'cordis.patch.yml')
const CREDENTIALS = join(DSH_HOME, '.credentials.yaml')
const LOG_FILE = process.env.DSH_OPS_LOG ?? join(DSH_HOME, 'logs', 'dsh-web.log')
const HOST = process.env.DSH_WEB_HOST ?? '127.0.0.1'
const PORT = process.env.DSH_WEB_PORT ?? '3080'
const BASE_URL = `http://${HOST}:${PORT}/`

// Keep in sync with the engine version pinned in the desktop client's
// launch.sh (npx @deepseek-ai/dsh@<this>).
const CURRENT_ENGINE = '0.1.0-rc.6'
const NPM_LATEST_URL = 'https://registry.npmjs.org/@deepseek-ai/dsh/latest'
const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const TAILSCALE_APP = '/Applications/Tailscale.app/Contents/MacOS/Tailscale'

function argvProfile() {
  const argv = process.argv
  const i = argv.indexOf('--profile')
  if (i !== -1 && i + 1 < argv.length && !argv[i + 1].startsWith('-')) return argv[i + 1]
  return undefined
}

// ---------------------------------------------------------------- helpers

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

/** True when the request's Origin matches its Host — required on mutating routes. */
function sameOrigin(request) {
  const origin = request.headers.origin
  const host = request.headers.host
  if (origin === undefined || host === undefined) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function readApiKey() {
  try {
    const content = readFileSync(CREDENTIALS, 'utf8')
    for (const raw of content.split('\n')) {
      const line = raw.trim()
      if (!line.startsWith('DEEPSEEK_API_KEY:')) continue
      const value = line.slice('DEEPSEEK_API_KEY:'.length).trim().replace(/^["']|["']$/g, '')
      return value || undefined
    }
  } catch { /* no credentials file yet */ }
  return undefined
}

/** Spawn a command, collect stdout/stderr, enforce a timeout. */
function runCommand(file, args, { timeoutMs = 15000 } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(file, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill('SIGKILL') } catch { /* already gone */ }
    }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolvePromise({ code: -1, stdout, stderr: String(err), timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolvePromise({ code: code ?? -1, stdout, stderr, timedOut })
    })
  })
}

function tailscaleCli() {
  return existsSync(TAILSCALE_APP) ? TAILSCALE_APP : 'tailscale'
}

async function fetchJson(url, headers = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers, signal: controller.signal })
    const text = await res.text()
    if (!res.ok) return { ok: false, status: res.status, body: text.slice(0, 300) }
    try {
      return { ok: true, data: JSON.parse(text) }
    } catch {
      return { ok: true, data: text }
    }
  } finally {
    clearTimeout(timer)
  }
}

function tailLog(tail) {
  const n = Math.max(1, Math.min(500, Number(tail) || 100))
  try {
    const content = readFileSync(LOG_FILE, 'utf8')
    const lines = content.split('\n').filter((l) => l.length > 0)
    return lines.slice(-n)
  } catch {
    return []
  }
}

/** Extract trusted hosts from the profile's connection patch (read-only). */
function readTrustedHosts() {
  const hosts = []
  try {
    const content = readFileSync(PATCH_FILE, 'utf8')
    const lines = content.split('\n')
    let inTrustedHosts = false
    for (const line of lines) {
      if (/^\s*trustedHosts:\s*$/.test(line)) {
        inTrustedHosts = true
        continue
      }
      if (inTrustedHosts) {
        if (/^\s+-\s+\S+/.test(line)) {
          hosts.push(line.replace(/^\s+-\s*/, '').trim())
        } else if (/^\S/.test(line)) {
          inTrustedHosts = false
        }
      }
    }
  } catch { /* no patch file */ }
  return hosts
}

// ---------------------------------------------------------------- queries

let balanceCache = { at: 0, value: null }
async function getBalance() {
  const now = Date.now()
  if (balanceCache.value !== null && now - balanceCache.at < 60000) return balanceCache.value
  const key = readApiKey()
  if (key === undefined) {
    const v = { ok: false, error: '未找到 DEEPSEEK_API_KEY（~/.dsh/.credentials.yaml）' }
    balanceCache = { at: now, value: v }
    return v
  }
  const r = await fetchJson(BALANCE_URL, { Authorization: `Bearer ${key}` }, 20000)
  if (!r.ok) {
    const v = { ok: false, error: `HTTP ${r.status ?? '?'}: ${(r.body ?? '').slice(0, 200)}` }
    balanceCache = { at: now, value: v }
    return v
  }
  const info = r.data?.balance_infos?.[0]
  const granted = Number(info?.granted_balance ?? 0)
  const topped = Number(info?.topped_up_balance ?? 0)
  const total = Number(info?.total_balance ?? 0)
  const v = {
    ok: true,
    isAvailable: !!r.data?.is_available,
    currency: info?.currency ?? 'CNY',
    total,
    granted,
    topped,
    used: Math.max(0, granted + topped - total),
  }
  balanceCache = { at: now, value: v }
  return v
}

let versionCache = { at: 0, value: null }
async function getVersion() {
  const now = Date.now()
  if (versionCache.value !== null && now - versionCache.at < 3600000) return versionCache.value
  const r = await fetchJson(NPM_LATEST_URL, { Accept: 'application/json' }, 20000)
  const latest = r.ok ? r.data?.version : undefined
  const v = {
    current: CURRENT_ENGINE,
    latest: latest ?? null,
    updateAvailable: latest !== undefined ? isNewer(latest, CURRENT_ENGINE) : false,
    error: r.ok ? undefined : ((r.body ?? '').slice(0, 200) || 'npm 查询失败'),
  }
  versionCache = { at: now, value: v }
  return v
}

function isNewer(latest, installed) {
  const numeric = (v) => v.split('-')[0].split('.').map(Number)
  const rc = (v) => {
    const m = v.match(/-rc\.(\d+)/)
    return m ? { n: Number(m[1]), stable: false } : { n: Number.MAX_SAFE_INTEGER, stable: true }
  }
  const a = numeric(latest)
  const b = numeric(installed)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = i < a.length ? a[i] : 0
    const y = i < b.length ? b[i] : 0
    if (x !== y) return x > y
  }
  const lx = rc(latest)
  const ix = rc(installed)
  if (lx.stable !== ix.stable) return lx.stable
  return lx.n > ix.n
}

async function tailscaleDnsName(cli) {
  const st = await runCommand(cli, ['status', '--json'], { timeoutMs: 8000 })
  if (st.code !== 0) return null
  try {
    const dns = JSON.parse(st.stdout)?.Self?.DNSName
    return typeof dns === 'string' ? dns.replace(/\.$/, '') : null
  } catch {
    return null
  }
}

async function getTailscale() {
  const cli = tailscaleCli()
  const dnsName = await tailscaleDnsName(cli)
  const sv = await runCommand(cli, ['serve', 'status', '--json'], { timeoutMs: 8000 })
  const serveActive = sv.code === 0 && sv.stdout.includes('3080')
  return { ok: true, cli, dnsName, serveActive, trustedHosts: readTrustedHosts() }
}

async function enableTailscale() {
  const cli = tailscaleCli()
  const r = await runCommand(cli, ['serve', '--bg', '3080'], { timeoutMs: 15000 })
  if (r.stdout.includes('Serve is not enabled')) {
    const m = r.stdout.match(/https:\/\/login\.tailscale\.com\/f\/serve\?node=[A-Za-z0-9]+/)
    return {
      ok: false,
      needsAdmin: true,
      link: m ? m[0] : null,
      message: 'Tailscale 后台尚未启用 Serve（HTTPS）。请先用浏览器打开下方链接，在 Tailscale 控制台点击「启用」，再回来点一次「开启」。',
    }
  }
  if (r.timedOut) {
    return { ok: false, message: 'tailscale serve 超时，请确认 Tailscale 已登录后重试。' }
  }
  if (r.code !== 0) {
    return { ok: false, message: (r.stderr || r.stdout || 'tailscale serve 失败').slice(0, 300) }
  }
  const dns = await tailscaleDnsName(cli)
  const trusted = readTrustedHosts()
  const trustedOk = dns !== null && trusted.includes(dns)
  return {
    ok: true,
    dns,
    url: dns !== null ? `https://${dns}/` : null,
    trustedOk,
    message: dns !== null
      ? (trustedOk ? `远程访问已开启：https://${dns}/` : `Serve 已开启，但 ${dns} 尚未加入可信主机（可能无法通过 /api 访问）。`)
      : 'Serve 已开启（未取到 Tailscale 域名）。',
  }
}

// ---------------------------------------------------------------- restart

/**
 * Re-invoke the exact `dsh` invocation that booted this host, so a restart
 * keeps the same profile, host/port and `--trusted-host` flags without
 * depending on any particular desktop client. Ported from the proven
 * dsh-market self-restart model: a detached helper outlives this process,
 * waits for the port to free, then respawns the original launch.
 */
function dshArgv() {
  const entry = process.argv[1]
  if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
    const abs = resolve(entry)
    return { file: process.execPath, args: [...process.execArgv, abs], cwd: dirname(abs), viaShell: false }
  }
  return { file: 'dsh', args: [], cwd: undefined, viaShell: process.platform === 'win32' }
}

function respawnInvocation(launch, platform = process.platform) {
  if (platform !== 'win32') {
    return { file: launch.file, args: launch.args, viaShell: launch.viaShell, detached: true }
  }
  const quote = (part) => `'${part.replace(/'/g, "''")}'`
  return {
    file: 'powershell.exe',
    args: ['-NoProfile', '-WindowStyle', 'Hidden', '-Command',
      [`& ${quote(launch.file)}`, ...launch.args.map(quote)].join(' ')],
    viaShell: false,
    detached: false,
  }
}

function scheduleRestart() {
  const launch = dshArgv()
  const relaunch = { ...launch, args: [...launch.args, ...process.argv.slice(2)], cwd: launch.cwd ?? process.cwd() }
  const spawned = respawnInvocation(relaunch)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const logOut = join(DSH_HOME, 'logs', `dsh-ops-restart-${stamp}.out.log`)
  const logErr = join(DSH_HOME, 'logs', `dsh-ops-restart-${stamp}.err.log`)
  const helperCode = [
    "const { spawn } = require('node:child_process')",
    "const fs = require('node:fs')",
    `const file = ${JSON.stringify(spawned.file)}`,
    `const args = ${JSON.stringify(spawned.args)}`,
    `const cwd = ${JSON.stringify(relaunch.cwd)}`,
    `const viaShell = ${JSON.stringify(spawned.viaShell)}`,
    `const detached = ${JSON.stringify(spawned.detached)}`,
    `const logOut = ${JSON.stringify(logOut)}`,
    `const logErr = ${JSON.stringify(logErr)}`,
    'setTimeout(() => {',
    '  try {',
    "    const out = fs.openSync(logOut, 'a')",
    "    const err = fs.openSync(logErr, 'a')",
    "    const child = spawn(file, args, { cwd, detached, stdio: ['ignore', out, err], env: process.env, shell: viaShell })",
    '    child.unref()',
    '  } catch {}',
    '}, 1500)',
  ].join('\n')
  const helper = spawn(process.execPath, ['-e', helperCode], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  helper.unref()
  setTimeout(() => {
    try { process.kill(process.pid, 'SIGTERM') } catch { /* already gone */ }
  }, 500)
  return { pid: process.pid, helperPid: helper.pid }
}

// ---------------------------------------------------------------- apply

export function apply(ctx) {
  ctx.effect(() => {
    const disposers = []

    const route = (method, path, handler) => {
      disposers.push(ctx.webServer.register({
        kind: 'exact',
        path,
        handler: async (request, response) => {
          if (request.method !== method) {
            response.writeHead(405, { allow: method })
            response.end()
            return
          }
          if (method === 'POST' && !sameOrigin(request)) {
            sendJson(response, 403, { ok: false, error: 'untrusted origin' })
            return
          }
          try {
            await handler(request, response)
          } catch (error) {
            sendJson(response, 500, { ok: false, error: String(error?.message ?? error) })
          }
        },
      }))
    }

    route('GET', '/dsh-ops/status', async (_req, res) => {
      sendJson(res, 200, {
        ok: true,
        up: true,
        url: BASE_URL,
        host: HOST,
        port: PORT,
        pid: process.pid,
        uptime: Math.round(process.uptime()),
        engine: CURRENT_ENGINE,
      })
    })

    route('GET', '/dsh-ops/balance', async (_req, res) => {
      sendJson(res, 200, await getBalance())
    })

    route('GET', '/dsh-ops/version', async (_req, res) => {
      sendJson(res, 200, await getVersion())
    })

    route('GET', '/dsh-ops/logs', async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      sendJson(res, 200, { ok: true, lines: tailLog(url.searchParams.get('tail')) })
    })

    route('GET', '/dsh-ops/tailscale', async (_req, res) => {
      sendJson(res, 200, await getTailscale())
    })

    route('POST', '/dsh-ops/restart', async (_req, res) => {
      const r = scheduleRestart()
      sendJson(res, 200, { ok: true, pid: r.pid, message: '已触发重启，浏览器将在数秒后重连…' })
    })

    route('POST', '/dsh-ops/tailscale/enable', async (_req, res) => {
      sendJson(res, 200, await enableTailscale())
    })

    route('POST', '/dsh-ops/tailscale/disable', async (_req, res) => {
      const r = await runCommand(tailscaleCli(), ['serve', 'reset'], { timeoutMs: 10000 })
      sendJson(res, 200, {
        ok: r.code === 0,
        message: r.code === 0 ? '远程访问已关闭' : ((r.stderr || r.stdout || '关闭失败').slice(0, 300)),
      })
    })

    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-ops-console: http routes')
}
