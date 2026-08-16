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
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const name = 'dsh-ops-console'
export const inject = ['webServer', 'credentials', 'tools']

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PROFILE_DIR = join(DSH_HOME, 'profiles', argvProfile() ?? 'web')
const PATCH_FILE = join(PROFILE_DIR, 'cordis.patch.yml')
const SETTINGS_FILE = join(PROFILE_DIR, '.dsh-ops.json')
const CREDENTIALS = join(DSH_HOME, '.credentials.yaml')
const LOG_FILE = process.env.DSH_OPS_LOG ?? join(DSH_HOME, 'logs', 'dsh-web.log')
const HOST = process.env.DSH_WEB_HOST ?? '127.0.0.1'
const PORT = process.env.DSH_WEB_PORT ?? '3080'
const BASE_URL = `http://${HOST}:${PORT}/`

// Last-resort engine version for the version-check card (only used when neither
// the running dsh package's own version nor the DSH_OPS_ENGINE override is
// discoverable). Detection walks up from process.argv[1] to the
// @deepseek-ai/dsh package.json, so a normal `dsh web` launch reports the
// exact version it runs.
const ENGINE_FALLBACK = '0.1.0-rc.6'
const NPM_LATEST_URL = 'https://registry.npmjs.org/@deepseek-ai/dsh/latest'
const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const TAILSCALE_APP = '/Applications/Tailscale.app/Contents/MacOS/Tailscale'

/** Auto-detect the running dsh engine version; env override wins, then the
 *  installed package.json, then the fallback constant. */
function detectEngineVersion() {
  const env = process.env.DSH_OPS_ENGINE
  if (env !== undefined && env.trim() !== '') return env.trim()
  const entry = process.argv[1]
  if (entry !== undefined) {
    let dir = dirname(resolve(entry))
    for (let i = 0; i < 12 && dir; i++) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        if (pkg.name === '@deepseek-ai/dsh' && typeof pkg.version === 'string' && pkg.version !== '') return pkg.version
      } catch { /* keep walking up */ }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return ENGINE_FALLBACK
}

const CURRENT_ENGINE = detectEngineVersion()

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

/** Read a small JSON request body (capped at 16 KiB). */
function readJsonBody(request) {
  return new Promise((resolvePromise) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 16 * 1024) {
        resolvePromise({ error: 'body too large' })
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        resolvePromise({ error: 'invalid json body' })
      }
    })
    request.on('error', () => resolvePromise({ error: 'body read failed' }))
  })
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

/** Resolve the DeepSeek API key. Prefers the DSH `credentials` service
 *  (env / .credentials.yaml / project+user .env, resolved per call), falls
 *  back to a direct read of ~/.dsh/.credentials.yaml for non-composed
 *  deployments. */
