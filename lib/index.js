/**
 * dsh-ops-console — Host half.
 *
 * Registers a set of HTTP routes on the webServer service that power the
 * settings-page "远程访问" (remote access) panel: Tailscale Serve on/off
 * with one-click self-trust, tailnet device discovery for the trusted-host
 * editor, an end-to-end reachability self-test, and the local admin token.
 *
 * Status, diagnosis, balance, and service lifecycle are intentionally out of
 * scope — dsh-desktop owns those. All process/filesystem/network work uses
 * Node builtins, so the bundle has no runtime dependencies beyond the
 * `webServer` service.
 */
import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const name = 'dsh-ops-console'
export const inject = ['webServer']

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PROFILE_DIR = join(DSH_HOME, 'profiles', argvProfile() ?? 'web')
const PATCH_FILE = join(PROFILE_DIR, 'cordis.patch.yml')
const HOST = process.env.DSH_WEB_HOST ?? '127.0.0.1'
const PORT = process.env.DSH_WEB_PORT ?? '3080'
const BASE_URL = `http://${HOST}:${PORT}/`
const OPS_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const ADMIN_TOKEN_FILE = join(DSH_HOME, 'ops-console', 'admin-token')
const TAILSCALE_APP = '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
const TAILSCALE_BIN = process.env.DSH_OPS_TAILSCALE_BIN?.trim()
const TAILSCALE_CACHE_MS = 4000

/** Auto-detect the running dsh engine version; never invent a stale fallback. */
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
  return null
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

function adminToken() {
  const configured = process.env.DSH_OPS_ADMIN_TOKEN?.trim()
  if (configured?.length >= 32) return configured
  try {
    const existing = readFileSync(ADMIN_TOKEN_FILE, 'utf8').trim()
    if (existing.length >= 32) return existing
  } catch {}
  const token = randomBytes(32).toString('base64url')
  mkdirSync(dirname(ADMIN_TOKEN_FILE), { recursive: true, mode: 0o700 })
  writeFileSync(ADMIN_TOKEN_FILE, token + '\n', { mode: 0o600 })
  chmodSync(ADMIN_TOKEN_FILE, 0o600)
  return token
}

function isLocalHost(request) {
  try {
    const hostname = new URL(`http://${String(request.headers.host ?? '')}`).hostname
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]'
  } catch {
    return false
  }
}

function hasAdminToken(request) {
  const expected = Buffer.from(adminToken())
  const supplied = Buffer.from(String(request.headers['x-dsh-ops-token'] ?? ''))
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

function authorizeMutation(request, response) {
  if (!sameOrigin(request)) {
    sendJson(response, 403, { ok: false, error: 'untrusted origin' })
    return false
  }
  if (!hasAdminToken(request)) {
    sendJson(response, 401, { ok: false, error: '需要 dsh-ops 运维令牌', authRequired: true })
    return false
  }
  return true
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
  if (TAILSCALE_BIN) return TAILSCALE_BIN
  return existsSync(TAILSCALE_APP) ? TAILSCALE_APP : 'tailscale'
}

/** Collect every reverse-proxy target from `tailscale serve status --json`. */
function collectServeProxies(value, path = [], result = []) {
  if (value === null || typeof value !== 'object') return result
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectServeProxies(entry, [...path, String(index)], result))
    return result
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key]
    if (key.toLowerCase() === 'proxy' && typeof child === 'string') {
      result.push({ path: nextPath, target: child })
    } else {
      collectServeProxies(child, nextPath, result)
    }
  }
  return result
}

function isHarnessProxy(target) {
  if (typeof target !== 'string' || target.trim() === '') return false
  try {
    const url = new URL(target.includes('://') ? target : `http://${target}`)
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1' || url.hostname === '[::1]'
    return loopback && url.port === String(PORT)
  } catch {
    return false
  }
}

/** Parse Serve JSON structurally; a mere occurrence of the port is not proof. */
function inspectServeStatus(commandResult, dnsName) {
  if (commandResult.code !== 0) {
    return {
      ok: false,
      serveActive: false,
      rootConflict: null,
      error: (commandResult.stderr || commandResult.stdout || '无法读取 Tailscale Serve 状态').slice(0, 300),
    }
  }
  let config
  try {
    config = JSON.parse(commandResult.stdout || '{}')
  } catch {
    return { ok: false, serveActive: false, rootConflict: null, error: 'Tailscale Serve 状态无法解析。' }
  }
  const proxies = collectServeProxies(config)
  const harness = proxies.filter((entry) => isHarnessProxy(entry.target))
  // The default `tailscale serve --bg <port>` owns the HTTPS root handler.
  // Refuse to overwrite a different root proxy configured by the user.
  const rootConflict = proxies.find((entry) => {
    if (!entry.path.includes('/') || isHarnessProxy(entry.target)) return false
    if (dnsName === null) return true
    return entry.path.some((part) => part === dnsName || part.startsWith(`${dnsName}:`))
  })?.target ?? null
  return { ok: true, serveActive: harness.length > 0, rootConflict, proxyCount: proxies.length }
}

