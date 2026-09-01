#!/usr/bin/env node
/**
 * dsh-ops-console verification: syntax, browser-module load, standalone
 * HTTP routes and a real throwaway dsh web boot. No Guardian is required.
 */
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const HOME = homedir()
const LIVE_PROFILE_NM = join(process.env.DSH_HOME ?? join(HOME, '.dsh'), 'profiles', 'web', 'node_modules')
const SMOKE_HOME = join(ROOT, '.smoke-dsh')
const SMOKE_PROFILE = join(SMOKE_HOME, 'profiles', 'ops-smoke')
let failures = 0
const ok = (text) => console.log('  ✓ ' + text)
const bad = (text) => { console.log('  ✗ ' + text); failures++ }

function resolveDshBin() {
  if (process.env.DSH_BIN && existsSync(process.env.DSH_BIN)) return process.env.DSH_BIN
  const found = spawnSync('which', ['dsh'], { encoding: 'utf8' })
  if (found.status === 0 && found.stdout.trim()) return found.stdout.trim()
  try {
    const engine = JSON.parse(readFileSync(join(process.env.DSH_HOME ?? join(HOME, '.dsh'), 'guardian', 'engine.json'), 'utf8'))
    if (typeof engine?.active === 'string' && existsSync(engine.active)) return engine.active
  } catch {}
  const root = join(HOME, '.npm', '_npx')
  let newest = null
  try {
    for (const entry of readdirSync(root)) {
      const candidate = join(root, entry, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
      if (existsSync(candidate) && (newest === null || statSync(candidate).mtimeMs > statSync(newest).mtimeMs)) newest = candidate
    }
  } catch {}
  return newest
}

function gate1() {
  console.log('gate 1 — syntax and manifest')
  for (const file of ['lib/index.js', 'lib/client.js', 'scripts/deploy.mjs', 'scripts/rollback.mjs']) {
    const result = spawnSync(process.execPath, ['--check', join(ROOT, file)], { encoding: 'utf8' })
    if (result.status === 0) ok(file + ' parses')
    else bad(file + ' syntax error: ' + result.stderr.slice(0, 500))
  }
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const guardian = pkg?.dsh?.guardian
    if (guardian?.healthPath === '/dsh-ops/status' && Number(guardian?.protocolVersion) >= 1) ok('manifest declares a passive Guardian health contract')
    else bad('manifest must declare dsh.guardian.healthPath = /dsh-ops/status (protocolVersion >= 1)')
    if (pkg.version === '0.6.2' && pkg.publishConfig?.access === 'public' && pkg.publishConfig?.registry === 'https://registry.npmjs.org/') ok('manifest is ready for the public npm release')
    else bad('manifest must declare the 0.6.2 public npm release contract')
    if (pkg.dependencies?.['qrcode-generator'] === '2.0.4') ok('manifest pins the dependency-free local QR encoder')
    else bad('manifest must pin qrcode-generator 2.0.4')
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
    if (readme.includes('dsh plugin --profile web add dsh-ops-console') && readme.includes('github:wendyltan/dsh-ops-console') && !readme.includes('目前 npm 版本尚未发布')) ok('README presents npm as the primary install path and GitHub as an alternative')
    else bad('README must present npm as the primary install path without deferred-release wording')
    const deploySource = readFileSync(join(ROOT, 'scripts', 'deploy.mjs'), 'utf8')
    if (deploySource.includes("Object.keys(manifest.dependencies ?? {})") && deploySource.includes('candidate cannot load independently')) ok('local deployment carries and independently loads runtime dependencies')
    else bad('local deployment does not verify its runtime dependencies')
  } catch (error) { bad('package.json invalid: ' + error.message) }
}

function gate2() {
  console.log('gate 2 — client bundle load')
  try {
    const src = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
    const React = { createElement: () => ({}), Fragment: Symbol('Fragment'), useState: () => [], useEffect: () => {}, useCallback: (fn) => fn }
    let captured = null
    const windowStub = { __ModuleLoader__: { load: (spec) => { captured = spec.factory((id) => { if (id === 'react') return React; throw new Error('unexpected dependency: ' + id) }) } } }
    new Function('window', 'require', 'console', src)(windowStub, () => {}, console)
    if (captured?.name === 'dsh-ops-console' && typeof captured.apply === 'function') ok('client factory exports an installable settings section')
    else bad('client factory did not export name/apply')
    for (const text of ['取消确认码', '复制地址', '复制连接说明', '扫描二维码', '二维码只包含访问地址', '记录保留', '立即收紧访问', '每 15 秒自动更新', '访问地址已保存，但尚未生效', '远程入口已开启', 'Tailscale ACL 仍是实际访问权限来源', 'auth.data?.local === true', 'color-mix', 'min-height: 42px']) {
      if (src.includes(text)) ok('client includes interaction: ' + text)
      else bad('client is missing interaction: ' + text)
    }
  } catch (error) { bad('client bundle crashed: ' + error.message) }
}

