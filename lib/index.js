/**
 * dsh-ops-console — Host half.
 *
 * Registers a set of HTTP routes on the webServer service that power the
 * settings-page "远程访问" (remote access) panel: Tailscale Serve on/off
 * with one-click self-trust, host-side readiness checks, expiring remote-device
 * pairing, revocable browser sessions, and minimal public health metadata.
 *
 * Status, diagnosis, balance, and service lifecycle are intentionally out of
 * scope — dsh-desktop owns those. The bundle depends only on the `webServer`
 * service and a small local QR encoder; addresses are never sent to an
 * external QR service.
 */
import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { chmodSync, closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import qrcode from 'qrcode-generator'

export const name = 'dsh-ops-console'
export const inject = ['webServer']

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PROFILE_DIR = join(DSH_HOME, 'profiles', argvProfile() ?? 'web')
const PATCH_FILE = join(PROFILE_DIR, 'cordis.patch.yml')
const HOST = process.env.DSH_WEB_HOST ?? '127.0.0.1'
const PORT = process.env.DSH_WEB_PORT ?? '3080'
const OPS_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const ADMIN_TOKEN_FILE = join(DSH_HOME, 'ops-console', 'admin-token')
const AUTH_STATE_FILE = join(DSH_HOME, 'ops-console', 'auth-state.json')
const PATCH_BACKUP_DIR = join(DSH_HOME, 'ops-console', 'config-backups')
const TAILSCALE_APP = '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
const TAILSCALE_BIN = process.env.DSH_OPS_TAILSCALE_BIN?.trim()
const TAILSCALE_CACHE_MS = 4000
const PAIRING_TTL_MS = 5 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const LEGACY_SESSION_TTL_MS = 90 * DAY_MS
const DEFAULT_SESSION_DAYS = 7
const SESSION_DAY_OPTIONS = new Set([1, 7, 30, 90])
const MAX_SESSIONS = 12
const pairings = new Map()
const pairingFailures = new Map()

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

function writeAtomic(file, content, mode = 0o600) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const temp = `${file}.new-${process.pid}-${randomBytes(4).toString('hex')}`
  let fd = null
  try {
    fd = openSync(temp, 'wx', mode)
    writeFileSync(fd, content)
    fsyncSync(fd)
    closeSync(fd)
    fd = null
    chmodSync(temp, mode)
    renameSync(temp, file)
  } catch (error) {
    if (fd !== null) try { closeSync(fd) } catch {}
    rmSync(temp, { force: true })
    throw error
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
  writeAtomic(ADMIN_TOKEN_FILE, token + '\n')
  return token
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function sessionDays(value) {
  const days = Number(value)
  return SESSION_DAY_OPTIONS.has(days) ? days : DEFAULT_SESSION_DAYS
}

function sessionExpiresAt(entry) {
  const explicit = Date.parse(entry?.expiresAt ?? '')
  if (Number.isFinite(explicit)) return explicit
  const touched = Date.parse(entry?.lastSeenAt ?? entry?.createdAt ?? '')
  return Number.isFinite(touched) ? touched + LEGACY_SESSION_TTL_MS : NaN
}

function normalizeSession(entry) {
  const expiresAt = sessionExpiresAt(entry)
  if (!Number.isFinite(expiresAt)) return null
  return { ...entry, expiresAt: new Date(expiresAt).toISOString() }
}

function publicSession(entry) {
  return {
    id: entry.id,
    label: entry.label,
    createdAt: entry.createdAt,
    lastSeenAt: entry.lastSeenAt,
    expiresAt: new Date(sessionExpiresAt(entry)).toISOString(),
  }
}

function remoteUrlQrSvg(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || value.length > 512) return null
    const qr = qrcode(0, 'M')
    qr.addData(url.toString(), 'Byte')
    qr.make()
    return qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true })
  } catch {
    return null
  }
}

function readAuthState() {
  try {
    const parsed = JSON.parse(readFileSync(AUTH_STATE_FILE, 'utf8'))
    const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : []
    const now = Date.now()
    return {
      version: 2,
      lastRemoteVerifiedAt: typeof parsed?.lastRemoteVerifiedAt === 'string' ? parsed.lastRemoteVerifiedAt : null,
      sessions: sessions.map(normalizeSession).filter((entry) => {
        if (entry === null) return false
        const expiresAt = Date.parse(entry.expiresAt)
        return typeof entry?.id === 'string' && typeof entry?.tokenHash === 'string' && Number.isFinite(expiresAt) && expiresAt > now
      }).slice(-MAX_SESSIONS),
    }
  } catch {
    return { version: 2, lastRemoteVerifiedAt: null, sessions: [] }
  }
}