async function readApiKey(ctx) {
  try {
    const creds = ctx?.credentials
    if (creds?.resolve !== undefined) {
      const r = await creds.resolve('DEEPSEEK_API_KEY')
      if (r?.value !== undefined && r.value !== '') return r.value
    }
  } catch { /* service unavailable — fall through to file */ }
  try {
    const content = readFileSync(CREDENTIALS, 'utf8')
    for (const raw of content.split('\n')) {
      const line = raw.trim()
      if (!line.startsWith('DEEPSEEK_API_KEY:')) continue
      const value = line.slice('DEEPSEEK_API_KEY:'.length).trim().replace(/^["']|["']$/g, '')
      if (value !== '') return value
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

// ---------------------------------------------------------------- trusted hosts

/**
 * Extract trusted hosts from the profile's connection patch (read-only).
 * The list lives under the `- id: connection` block's `trustedHosts:` key in
 * cordis.patch.yml — the browser-trust fence (`client-connection` plugin)
 * reads it once at boot, so edits persist to this file and take effect on the
 * next server restart.
 */
function readTrustedHosts() {
  try {
    return parseTrustedHosts(readFileSync(PATCH_FILE, 'utf8'))
  } catch { /* no patch file */ }
  return []
}

/**
 * Parse the `trustedHosts` list out of a cordis.patch.yml string, scoped to
 * the `- id: connection` block. Indentation-aware so unrelated lists elsewhere
 * in the file are ignored.
 */
function parseTrustedHosts(content) {
  const hosts = []
  const lines = content.split('\n')
  let inConnection = false
  let thIndent = -1
  for (const line of lines) {
    const blockMatch = line.match(/^(\s*)- id:\s+(\S+)\s*$/)
    if (blockMatch) {
      inConnection = blockMatch[2] === 'connection' && blockMatch[1].length === 0
      thIndent = -1
      continue
    }
    if (!inConnection) continue
    if (thIndent !== -1) {
      // inside a trustedHosts list: collect `- item` lines deeper than thIndent
      const itemMatch = line.match(/^(\s+)-\s+(\S.*)$/)
      if (itemMatch && itemMatch[1].length > thIndent) {
        hosts.push(itemMatch[2].trim())
        continue
      }
      const keyMatch = line.match(/^(\s*)(\S[^:]*):/)
      if (keyMatch && keyMatch[1].length >= thIndent) {
        thIndent = -1 // a new key at or above trustedHosts indent ends the list
      }
      continue
    }
    const keyMatch = line.match(/^(\s*)(\S[^:]*):\s*(.*)$/)
    if (!keyMatch) continue
    const indent = keyMatch[1].length
    if (keyMatch[2] === 'trustedHosts') {
      thIndent = indent
      const inline = keyMatch[3].trim()
      if (inline.startsWith('[')) {
        // inline flow list: [a, b]
        for (const part of inline.slice(1, -1).split(',')) {
          const v = part.trim()
          if (v) hosts.push(v)
        }
        thIndent = -1
      }
      continue
    }
  }
  return hosts
}

/**
 * Serialize a trustedHosts key as YAML at the given indentation. An empty
 * list is written as `[]` (a bare `trustedHosts:` key would parse as null).
 */
function trustedHostsYaml(hosts, indent) {
  if (hosts.length === 0) return `${' '.repeat(indent)}trustedHosts: []`
  const out = [`${' '.repeat(indent)}trustedHosts:`]
  for (const h of hosts) out.push(`${' '.repeat(indent + 2)}- ${h}`)
  return out.join('\n')
}

/**
 * Persist a new trustedHosts list into the profile's cordis.patch.yml,
 * preserving comments and every unrelated block verbatim. Builds the new
 * content in memory, re-parses it to confirm the write round-trips, and only
 * then writes the file. Returns { ok, hosts } or { ok: false, error }.
 */
function writeTrustedHosts(hosts) {
  try {
    const content = readFileSync(PATCH_FILE, 'utf8')
    const lines = content.split('\n')
    const out = []
    let i = 0
    let replaced = false
    while (i < lines.length) {
      const line = lines[i]
      const blockMatch = line.match(/^(\s*)- id:\s+(\S+)\s*$/)
      if (blockMatch && blockMatch[2] === 'connection' && blockMatch[1].length === 0) {
        // copy the connection block header, then scan its body
        out.push(line)
        i++
        let thIndent = -1
        let configSeen = false
        let inserted = false
        while (i < lines.length) {
          const l = lines[i]
          const nextBlock = l.match(/^\s*- id:\s+\S+\s*$/)
          if (nextBlock) break // next top-level block: connection had no trustedHosts
          const keyMatch = l.match(/^(\s*)(\S[^:]*):\s*(.*)$/)
          if (!keyMatch) { out.push(l); i++; continue }
          const indent = keyMatch[1].length
          const key = keyMatch[2]
          const rest = keyMatch[3].trim()
          if (key === 'config' && thIndent === -1) configSeen = true
          if (key === 'trustedHosts') {
            thIndent = indent
            if (rest.startsWith('[')) {
              i++
            } else {
              i++
              while (i < lines.length && /^\s+-\s+/.test(lines[i])) i++
            }
            out.push(trustedHostsYaml(hosts, indent))
            inserted = true
            replaced = true
            continue
          }
          if (thIndent !== -1 && indent === thIndent) thIndent = -1
          out.push(l)
          i++
        }
        if (!inserted && configSeen) {
          // connection block exists but no trustedHosts key: append one right
          // after the `config:` line (YAML map keys are order-independent).
          let configIdx = -1
          let configIndent = -1
          for (let j = out.length - 1; j >= 0; j--) {
            const m = out[j].match(/^(\s*)config:\s*$/)
            if (m) { configIdx = j; configIndent = m[1].length; break }
          }
          if (configIdx !== -1) {
            out.splice(configIdx + 1, 0, ...trustedHostsYaml(hosts, configIndent + 2).split('\n'))
            inserted = true
            replaced = true
          }
        }
        if (!inserted) {
          // no config key either: append a full connection config block
          out.push('  config:')
          out.push(...trustedHostsYaml(hosts, 4).split('\n'))
          replaced = true
        }
        continue
      }
      out.push(line)
      i++
    }
    if (!replaced) {
      // no connection block at all: append one
      if (out.length > 0 && out[out.length - 1] !== '') out.push('')
      out.push('- id: connection')
      out.push('  config:')
      out.push(...trustedHostsYaml(hosts, 4).split('\n'))
    }
    const next = out.join('\n')
    // round-trip check before touching the real file
    const reparsed = parseTrustedHosts(next)
    if (JSON.stringify(reparsed) !== JSON.stringify(hosts)) {
      return { ok: false, error: `round-trip mismatch: wrote ${JSON.stringify(hosts)} but re-parsed ${JSON.stringify(reparsed)}` }
    }
    writeFileSync(PATCH_FILE, next)
    return { ok: true, hosts: hosts.slice() }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

/**
 * Mirror of client-connection's assertTrustedAuthority: an entry must be a
 * bare, canonical `host` or `host:port` authority that WHATWG parsing would
 * not rewrite. Rejects paths, userinfo, whitespace, empty/non-numeric ports,
 * and URL-scheme-looking garbage.
 */
function isBareAuthority(entry) {
  if (typeof entry !== 'string' || entry.length === 0) return false
  if (/\s/.test(entry)) return false
  if (entry.includes('/') || entry.includes('@') || entry.includes('//')) return false
  if (entry.startsWith('[')) {
    // bracketed IPv6, optional :port
    const m = entry.match(/^\[([0-9a-fA-F:]+)\](?::(\d{1,5}))?$/)
    if (!m || !m[1].includes(':')) return false
    return m[2] === undefined || /^\d+$/.test(m[2])
  }
  // DNS labels: alphanumeric with internal hyphens, dot-separated (also
  // accepts IPv4 literals, which are all-numeric labels).
  const hostname = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i
  if (entry.includes(':')) {
    const [host, ...rest] = entry.split(':')
    if (rest.length !== 1 || !/^\d{1,5}$/.test(rest[0])) return false
    return hostname.test(host)
  }
  return hostname.test(entry)
}

// ---------------------------------------------------------------- settings

/** Plugin UI prefs, persisted to .dsh-ops.json next to the profile patch. */
const DEFAULT_SETTINGS = Object.freeze({
  refreshSeconds: 0,   // 余额自动刷新间隔（秒），0 = 关闭
  warnThreshold: 10,   // 余额低于该值（元）时预警
  logLines: 100,       // 日志卡片默认条数
})

const SETTING_RANGES = Object.freeze({
  refreshSeconds: [0, 3600],
  warnThreshold: [0, 1e6],
  logLines: [10, 500],
})

function readSettings() {
  const out = { ...DEFAULT_SETTINGS }
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'))
    if (parsed && typeof parsed === 'object') {
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        const v = parsed[key]
        if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
      }
    }
  } catch { /* no settings file yet */ }
  return out
}

/** Validate one field: a finite number inside the field's range. */
function validSetting(key, value) {
  const range = SETTING_RANGES[key]
  if (range === undefined || typeof value !== 'number' || !Number.isFinite(value)) return false
  return value >= range[0] && value <= range[1]
}

function writeSettings(patch) {
  const next = { ...readSettings() }
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (validSetting(key, value)) next[key] = Math.round(value * 100) / 100
  }
  try {
    writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2) + '\n')
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
  return { ok: true, settings: next }
}

// ---------------------------------------------------------------- queries

let balanceCache = { at: 0, value: null }
async function getBalance(ctx) {
  const now = Date.now()
  if (balanceCache.value !== null && now - balanceCache.at < 60000) return balanceCache.value
  const key = await readApiKey(ctx)
  if (key === undefined) {
    const v = { ok: false, error: '未找到 DEEPSEEK_API_KEY（credentials 服务或 ~/.dsh/.credentials.yaml）' }
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
      msgKey: 'tailscale.needsAdmin',
      message: 'Tailscale 后台尚未启用 Serve（HTTPS）。请先用浏览器打开下方链接，在 Tailscale 控制台点击「启用」，再回来点一次「开启」。',
    }
  }
  if (r.timedOut) {
    return { ok: false, msgKey: 'tailscale.timeout', message: 'tailscale serve 超时，请确认 Tailscale 已登录后重试。' }
  }
  if (r.code !== 0) {
    return { ok: false, msgKey: 'tailscale.enableFailed', message: (r.stderr || r.stdout || 'tailscale serve 失败').slice(0, 300) }
  }
  const dns = await tailscaleDnsName(cli)
  const trusted = readTrustedHosts()
  const trustedOk = dns !== null && trusted.includes(dns)
  return {
    ok: true,
    dns,
    url: dns !== null ? `https://${dns}/` : null,
    trustedOk,
    msgKey: dns !== null
      ? (trustedOk ? 'tailscale.enabled' : 'tailscale.enabledUntrusted')
      : 'tailscale.enabledNoDns',
    msgParams: dns !== null ? { dns } : undefined,
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

// ---------------------------------------------------------------- self-ops tools

/** Minimal ContentBlock[] for a plain-text tool result. */
function toolText(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }]
}

/**
 * Register Agent-facing self-ops tools (B1): let the model report status,
 * check balance, read logs, and even trigger a self-heal restart. Tool
 * definitions are built by hand (the bundle cannot import @deepseek-ai
 * packages) in the same shape defineTool() produces: parameters as JSON
 * schema, output.schema + render, and an async execute(). Registration is
 * defensive — a failure here must never break the ops-console itself.
 */
function registerOpsTools(ctx, disposers) {
  try {
    const tools = ctx?.tools
    if (tools?.register === undefined) return
    const def = (name, description, parameters, outputSchema, execute) => ({
      name,
      description,
      parameters,
      output: { schema: outputSchema, render: (_args, value) => toolText(value) },
      async execute(args) { return execute(args) },
    })
    const resultSchema = (extra = {}) => ({
      type: 'object',
      additionalProperties: true,
      properties: { ok: { type: 'boolean' }, ...extra },
    })
    const objectParameters = (properties = {}) => ({
      type: 'object',
      additionalProperties: false,
      properties,
    })

    const opsStatus = async () => ({
      ok: true,
      up: true,
      host: HOST,
      port: PORT,
      pid: process.pid,
      uptime: Math.round(process.uptime()),
      engine: CURRENT_ENGINE,
      url: BASE_URL,
    })
    disposers.push(tools.register(def('ops_status',
      'Report the DeepSeek Harness server status: host/port, pid, uptime and engine version.',
      objectParameters(),
      resultSchema(), opsStatus)))

    disposers.push(tools.register(def('ops_balance',
      'Check the DeepSeek account balance (total, granted, topped-up, used).',
      objectParameters(),
      resultSchema({ total: { type: 'number' }, currency: { type: 'string' } }),
      async () => getBalance(ctx))))

    disposers.push(tools.register(def('ops_logs',
      'Read the last N lines of the dsh server log (default 100, max 500).',
      objectParameters({ tail: { type: 'integer', description: 'Number of log lines to return (10-500, default 100).' } }),
      resultSchema({ lines: { type: 'array', items: { type: 'string' } } }),
      async (args) => ({ ok: true, lines: tailLog(args?.tail) }))))

    disposers.push(tools.register(def('ops_tailscale',
      'Report Tailscale remote-access state: tailnet DNS name, whether serve :3080 is active, and the current trusted-hosts list.',
      objectParameters(),
      resultSchema({ dnsName: { type: 'string' }, serveActive: { type: 'boolean' }, trustedHosts: { type: 'array' } }),
      async () => {
        const result = await getTailscale()
        return { ...result, dnsName: result.dnsName ?? '' }
      })))

    disposers.push(tools.register(def('ops_restart',
      'Restart the dsh server process (self-heal). The server exits and respawns with the same launch command; in-flight sessions reconnect.',
      objectParameters(),
      resultSchema({ pid: { type: 'integer' } }),
      async () => {
        const r = scheduleRestart()
        return { ok: true, pid: r.pid, scheduled: true }
      })))
  } catch (error) {
    ctx.effect(() => console.error('[dsh-ops-console] self-ops tools registration skipped:', String(error?.message ?? error)))
  }
}

// ---------------------------------------------------------------- apply

export function apply(ctx) {
  ctx.effect(() => {
    const disposers = []

    registerOpsTools(ctx, disposers)

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
      sendJson(res, 200, await getBalance(ctx))
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
      sendJson(res, 200, { ok: true, pid: r.pid, msgKey: 'restart.triggered', message: '已触发重启，浏览器将在数秒后重连…' })
    })

    route('POST', '/dsh-ops/tailscale/enable', async (_req, res) => {
      sendJson(res, 200, await enableTailscale())
    })

    route('POST', '/dsh-ops/tailscale/disable', async (_req, res) => {
      const r = await runCommand(tailscaleCli(), ['serve', 'reset'], { timeoutMs: 10000 })
      sendJson(res, 200, {
        ok: r.code === 0,
        msgKey: r.code === 0 ? 'tailscale.disabled' : 'tailscale.disableFailed',
        message: r.code === 0 ? '远程访问已关闭' : ((r.stderr || r.stdout || '关闭失败').slice(0, 300)),
      })
    })

    // -- settings (UI prefs persisted to .dsh-ops.json) ----------------------

    route('GET', '/dsh-ops/settings', async (_req, res) => {
      sendJson(res, 200, { ok: true, settings: readSettings(), file: SETTINGS_FILE })
    })

    route('POST', '/dsh-ops/settings/save', async (req, res) => {
      const body = await readJsonBody(req)
      if (body?.error) { sendJson(res, 400, { ok: false, error: body.error }); return }
      const patch = body?.settings
      if (patch === undefined || typeof patch !== 'object' || Array.isArray(patch)) {
        sendJson(res, 400, { ok: false, error: 'settings 必须是对象' })
        return
      }
      const invalid = Object.keys(patch).find((k) => !(k in DEFAULT_SETTINGS))
      if (invalid !== undefined) {
        sendJson(res, 400, { ok: false, error: `未知设置项：${invalid}` })
        return
      }
      const bad = Object.entries(patch).find(([k, v]) => !validSetting(k, v))
      if (bad !== undefined) {
        const [k, v] = bad
        sendJson(res, 400, { ok: false, error: `${k}=${JSON.stringify(v)} 超出范围（${SETTING_RANGES[k].join('~')}）` })
        return
      }
      const w = writeSettings(patch)
      if (!w.ok) { sendJson(res, 500, { ok: false, error: w.error }); return }
      sendJson(res, 200, { ok: true, settings: w.settings, msgKey: 'settings.saved', message: '设置已保存。' })
    })

    // -- trusted hosts (exposure audit + editor) ------------------------------

    route('GET', '/dsh-ops/trust', async (_req, res) => {
      const cli = tailscaleCli()
      const dnsName = await tailscaleDnsName(cli)
      const hosts = readTrustedHosts()
      sendJson(res, 200, {
        ok: true,
        patchFile: PATCH_FILE,
        hosts,
        tailnetDns: dnsName,
        tailnetTrusted: dnsName !== null && hosts.includes(dnsName),
      })
    })

    route('POST', '/dsh-ops/trust/add', async (req, res) => {
      const body = await readJsonBody(req)
      if (body?.error) { sendJson(res, 400, { ok: false, error: body.error }); return }
      const host = String(body?.host ?? '').trim()
      if (!isBareAuthority(host)) {
        sendJson(res, 400, { ok: false, error: `「${host}」不是合法的裸 authority：只接受 host 或 host:port（例如 mac-mini.tail38f298.ts.net）` })
        return
      }
      const current = readTrustedHosts()
      if (current.includes(host)) {
        sendJson(res, 200, { ok: true, hosts: current, restartRequired: true, msgKey: 'trust.duplicate', msgParams: { host }, message: `「${host}」已在可信主机列表中。` })
        return
      }
      const w = writeTrustedHosts([...current, host])
      if (!w.ok) { sendJson(res, 500, { ok: false, error: w.error }); return }
      sendJson(res, 200, { ok: true, hosts: w.hosts, restartRequired: true, msgKey: 'trust.added', msgParams: { host }, message: `已添加「${host}」，重启服务后生效。` })
    })

    route('POST', '/dsh-ops/trust/remove', async (req, res) => {
      const body = await readJsonBody(req)
      if (body?.error) { sendJson(res, 400, { ok: false, error: body.error }); return }
      const host = String(body?.host ?? '').trim()
      const current = readTrustedHosts()
      if (!current.includes(host)) {
        sendJson(res, 200, { ok: true, hosts: current, msgKey: 'trust.absent', msgParams: { host }, message: `「${host}」不在可信主机列表中。` })
        return
      }
      const w = writeTrustedHosts(current.filter((h) => h !== host))
      if (!w.ok) { sendJson(res, 500, { ok: false, error: w.error }); return }
      sendJson(res, 200, { ok: true, hosts: w.hosts, restartRequired: true, msgKey: 'trust.removed', msgParams: { host }, message: `已移除「${host}」，重启服务后生效。` })
    })

    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-ops-console: http routes')
}