function invoke(route, { method = 'GET', url = '/', headers = {}, body = '' } = {}) {
  return new Promise((resolve) => {
    let status = 0; let output = ''
    const request = {
      method, url, headers,
      on(event, handler) {
        if (event === 'data' && body) handler(Buffer.from(body))
        if (event === 'end') handler()
        return request
      },
    }
    const response = { writeHead: (code) => { status = code }, end: (text = '') => { output = text; resolve({ status, output }) } }
    Promise.resolve(route.handler(request, response)).catch((error) => resolve({ status: 0, output: String(error) }))
  })
}

async function gate3() {
  console.log('gate 3 — standalone route contract')
  const home = mkdtempSync(join(tmpdir(), 'dsh-ops-verify-'))
  const oldHome = process.env.DSH_HOME
  const oldToken = process.env.DSH_OPS_ADMIN_TOKEN
  const oldTailscale = process.env.DSH_OPS_TAILSCALE_BIN
  const oldTailscaleState = process.env.DSH_OPS_TEST_TS_STATE
  const oldTailscaleLog = process.env.DSH_OPS_TEST_TS_LOG
  const oldTailscaleRuntime = process.env.DSH_OPS_TEST_TS_RUNTIME
  process.env.DSH_HOME = home
  process.env.DSH_OPS_ADMIN_TOKEN = 'v'.repeat(48)
  mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
  writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), '- id: connection\n  config:\n    trustedHosts:\n      - dsh-host.example.ts.net\n')
  const tailscaleState = join(home, 'tailscale-serve.json')
  const tailscaleLog = join(home, 'tailscale.log')
  const tailscaleRuntime = join(home, 'tailscale-runtime.json')
  const fakeTailscale = join(home, 'tailscale.mjs')
  writeFileSync(tailscaleState, JSON.stringify({
    Web: {
      'dsh-host.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3080' } } },
      'other-service.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:9999' } } },
    },
  }))
  writeFileSync(tailscaleRuntime, JSON.stringify({ BackendState: 'Running', Health: [], Self: { DNSName: 'dsh-host.example.ts.net.', Online: true }, Peer: {} }))
  writeFileSync(fakeTailscale, `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
appendFileSync(process.env.DSH_OPS_TEST_TS_LOG, JSON.stringify(args) + '\\n')
if (args[0] === 'status' && args[1] === '--json') {
  process.stdout.write(readFileSync(process.env.DSH_OPS_TEST_TS_RUNTIME, 'utf8'))
} else if (args[0] === 'serve' && args[1] === 'status') {
  process.stdout.write(readFileSync(process.env.DSH_OPS_TEST_TS_STATE, 'utf8'))
} else if (args[0] === 'serve' && args.at(-1) === 'off') {
  const config = JSON.parse(readFileSync(process.env.DSH_OPS_TEST_TS_STATE, 'utf8'))
  for (const authority of Object.keys(config.Web || {})) {
    const handlers = config.Web[authority]?.Handlers || {}
    for (const path of Object.keys(handlers)) {
      if (handlers[path]?.Proxy === 'http://127.0.0.1:3080') delete handlers[path]
    }
    if (Object.keys(handlers).length === 0) delete config.Web[authority]
  }
  writeFileSync(process.env.DSH_OPS_TEST_TS_STATE, JSON.stringify(config))
} else {
  process.stderr.write('unexpected fake tailscale command: ' + args.join(' '))
  process.exitCode = 2
}
`)
  chmodSync(fakeTailscale, 0o755)
  process.env.DSH_OPS_TAILSCALE_BIN = fakeTailscale
  process.env.DSH_OPS_TEST_TS_STATE = tailscaleState
  process.env.DSH_OPS_TEST_TS_LOG = tailscaleLog
  process.env.DSH_OPS_TEST_TS_RUNTIME = tailscaleRuntime
  const handlers = new Map()
  try {
    const mod = await import(new URL('../lib/index.js?verify=' + Date.now(), import.meta.url))
    mod.apply({ credentials: undefined, webServer: { register: (route) => { handlers.set(route.path, route); return () => {} } }, effect: (fn) => fn() })
    const expected = ['/dsh-ops/status', '/dsh-ops/tailscale', '/dsh-ops/tailscale/selftest', '/dsh-ops/trust', '/dsh-ops/auth']
    for (const path of expected) {
      const route = handlers.get(path)
      if (!route) { bad(path + ' route missing'); continue }
      const result = await invoke(route, { url: path })
      const data = JSON.parse(result.output)
      if (result.status === 200 && data.ok === true) ok(path + ' returns usable JSON')
      else bad(path + ' failed: ' + result.output.slice(0, 300))
    }
    for (const path of ['/dsh-ops/pairing/create', '/dsh-ops/pairing/cancel', '/dsh-ops/pairing/redeem', '/dsh-ops/remote/checkin', '/dsh-ops/sessions', '/dsh-ops/sessions/revoke', '/dsh-ops/sessions/revoke-all', '/dsh-ops/auth/rotate-master', '/dsh-ops/security/tighten']) {
      if (handlers.has(path)) ok(path + ' route registered')
      else bad(path + ' route missing')
    }
    const publicStatus = JSON.parse((await invoke(handlers.get('/dsh-ops/status'), { url: '/dsh-ops/status' })).output)
    if (!('pid' in publicStatus) && !('port' in publicStatus) && !('engine' in publicStatus) && !('url' in publicStatus)) ok('public health omits process and engine details')
    else bad('public health leaks implementation details: ' + JSON.stringify(publicStatus))
    const publicTrust = JSON.parse((await invoke(handlers.get('/dsh-ops/trust'), { url: '/dsh-ops/trust' })).output)
    if (!('patchFile' in publicTrust)) ok('trust response omits the local profile path')
    else bad('trust response leaks local path: ' + JSON.stringify(publicTrust))
    const removed = ['/dsh-ops/summary', '/dsh-ops/diagnose', '/dsh-ops/timeline', '/dsh-ops/report', '/dsh-ops/balance', '/dsh-ops/settings', '/dsh-ops/settings/save', '/dsh-ops/logs']
    for (const path of removed) {
      if (handlers.has(path)) bad(path + ' route should have been removed')
      else ok(path + ' is no longer registered')
    }
    if (!handlers.has('/dsh-ops/guardian') && !handlers.has('/dsh-ops/restart') && !handlers.has('/dsh-ops/preflight')) ok('no Guardian control routes are registered')
    else bad('obsolete Guardian control route remains registered')
    const add = handlers.get('/dsh-ops/trust/add')
    const denied = await invoke(add, { method: 'POST', url: '/dsh-ops/trust/add', headers: { origin: 'http://localhost', host: 'localhost' }, body: JSON.stringify({ host: 'mac-mini.ts.net' }) })
    if (denied.status === 401 && JSON.parse(denied.output).authRequired === true) ok('writes still require an admin token')
    else bad('write authentication guard failed: ' + denied.output)
    const crossSite = await invoke(add, { method: 'POST', url: '/dsh-ops/trust/add', headers: {}, body: '{}' })
    if (crossSite.status === 403) ok('writes still reject untrusted origins')
    else bad('CSRF guard failed: ' + crossSite.output)

    const authHeaders = { origin: 'http://localhost', host: 'localhost', 'x-dsh-ops-token': 'v'.repeat(48) }
    const remoteHeaders = { origin: 'https://dsh-host.example.ts.net', host: 'dsh-host.example.ts.net' }
    const created = await invoke(handlers.get('/dsh-ops/pairing/create'), { method: 'POST', url: '/dsh-ops/pairing/create', headers: authHeaders })
    const createdData = JSON.parse(created.output)
    if (created.status === 200 && /^\d{6}$/.test(createdData.code)) ok('local page creates a six-digit expiring pairing code')
    else bad('pairing code creation failed: ' + created.output)
    const qrSvg = createdData.invitation?.qrSvg ?? ''
    if (createdData.invitation?.url === 'https://dsh-host.example.ts.net/' && qrSvg.startsWith('<svg') && qrSvg.includes('<path') && !qrSvg.includes(createdData.code)) ok('pairing includes a local SVG QR for the address without embedding the pairing code')
    else bad('local QR invitation failed: ' + JSON.stringify(createdData.invitation))
    const cancelled = await invoke(handlers.get('/dsh-ops/pairing/cancel'), { method: 'POST', url: '/dsh-ops/pairing/cancel', headers: authHeaders })
    const cancelledData = JSON.parse(cancelled.output)
    const cancelledRedeem = await invoke(handlers.get('/dsh-ops/pairing/redeem'), {
      method: 'POST', url: '/dsh-ops/pairing/redeem', headers: { ...remoteHeaders, 'x-forwarded-for': '100.64.0.10' },
      body: JSON.stringify({ code: createdData.code, label: 'Cancelled phone' }),
    })
    if (cancelledData.ok && cancelledData.removed === 1 && cancelledRedeem.status === 401) ok('local page can cancel the current pairing code')
    else bad('pairing cancellation failed')
    const replacement = JSON.parse((await invoke(handlers.get('/dsh-ops/pairing/create'), {
      method: 'POST', url: '/dsh-ops/pairing/create', headers: authHeaders, body: JSON.stringify({ sessionDays: 7 }),
    })).output)
    const redeemed = await invoke(handlers.get('/dsh-ops/pairing/redeem'), {
      method: 'POST', url: '/dsh-ops/pairing/redeem', headers: remoteHeaders,
      body: JSON.stringify({ code: replacement.code, label: 'Test phone' }),
    })
    const redeemedData = JSON.parse(redeemed.output)
    const retainedMs = Date.parse(redeemedData.session?.expiresAt ?? '') - Date.parse(redeemedData.session?.createdAt ?? '')
    if (redeemed.status === 200 && redeemedData.ok && typeof redeemedData.token === 'string' && replacement.sessionDays === 7 && retainedMs === 7 * 24 * 60 * 60 * 1000) ok('remote browser redeems pairing code with the selected fixed retention')
    else bad('pairing redemption failed: ' + redeemed.output)
    const sessionHeaders = { ...remoteHeaders, 'x-dsh-ops-token': redeemedData.token }
    const remoteAuth = JSON.parse((await invoke(handlers.get('/dsh-ops/auth'), { url: '/dsh-ops/auth', headers: sessionHeaders })).output)
    if (remoteAuth.paired === true && remoteAuth.token === undefined) ok('remote auth recognizes the session without disclosing the master token')
    else bad('remote session auth failed: ' + JSON.stringify(remoteAuth))
    const checkedIn = JSON.parse((await invoke(handlers.get('/dsh-ops/remote/checkin'), { method: 'POST', url: '/dsh-ops/remote/checkin', headers: sessionHeaders })).output)
    if (checkedIn.ok && checkedIn.verifiedAt) ok('paired remote browser records an actual verification check-in')
    else bad('remote verification check-in failed: ' + JSON.stringify(checkedIn))
    const remoteDisable = await invoke(handlers.get('/dsh-ops/tailscale/disable'), { method: 'POST', url: '/dsh-ops/tailscale/disable', headers: sessionHeaders })
    const remoteTrust = await invoke(add, { method: 'POST', url: '/dsh-ops/trust/add', headers: sessionHeaders, body: JSON.stringify({ host: 'remote-change.example.ts.net' }) })
    const remoteTighten = await invoke(handlers.get('/dsh-ops/security/tighten'), { method: 'POST', url: '/dsh-ops/security/tighten', headers: sessionHeaders, body: JSON.stringify({ confirm: 'tighten-remote-access' }) })
    if (remoteDisable.status === 403 && remoteTrust.status === 403 && remoteTighten.status === 403 && JSON.parse(remoteDisable.output).localRequired === true) ok('paired remote devices cannot manage or tighten the Mac remote-access configuration')
    else bad('remote session unexpectedly retained local management privileges')
    const sessionList = JSON.parse((await invoke(handlers.get('/dsh-ops/sessions'), { url: '/dsh-ops/sessions', headers: authHeaders })).output)
    if (sessionList.sessions?.length === 1 && sessionList.sessions[0].label === 'Test phone' && sessionList.sessions[0].expiresAt) ok('local page lists paired sessions with expiry and without token hashes')
    else bad('paired session listing failed: ' + JSON.stringify(sessionList))
    if (!JSON.stringify(sessionList).includes('tokenHash')) ok('session listing never exposes token hashes')
    else bad('session listing leaked a token hash')
    const authStateFile = join(home, 'ops-console', 'auth-state.json')
    const legacyState = JSON.parse(readFileSync(authStateFile, 'utf8'))
    legacyState.version = 1
    for (const session of legacyState.sessions) delete session.expiresAt
    writeFileSync(authStateFile, JSON.stringify(legacyState))
    const legacyAuth = JSON.parse((await invoke(handlers.get('/dsh-ops/auth'), { url: '/dsh-ops/auth', headers: sessionHeaders })).output)
    const legacyRetention = Date.parse(legacyAuth.session?.expiresAt ?? '') - Date.parse(legacyAuth.session?.lastSeenAt ?? '')
    if (legacyAuth.paired === true && legacyRetention === 90 * 24 * 60 * 60 * 1000) ok('existing 0.6.x sessions migrate without unexpected sign-out')
    else bad('legacy session compatibility failed: ' + JSON.stringify(legacyAuth))

    const validAdd = await invoke(add, { method: 'POST', url: '/dsh-ops/trust/add', headers: authHeaders, body: JSON.stringify({ host: 'extra.example.ts.net' }) })
    const backupDir = join(home, 'ops-console', 'config-backups')
    const tempFiles = readdirSync(join(home, 'profiles', 'web')).filter((name) => name.includes('.new-'))
    if (validAdd.status === 200 && JSON.parse(validAdd.output).ok && readdirSync(backupDir).length === 1 && tempFiles.length === 0) ok('trusted-host update uses atomic replacement and a bounded backup')
    else bad('atomic trusted-host update failed: ' + validAdd.output)
    const pendingTrust = JSON.parse((await invoke(handlers.get('/dsh-ops/trust'), { url: '/dsh-ops/trust' })).output)
    if (pendingTrust.pendingRestart === true && Array.isArray(pendingTrust.activeHosts)) ok('trust route distinguishes saved configuration from the boot-time active configuration')
    else bad('pending trusted-host state was not reported')

    const disable = handlers.get('/dsh-ops/tailscale/disable')
    const disabled = await invoke(disable, { method: 'POST', url: '/dsh-ops/tailscale/disable', headers: authHeaders })
    const disabledData = JSON.parse(disabled.output)
    const remainingServe = readFileSync(tailscaleState, 'utf8')
    const tailscaleCalls = readFileSync(tailscaleLog, 'utf8')
    if (disabled.status === 200 && disabledData.ok === true && !remainingServe.includes('3080') && remainingServe.includes('9999')) {
      ok('disabling Harness preserves unrelated Tailscale Serve entries')
    } else bad('scoped Tailscale disable failed: ' + disabled.output + ' state=' + remainingServe)
    if (!tailscaleCalls.includes('reset') && tailscaleCalls.includes('"off"')) ok('disable uses scoped off, never global serve reset')
    else bad('disable issued an unsafe Tailscale command: ' + tailscaleCalls)

    writeFileSync(tailscaleState, JSON.stringify({
      Web: { 'dsh-host.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:9999' } } } },
    }))
    await new Promise((resolve) => setTimeout(resolve, 4100))
    const enable = handlers.get('/dsh-ops/tailscale/enable')
    const enabled = await invoke(enable, { method: 'POST', url: '/dsh-ops/tailscale/enable', headers: authHeaders })
    const enabledData = JSON.parse(enabled.output)
    if (enabled.status === 200 && enabledData.ok === false && enabledData.conflict === true) ok('existing HTTPS root proxy is never overwritten')
    else bad('Serve root conflict was not rejected: ' + enabled.output)

    writeFileSync(tailscaleState, JSON.stringify({ Web: { 'dsh-host.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3080' } } } } }))
    writeFileSync(tailscaleRuntime, JSON.stringify({ BackendState: 'Stopped', Health: ['Tailscale is stopped.'], Self: { DNSName: 'dsh-host.example.ts.net.', Online: false } }))
    await new Promise((resolve) => setTimeout(resolve, 4100))
    const stoppedAccess = JSON.parse((await invoke(handlers.get('/dsh-ops/tailscale'), { url: '/dsh-ops/tailscale' })).output)
    const stoppedCheck = JSON.parse((await invoke(handlers.get('/dsh-ops/tailscale/selftest'), { url: '/dsh-ops/tailscale/selftest' })).output)
    if (stoppedAccess.tailscaleRunning === false && stoppedAccess.serveActive === true && stoppedCheck.verdict === 'tailscale-stopped') ok('stopped Tailscale is distinct from a missing Serve configuration')
    else bad('stopped Tailscale state was misreported: ' + JSON.stringify({ stoppedAccess, stoppedCheck }))

    const revoked = JSON.parse((await invoke(handlers.get('/dsh-ops/sessions/revoke'), {
      method: 'POST', url: '/dsh-ops/sessions/revoke', headers: authHeaders, body: JSON.stringify({ id: redeemedData.session.id }),
    })).output)
    const afterRevoke = JSON.parse((await invoke(handlers.get('/dsh-ops/auth'), { url: '/dsh-ops/auth', headers: sessionHeaders })).output)
    if (revoked.ok && revoked.removed === 1 && afterRevoke.paired === false) ok('local page can revoke one remote session immediately')
    else bad('remote session revocation failed')

    const isolatedCode = JSON.parse((await invoke(handlers.get('/dsh-ops/pairing/create'), { method: 'POST', url: '/dsh-ops/pairing/create', headers: authHeaders })).output)
    for (let i = 0; i < 8; i++) {
      await invoke(handlers.get('/dsh-ops/pairing/redeem'), {
        method: 'POST', url: '/dsh-ops/pairing/redeem', headers: { ...remoteHeaders, 'x-forwarded-for': '100.64.0.20' },
        body: JSON.stringify({ code: '000000', label: 'Noisy device' }),
      })
    }
    const noisyBlocked = await invoke(handlers.get('/dsh-ops/pairing/redeem'), {
      method: 'POST', url: '/dsh-ops/pairing/redeem', headers: { ...remoteHeaders, 'x-forwarded-for': '100.64.0.20' },
      body: JSON.stringify({ code: isolatedCode.code, label: 'Noisy device' }),
    })
    const otherSource = await invoke(handlers.get('/dsh-ops/pairing/redeem'), {
      method: 'POST', url: '/dsh-ops/pairing/redeem', headers: { ...remoteHeaders, 'x-forwarded-for': '100.64.0.21' },
      body: JSON.stringify({ code: isolatedCode.code, label: 'Other phone' }),
    })
    if (noisyBlocked.status === 429 && otherSource.status === 200) ok('pairing rate limits one source without blocking other devices')
    else bad('pairing rate limit was not isolated by source')

    writeFileSync(tailscaleRuntime, JSON.stringify({ BackendState: 'Running', Health: [], Self: { DNSName: 'dsh-host.example.ts.net.', Online: true } }))
    writeFileSync(tailscaleState, JSON.stringify({ Web: {
      'dsh-host.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3080' } } },
      'other-service.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:9999' } } },
    } }))
    await new Promise((resolve) => setTimeout(resolve, 4100))
    const pending = JSON.parse((await invoke(handlers.get('/dsh-ops/pairing/create'), { method: 'POST', url: '/dsh-ops/pairing/create', headers: authHeaders })).output)
    const missingConfirmation = await invoke(handlers.get('/dsh-ops/security/tighten'), { method: 'POST', url: '/dsh-ops/security/tighten', headers: authHeaders, body: '{}' })
    const tightened = await invoke(handlers.get('/dsh-ops/security/tighten'), {
      method: 'POST', url: '/dsh-ops/security/tighten', headers: authHeaders, body: JSON.stringify({ confirm: 'tighten-remote-access' }),
    })
    const tightenedData = JSON.parse(tightened.output)
    const afterTightenSessions = JSON.parse((await invoke(handlers.get('/dsh-ops/sessions'), { url: '/dsh-ops/sessions', headers: authHeaders })).output)
    const pendingRedeem = await invoke(handlers.get('/dsh-ops/pairing/redeem'), {
      method: 'POST', url: '/dsh-ops/pairing/redeem', headers: { ...remoteHeaders, 'x-forwarded-for': '100.64.0.30' }, body: JSON.stringify({ code: pending.code, label: 'Late phone' }),
    })
    const tightenedServe = readFileSync(tailscaleState, 'utf8')
    if (missingConfirmation.status === 400 && tightened.status === 200 && tightenedData.ok && tightenedData.entranceClosed && tightenedData.removedSessions >= 1 && afterTightenSessions.sessions.length === 0 && pendingRedeem.status === 401 && !tightenedServe.includes('3080') && tightenedServe.includes('9999')) {
      ok('explicit local tighten closes only Harness, cancels pairing, and revokes every remote session')
    } else bad('tighten access contract failed: ' + JSON.stringify({ missingConfirmation: missingConfirmation.output, tightened: tightened.output, afterTightenSessions, pendingRedeem: pendingRedeem.output, tightenedServe }))
  } catch (error) { bad('route contract crashed: ' + (error.stack || error)) }
  finally {
    if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome
    if (oldToken === undefined) delete process.env.DSH_OPS_ADMIN_TOKEN; else process.env.DSH_OPS_ADMIN_TOKEN = oldToken
    if (oldTailscale === undefined) delete process.env.DSH_OPS_TAILSCALE_BIN; else process.env.DSH_OPS_TAILSCALE_BIN = oldTailscale
    if (oldTailscaleState === undefined) delete process.env.DSH_OPS_TEST_TS_STATE; else process.env.DSH_OPS_TEST_TS_STATE = oldTailscaleState
    if (oldTailscaleLog === undefined) delete process.env.DSH_OPS_TEST_TS_LOG; else process.env.DSH_OPS_TEST_TS_LOG = oldTailscaleLog
    if (oldTailscaleRuntime === undefined) delete process.env.DSH_OPS_TEST_TS_RUNTIME; else process.env.DSH_OPS_TEST_TS_RUNTIME = oldTailscaleRuntime
    rmSync(home, { recursive: true, force: true })
  }
}