function saveAuthState(state) {
  writeAtomic(AUTH_STATE_FILE, JSON.stringify(state, null, 2) + '\n')
}

function suppliedToken(request) {
  return String(request.headers['x-dsh-ops-token'] ?? '').trim()
}

function findSession(token) {
  if (!token) return null
  const digest = hashToken(token)
  return readAuthState().sessions.find((entry) => entry.tokenHash === digest) ?? null
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
  const supplied = Buffer.from(suppliedToken(request))
  if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return true
  return findSession(supplied.toString()) !== null
}

function hasLocalManagement(request) {
  if (!isLocalHost(request)) return false
  const expected = Buffer.from(adminToken())
  const supplied = Buffer.from(suppliedToken(request))
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

function pairingSourceKey(request) {
  // Tailscale Serve strips spoofed identity headers and injects the verified
  // login for tailnet traffic. Tagged devices do not receive that header, so
  // retain network-address fallbacks for those requests and local test rigs.
  const tailscaleLogin = String(request.headers['tailscale-user-login'] ?? '').trim()
  const forwarded = String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  const source = tailscaleLogin || forwarded || request.socket?.remoteAddress || request.connection?.remoteAddress || 'unknown'
  return hashToken(String(source)).slice(0, 24)
}

function recentPairingFailures(sourceKey) {
  const now = Date.now()
  const recent = (pairingFailures.get(sourceKey) ?? []).filter((at) => now - at < PAIRING_TTL_MS)
  if (recent.length > 0) pairingFailures.set(sourceKey, recent)
  else pairingFailures.delete(sourceKey)
  return recent
}

function pairingRateAllowed(sourceKey) {
  return recentPairingFailures(sourceKey).length < 8
}

function createPairingCode(requestedSessionDays) {
  const now = Date.now()
  const keepDays = sessionDays(requestedSessionDays)
  pairings.clear()
  let code
  do code = String(randomInt(100000, 1000000))
  while (pairings.has(code))
  const expiresAt = now + PAIRING_TTL_MS
  pairings.set(code, { expiresAt, sessionDays: keepDays })
  return { code, expiresAt: new Date(expiresAt).toISOString(), sessionDays: keepDays }
}

function cancelPairingCodes() {
  const removed = pairings.size
  pairings.clear()
  return removed
}

function redeemPairingCode(code, label, sourceKey) {
  if (!pairingRateAllowed(sourceKey)) return { ok: false, status: 429, error: '这台设备的配对尝试过多，请五分钟后重试。' }
  const entry = pairings.get(code)
  if (!entry || entry.expiresAt <= Date.now()) {
    pairings.delete(code)
    const failures = recentPairingFailures(sourceKey)
    pairingFailures.set(sourceKey, [...failures, Date.now()])
    return { ok: false, status: 401, error: '配对码无效或已过期。' }
  }
  pairings.delete(code)
  pairingFailures.delete(sourceKey)
  const token = randomBytes(32).toString('base64url')
  const nowMs = Date.now()
  const now = new Date(nowMs).toISOString()
  const expiresAt = new Date(nowMs + sessionDays(entry.sessionDays) * DAY_MS).toISOString()
  const state = readAuthState()
  const session = {
    id: randomBytes(8).toString('hex'),
    tokenHash: hashToken(token),
    label: String(label || '远程浏览器').trim().slice(0, 60) || '远程浏览器',
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  }
  state.sessions = [...state.sessions, session].slice(-MAX_SESSIONS)
  state.lastRemoteVerifiedAt = now
  saveAuthState(state)
  return { ok: true, token, session: publicSession(session), verifiedAt: now }
}

function touchRemoteSession(request) {
  const token = suppliedToken(request)
  const digest = hashToken(token)
  const state = readAuthState()
  const session = state.sessions.find((entry) => entry.tokenHash === digest)
  if (!session) return null
  const now = new Date().toISOString()
  session.lastSeenAt = now
  state.lastRemoteVerifiedAt = now
  saveAuthState(state)
  return { id: session.id, label: session.label, lastSeenAt: now, expiresAt: session.expiresAt }
}

function revokeAllSessions() {
  const state = readAuthState()
  const removed = state.sessions.length
  state.sessions = []
  saveAuthState(state)
  return removed
}

function rotateMasterToken() {
  if (process.env.DSH_OPS_ADMIN_TOKEN?.trim()) {
    return { ok: false, error: '主管理令牌由环境变量提供，无法在界面中轮换。' }
  }
  const token = randomBytes(32).toString('base64url')
  writeAtomic(ADMIN_TOKEN_FILE, token + '\n')
  return { ok: true, token }
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

// The connection plugin reads trustedHosts at boot. Keeping that boot-time
// snapshot lets the UI distinguish an on-disk edit from a change that is
// already active, without giving this optional plugin restart authority.
const ACTIVE_TRUSTED_HOSTS = readTrustedHosts()

function trustRestartPending(hosts = readTrustedHosts()) {
  return JSON.stringify(hosts) !== JSON.stringify(ACTIVE_TRUSTED_HOSTS)
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
    // Preserve a bounded history, then fsync + atomically rename in the same
    // directory. A crash can leave an unused temp file, never a truncated live
    // profile. Existing file permissions are retained.
    const mode = existsSync(PATCH_FILE) ? statSync(PATCH_FILE).mode & 0o777 : 0o600
    if (existsSync(PATCH_FILE)) {
      mkdirSync(PATCH_BACKUP_DIR, { recursive: true, mode: 0o700 })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      copyFileSync(PATCH_FILE, join(PATCH_BACKUP_DIR, `cordis.patch-${stamp}.yml`))
      const backups = readdirSync(PATCH_BACKUP_DIR).filter((name) => name.startsWith('cordis.patch-')).sort()
      while (backups.length > 5) rmSync(join(PATCH_BACKUP_DIR, backups.shift()), { force: true })
    }
    writeAtomic(PATCH_FILE, next, mode)
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

/** Parse the full `tailscale status --json` blob and preserve stopped/error state. */
async function tailscaleStatus() {
  const now = Date.now()
  if (statusCache.checked && now - statusCache.at < TAILSCALE_CACHE_MS) return statusCache.value
  const st = await runCommand(tailscaleCli(), ['status', '--json'], { timeoutMs: 8000 })
  let value
  if (st.code === 0) {
    try {
      value = { ok: true, status: JSON.parse(st.stdout), error: null }
    } catch {
      value = { ok: false, status: null, error: 'Tailscale 状态无法解析。' }
    }
  } else {
    value = { ok: false, status: null, error: (st.stderr || st.stdout || '无法读取 Tailscale 状态').slice(0, 300) }
  }
  statusCache = { at: now, checked: true, value }
  return value
}

function dnsFromStatus(status) {
  const dns = status?.Self?.DNSName
  return typeof dns === 'string' ? dns.replace(/\.$/, '') : null
}

async function tailscaleDnsName() {
  return dnsFromStatus((await tailscaleStatus()).status)
}

async function getTailscale() {
  const now = Date.now()
  if (tailscaleCache.value !== null && now - tailscaleCache.at < TAILSCALE_CACHE_MS) return tailscaleCache.value
  const ts = await tailscaleStatus()
  const dnsName = dnsFromStatus(ts.status)
  const sv = await runCommand(tailscaleCli(), ['serve', 'status', '--json'], { timeoutMs: 8000 })
  const inspected = inspectServeStatus(sv, dnsName)
  const backendState = typeof ts.status?.BackendState === 'string' ? ts.status.BackendState : null
  const online = ts.status?.Self?.Online === true
  const tailscaleRunning = ts.ok && backendState === 'Running' && online
  const health = Array.isArray(ts.status?.Health) ? ts.status.Health.filter((item) => typeof item === 'string').slice(0, 3) : []
  let guidance = null
  if (!ts.ok) guidance = '无法读取 Tailscale 状态。请确认已经安装 Tailscale，然后重新检查。'
  else if (backendState === 'NeedsLogin') guidance = 'Tailscale 尚未登录。请先在这台 Mac 上完成登录。'
  else if (backendState === 'Starting') guidance = 'Tailscale 正在启动，请稍候再检查。'
  else if (backendState !== 'Running') guidance = 'Tailscale 当前未运行。请先打开 Tailscale。'
  else if (!online) guidance = 'Tailscale 已打开，但这台 Mac 尚未联网。请检查网络或登录状态。'
  const value = {
    ok: ts.ok && inspected.ok,
    dnsName,
    serveActive: inspected.serveActive,
    tailscaleRunning,
    backendState,
    online,
    health,
    guidance,
    rootConflict: inspected.rootConflict,
    error: ts.error || inspected.error,
    trustedHosts: readTrustedHosts(),
  }
  tailscaleCache = { at: now, value }
  return value
}

async function enableTailscale() {
  const before = await getTailscale()
  if (!before.ok) return { ok: false, msgKey: 'tailscale.statusFailed', message: before.error }
  if (!before.tailscaleRunning) {
    return { ok: false, tailscaleStopped: true, msgKey: 'tailscale.stopped', message: 'Tailscale 当前未运行。请先打开并登录 Tailscale，再重新检查。' }
  }
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
      message = `远程访问已开启：https://${dns}/ 已自动加入 Harness 接受的访问地址，重启服务后生效。`
    } else if (trustedOk) {
      msgKey = 'tailscale.enabled'
      message = `远程访问已开启：https://${dns}/`
    } else {
      msgKey = 'tailscale.enabledUntrusted'
      message = `Serve 已开启，但 ${dns} 尚未加入 Harness 接受的访问地址（可能无法通过 /api 访问）。`
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
  if (!before.tailscaleRunning) return { ok: false, tailscaleStopped: true, msgKey: 'tailscale.stopped', message: 'Tailscale 当前未运行，无法安全确认关闭结果。请先启动 Tailscale。' }
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

async function tightenRemoteAccess() {
  const closed = await disableTailscale()
  const cancelledPairings = cancelPairingCodes()
  const removedSessions = revokeAllSessions()
  if (!closed.ok) {
    return {
      ok: false,
      partial: true,
      entranceClosed: false,
      cancelledPairings,
      removedSessions,
      message: `已取消确认码并撤销 ${removedSessions} 条远程确认记录，但无法确认入口已经关闭：${closed.message || closed.error || '未知原因'}`,
    }
  }
  return {
    ok: true,
    entranceClosed: true,
    cancelledPairings,
    removedSessions,
    message: `远程入口已关闭，当前确认码已取消，并撤销了 ${removedSessions} 条远程确认记录。其他 Tailscale Serve 服务未受影响。`,
  }
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
  if (!current.tailscaleRunning) {
    return { ok: true, verdict: 'tailscale-stopped', serveActive: current.serveActive, dnsName: current.dnsName, message: '远程入口配置仍在，但 Tailscale 当前未运行。请先打开并登录 Tailscale。' }
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
      message: `页面可达，但 ${dnsName} 不在 Harness 接受的访问地址中，浏览器 /api 会被拦截；加入后重启服务即可访问。`,
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

    const route = (method, path, handler, { authorization = method === 'POST' ? 'local-management' : 'none' } = {}) => {
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
          if (authorization === 'local-management') {
            if (!isLocalHost(request)) {
              sendJson(response, 403, { ok: false, error: '只能在这台 Mac 上管理远程入口。', localRequired: true })
              return
            }
            if (!hasLocalManagement(request)) {
              sendJson(response, 401, { ok: false, error: '需要 dsh-ops 本机管理授权', authRequired: true })
              return
            }
          }
          if (authorization === 'session' && !hasAdminToken(request)) {
            sendJson(response, 401, { ok: false, error: '需要 dsh-ops 管理授权', authRequired: true })
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
        opsVersion: OPS_VERSION,
      })
    })

    route('GET', '/dsh-ops/auth', async (req, res) => {
      const local = isLocalHost(req)
      const session = findSession(suppliedToken(req))
      const state = readAuthState()
      sendJson(res, 200, {
        ok: true,
        opsVersion: OPS_VERSION,
        tokenRequired: true,
        local,
        paired: local || session !== null,
        token: local ? adminToken() : undefined,
        session: session ? publicSession(session) : null,
        lastRemoteVerifiedAt: state.lastRemoteVerifiedAt,
      })
    })

    route('POST', '/dsh-ops/pairing/create', async (req, res) => {
      if (!isLocalHost(req)) { sendJson(res, 403, { ok: false, error: '只能在这台 Mac 上创建配对码。' }); return }
      const body = await readJsonBody(req)
      if (body?.error) { sendJson(res, 400, { ok: false, error: body.error }); return }
      const pairing = createPairingCode(body?.sessionDays)
      const access = await getTailscale()
      const hosts = readTrustedHosts()
      const ready = access.tailscaleRunning === true && access.serveActive === true && access.dnsName !== null && hosts.includes(access.dnsName) && !trustRestartPending(hosts)
      const url = ready ? `https://${access.dnsName}/` : null
      const qrSvg = url === null ? null : remoteUrlQrSvg(url)
      sendJson(res, 200, { ok: true, ...pairing, invitation: url !== null && qrSvg !== null ? { url, qrSvg } : null })
    })

    route('POST', '/dsh-ops/pairing/cancel', async (req, res) => {
      if (!isLocalHost(req)) { sendJson(res, 403, { ok: false, error: '只能在这台 Mac 上取消配对码。' }); return }
      sendJson(res, 200, { ok: true, removed: cancelPairingCodes(), message: '当前配对码已取消。' })
    })

    route('POST', '/dsh-ops/pairing/redeem', async (req, res) => {
      if (isLocalHost(req)) { sendJson(res, 400, { ok: false, error: '本机页面无需配对。' }); return }
      const body = await readJsonBody(req)
      if (body?.error) { sendJson(res, 400, { ok: false, error: body.error }); return }
      const result = redeemPairingCode(String(body?.code ?? '').trim(), body?.label, pairingSourceKey(req))
      sendJson(res, result.status ?? 200, result)
    }, { authorization: 'origin' })

    route('POST', '/dsh-ops/remote/checkin', async (req, res) => {
      if (isLocalHost(req)) { sendJson(res, 200, { ok: true, local: true }); return }
      const session = touchRemoteSession(req)
      if (!session) { sendJson(res, 401, { ok: false, error: '远程授权已失效。', authRequired: true }); return }
      sendJson(res, 200, { ok: true, verifiedAt: session.lastSeenAt, session })
    }, { authorization: 'session' })

    route('GET', '/dsh-ops/sessions', async (req, res) => {
      if (!isLocalHost(req) || !hasAdminToken(req)) { sendJson(res, 403, { ok: false, error: '只能在这台 Mac 上查看已配对设备。' }); return }
      const state = readAuthState()
      sendJson(res, 200, {
        ok: true,
        lastRemoteVerifiedAt: state.lastRemoteVerifiedAt,
        sessions: state.sessions.map(publicSession),
      })
    })

    route('POST', '/dsh-ops/sessions/revoke', async (req, res) => {
      if (!isLocalHost(req)) { sendJson(res, 403, { ok: false, error: '只能在这台 Mac 上撤销设备。' }); return }
      const body = await readJsonBody(req)
      if (body?.error) { sendJson(res, 400, { ok: false, error: body.error }); return }
      const state = readAuthState()
      const before = state.sessions.length
      state.sessions = state.sessions.filter((entry) => entry.id !== String(body?.id ?? ''))
      saveAuthState(state)
      sendJson(res, 200, { ok: true, removed: before - state.sessions.length })
    })

    route('POST', '/dsh-ops/sessions/revoke-all', async (req, res) => {
      if (!isLocalHost(req)) { sendJson(res, 403, { ok: false, error: '只能在这台 Mac 上撤销设备。' }); return }
      sendJson(res, 200, { ok: true, removed: revokeAllSessions() })
    })

    route('POST', '/dsh-ops/auth/rotate-master', async (req, res) => {
      if (!isLocalHost(req)) { sendJson(res, 403, { ok: false, error: '只能在这台 Mac 上轮换主管理授权。' }); return }
      sendJson(res, 200, rotateMasterToken())
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

    route('POST', '/dsh-ops/security/tighten', async (req, res) => {
      const body = await readJsonBody(req)
      if (body?.error) { sendJson(res, 400, { ok: false, error: body.error }); return }
      if (body?.confirm !== 'tighten-remote-access') {
        sendJson(res, 400, { ok: false, error: '需要明确确认关闭入口并撤销全部远程记录。', confirmationRequired: true })
        return
      }
      sendJson(res, 200, await tightenRemoteAccess())
    }, { authorization: 'local-management' })

    route('GET', '/dsh-ops/trust', async (_req, res) => {
      const status = await tailscaleStatus()
      const dnsName = dnsFromStatus(status.status)
      const hosts = readTrustedHosts()
      sendJson(res, 200, {
        ok: true,
        hosts,
        activeHosts: ACTIVE_TRUSTED_HOSTS,
        pendingRestart: trustRestartPending(hosts),
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
        sendJson(res, 200, { ok: true, hosts: current, restartRequired: true, msgKey: 'trust.duplicate', msgParams: { host }, message: `「${host}」已在 Harness 接受的访问地址中。` })
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
        sendJson(res, 200, { ok: true, hosts: current, msgKey: 'trust.absent', msgParams: { host }, message: `「${host}」不在 Harness 接受的访问地址中。` })
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