/** GET a URL with a timeout; returns { status, ok, body } or a zero-status error. */
async function fetchText(url, { timeoutMs = 8000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    const text = await res.text()
    return { status: res.status, ok: res.ok, body: text.slice(0, 300) }
  } catch (error) {
    return { status: 0, ok: false, error: String(error?.message ?? error).slice(0, 200) }
  } finally {
    clearTimeout(timer)
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
 * content in memory, re-parses it to confirm the write round-trips, backs up
 * the live file, and only then writes it. Returns { ok, hosts } or
 * { ok: false, error }.
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
    // back up the live file, then rewrite; restore the backup on a failed write
    const backup = `${PATCH_FILE}.bak`
    if (existsSync(PATCH_FILE)) copyFileSync(PATCH_FILE, backup)
    try {
      writeFileSync(PATCH_FILE, next)
    } catch (writeError) {
      try { copyFileSync(backup, PATCH_FILE) } catch { /* nothing left to do */ }
      return { ok: false, error: String(writeError?.message ?? writeError) }
    }
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
    if (rest.length !== 1 || !/^\d{1,5}$/.test(rest[0]) || Number(rest[0]) > 65535) return false
    return hostname.test(host)
  }
  return hostname.test(entry)
}

// ---------------------------------------------------------------- tailscale

// Short-lived caches: loading the remote panel fires several /tailscale and
// /trust requests back-to-back, each of which would otherwise spawn a
// `tailscale` subprocess (up to 8s each). A few seconds of memoization keeps
// the UI responsive without hiding a real enable/disable (which invalidates).
let statusCache = { at: 0, checked: false, value: null }
let tailscaleCache = { at: 0, value: null }

/** Parse the full `tailscale status --json` blob (Self + Peer map). */
async function tailscaleStatus() {
  const now = Date.now()
  if (statusCache.checked && now - statusCache.at < TAILSCALE_CACHE_MS) return statusCache.value
  const st = await runCommand(tailscaleCli(), ['status', '--json'], { timeoutMs: 8000 })
  let value = null
  if (st.code === 0) {
    try { value = JSON.parse(st.stdout) } catch { /* status not JSON yet */ }
  }
  statusCache = { at: now, checked: true, value }
  return value
}

function dnsFromStatus(status) {
  const dns = status?.Self?.DNSName
  return typeof dns === 'string' ? dns.replace(/\.$/, '') : null
}

async function tailscaleDnsName() {
  return dnsFromStatus(await tailscaleStatus())
}

async function getTailscale() {
  const now = Date.now()
  if (tailscaleCache.value !== null && now - tailscaleCache.at < TAILSCALE_CACHE_MS) return tailscaleCache.value
  const dnsName = await tailscaleDnsName()
  const sv = await runCommand(tailscaleCli(), ['serve', 'status', '--json'], { timeoutMs: 8000 })
  const inspected = inspectServeStatus(sv, dnsName)
  const value = {
    ok: inspected.ok,
    dnsName,
    serveActive: inspected.serveActive,
    rootConflict: inspected.rootConflict,
    error: inspected.error,
    trustedHosts: readTrustedHosts(),
  }
  tailscaleCache = { at: now, value }
  return value
}

async function enableTailscale() {
  const before = await getTailscale()
  if (!before.ok) return { ok: false, msgKey: 'tailscale.statusFailed', message: before.error }
  if (before.rootConflict !== null && !before.serveActive) {
    return {
      ok: false,
      conflict: true,
      msgKey: 'tailscale.conflict',
      message: `Tailscale 的 HTTPS 根地址已用于其他服务（${before.rootConflict}）。dsh-ops 没有覆盖它。`,
    }
  }
  // Drop caches so the status we report next reflects the change we are making.
  tailscaleCache = { at: 0, value: null }
  statusCache = { at: 0, checked: false, value: null }
  const cli = tailscaleCli()
  const r = await runCommand(cli, ['serve', '--bg', PORT], { timeoutMs: 15000 })
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
  const dns = await tailscaleDnsName()
  let trusted = readTrustedHosts()
  let autoTrusted = false
  if (dns !== null && !trusted.includes(dns)) {
    const w = writeTrustedHosts([...trusted, dns])
    if (w.ok) { trusted = w.hosts; autoTrusted = true }
  }
  const trustedOk = dns !== null && trusted.includes(dns)
  let msgKey = 'tailscale.enabledNoDns'
  let message = 'Serve 已开启（未取到 Tailscale 域名）。'
  if (dns !== null) {
    if (autoTrusted) {
      msgKey = 'tailscale.enabledAutoTrusted'
      message = `远程访问已开启：https://${dns}/ 已自动加入可信主机，重启服务后生效。`
    } else if (trustedOk) {
      msgKey = 'tailscale.enabled'
      message = `远程访问已开启：https://${dns}/`
    } else {
      msgKey = 'tailscale.enabledUntrusted'
      message = `Serve 已开启，但 ${dns} 尚未加入可信主机（可能无法通过 /api 访问）。`
    }
  }
  return {
    ok: true,
    dns,
    url: dns !== null ? `https://${dns}/` : null,
    trustedOk,
    autoTrusted,
    restartRequired: autoTrusted,
    msgKey,
    msgParams: dns !== null ? { dns } : undefined,
    message,
  }
}