function setupSmoke() {
  rmSync(SMOKE_PROFILE, { recursive: true, force: true })
  mkdirSync(SMOKE_PROFILE, { recursive: true })
  writeFileSync(join(SMOKE_PROFILE, 'package.json'), JSON.stringify({ name: 'dsh-ops-smoke', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-ops-console'] } } }, null, 2) + '\n')
  writeFileSync(join(SMOKE_PROFILE, 'cordis.yml'), '[]\n')
  const target = join(SMOKE_PROFILE, 'node_modules')
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(LIVE_PROFILE_NM)) {
    if (entry === 'dsh-ops-console') continue
    const source = join(LIVE_PROFILE_NM, entry)
    if (!entry.startsWith('@')) symlinkSync(source, join(target, entry), 'dir')
    else {
      mkdirSync(join(target, entry), { recursive: true })
      for (const child of readdirSync(source)) symlinkSync(join(source, child), join(target, entry, child), 'dir')
    }
  }
  symlinkSync(ROOT, join(target, 'dsh-ops-console'), 'dir')
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)) })
  })
}

async function gate4() {
  console.log('gate 4 — real throwaway dsh web')
  if (process.env.DSH_OPS_SKIP_LIVE_SMOKE === '1') { ok('live dsh smoke intentionally skipped in package-only CI'); return }
  const dsh = resolveDshBin()
  if (!dsh || !existsSync(LIVE_PROFILE_NM)) { bad('dsh binary or live profile modules unavailable for smoke boot'); return }
  setupSmoke()
  const port = await freePort()
  const base = 'http://127.0.0.1:' + port
  const child = spawn(process.execPath, [dsh, '--profile', 'ops-smoke', '--host', '127.0.0.1', '--port', String(port)], { env: { ...process.env, DSH_HOME: SMOKE_HOME }, stdio: 'ignore' })
  try {
    let ready = null
    const end = Date.now() + 90000
    while (Date.now() < end && child.exitCode === null) {
      try { const r = await fetch(base + '/dsh-ops/status'); if (r.ok) { ready = await r.json(); break } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (!ready?.ok) { bad('smoke server never answered /dsh-ops/status'); return }
    ok('dsh web booted and status is available')
    for (const path of ['/dsh-ops/tailscale', '/dsh-ops/tailscale/selftest', '/dsh-ops/trust', '/dsh-ops/auth']) {
      const response = await fetch(base + path)
      const data = await response.json().catch(() => null)
      if (response.ok && data?.ok) ok(path + ' returns JSON')
      else bad(path + ' failed')
    }
    const client = await fetch(base + '/plugins/dsh-ops-console/client.js').then((r) => r.text())
    if (client === readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')) ok('smoke boot loaded this repository client')
    else bad('smoke boot did not load this repository client')
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
}

console.log('dsh-ops-console verify — ' + new Date().toISOString())
gate1()
gate2()
await gate3()
await gate4()
console.log(failures === 0 ? '\nALL GATES GREEN — safe to deploy.' : '\n' + failures + ' gate(s) FAILED — do not deploy.')
process.exit(failures === 0 ? 0 : 1)