async function disableTailscale() {
  const before = await getTailscale()
  if (!before.ok) return { ok: false, msgKey: 'tailscale.statusFailed', message: before.error }
  if (!before.serveActive) return { ok: true, msgKey: 'tailscale.alreadyDisabled', message: 'DeepSeek Harness 远程入口已经关闭。' }

  // Re-run the exact command with `off`; never use `serve reset`, which would
  // erase unrelated Serve endpoints owned by the user or other applications.
  const r = await runCommand(tailscaleCli(), ['serve', '--bg', PORT, 'off'], { timeoutMs: 10000 })
  tailscaleCache = { at: 0, value: null }
  statusCache = { at: 0, checked: false, value: null }
  if (r.code !== 0) {
    return { ok: false, msgKey: 'tailscale.disableFailed', message: (r.stderr || r.stdout || '关闭失败').slice(0, 300) }
  }
  const after = await getTailscale()
  if (!after.ok) return { ok: false, msgKey: 'tailscale.verifyFailed', message: `关闭命令已执行，但无法确认结果：${after.error}` }
  if (after.serveActive) return { ok: false, msgKey: 'tailscale.stillActive', message: '关闭命令已执行，但 Harness 远程入口仍然存在。' }
  return { ok: true, msgKey: 'tailscale.disabled', message: 'DeepSeek Harness 远程入口已关闭；其他 Tailscale Serve 服务未受影响。' }
}

/**
 * Host-side readiness check: prove the tailnet URL answers from this Mac and
 * the configured browser-trust authority is present. A real remote device
 * must still open the URL before the product may claim remote access worked.
 */
async function selfTest() {
  const current = await getTailscale()
  if (!current.ok) {
    return { ok: false, verdict: 'unavailable', message: current.error || '无法检查 Tailscale Serve 状态。' }
  }
  const { dnsName, serveActive } = current
  const trusted = dnsName !== null && readTrustedHosts().includes(dnsName)
  const url = dnsName !== null ? `https://${dnsName}/` : null
  if (!serveActive || dnsName === null) {
    return { ok: true, verdict: 'not-configured', serveActive, dnsName, trusted, url, message: '远程访问尚未开启。' }
  }
  const probe = await fetchText(`${url}dsh-ops/status`, { timeoutMs: 8000 })
  if (!probe.ok) {
    return {
      ok: true,
      verdict: 'not-reachable',
      serveActive, dnsName, trusted, url,
      httpStatus: probe.status,
      httpError: probe.error ?? probe.body,
      message: `Serve 已开启，但本机无法访问 ${url}（${probe.error ?? ('HTTP ' + probe.status)}）。`,
    }
  }
  if (!trusted) {
    return {
      ok: true,
      verdict: 'needs-trust',
      serveActive, dnsName, trusted, url,
      message: `页面可达，但 ${dnsName} 不在可信主机，浏览器 /api 会被拦截；加入可信主机并重启服务后即可访问。`,
    }
  }
  return {
    ok: true,
    verdict: 'host-ready',
    serveActive,
    dnsName,
    trusted,
    url,
    message: `本机端配置已完成。请在已登录同一 Tailnet 的手机或电脑上实际打开 ${url} 完成确认。`,
  }
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
          if (method === 'POST' && !authorizeMutation(request, response)) return
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
        opsVersion: OPS_VERSION,
      })
    })

    route('GET', '/dsh-ops/auth', async (req, res) => {
      sendJson(res, 200, {
        ok: true,
        opsVersion: OPS_VERSION,
        tokenRequired: true,
        // A Tailnet request is proxied from loopback, so Host—not socket address—
        // is the boundary for bootstrap token disclosure.
        token: isLocalHost(req) ? adminToken() : undefined,
      })
    })

    route('GET', '/dsh-ops/tailscale', async (_req, res) => {
      sendJson(res, 200, await getTailscale())
    })

    route('GET', '/dsh-ops/tailscale/selftest', async (_req, res) => {
      sendJson(res, 200, await selfTest())
    })

    route('POST', '/dsh-ops/tailscale/enable', async (_req, res) => {
      sendJson(res, 200, await enableTailscale())
    })

    route('POST', '/dsh-ops/tailscale/disable', async (_req, res) => {
      sendJson(res, 200, await disableTailscale())
    })

    route('GET', '/dsh-ops/trust', async (_req, res) => {
      const status = await tailscaleStatus()
      const dnsName = dnsFromStatus(status)
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
