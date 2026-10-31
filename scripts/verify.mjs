#!/usr/bin/env node
/**
 * dsh-ops-console verification: syntax, browser-module load, standalone
 * HTTP routes and a real throwaway dsh web boot. No Guardian is required.
 */
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
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
    if (pkg.version === '0.7.3' && pkg.publishConfig?.access === 'public' && pkg.publishConfig?.registry === 'https://registry.npmjs.org/') ok('manifest is ready for the public npm release')
    else bad('manifest must declare the 0.7.3 public npm release contract')
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
    for (const text of ['复制地址', '二维码包含本次启动的登录令牌', '登录二维码只在 Mac 本机页面生成', '更多访问设置', '检测连接', '每 15 秒自动更新', '远程设置已保存，但 Harness 还没有载入', '远程入口已开启', '哪些账号和设备能够访问，由 Tailscale 管理', '界面与服务版本不一致', 'auth.data?.local === true', 'color-mix', 'min-height: 42px']) {
      if (src.includes(text)) ok('client includes interaction: ' + text)
      else bad('client is missing interaction: ' + text)
    }
    for (const text of ['二维码只包含这个 HTTPS 地址', '生成确认码', '复制连接说明', '发送连接说明', '设备记录保留', '忘记全部记录', '分享地址', '立即刷新', 'Harness 接受的访问地址', '添加地址']) {
      if (!src.includes(text)) ok('client omits obsolete interaction: ' + text)
      else bad('client still includes obsolete interaction: ' + text)
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
  writeFileSync(tailscaleRuntime, JSON.stringify({ BackendState: 'Running', Health: [], Self: { DNSName: 'dsh-host.example.ts.net.', Online: true, TailscaleIPs: ['127.0.0.1'] }, Peer: {} }))
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
} else if (args[0] === 'serve' && args[1] === '--bg') {
  const config = JSON.parse(readFileSync(process.env.DSH_OPS_TEST_TS_STATE, 'utf8'))
  config.Web ||= {}
  config.Web['dsh-host.example.ts.net:443'] = { Handlers: { '/': { Proxy: 'http://127.0.0.1:3080' } } }
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
    mod.apply({
      credentials: undefined,
      webServer: { register: (route) => { handlers.set(route.path, route); return () => {} } },
      // Connection owns the process launch token; the panel must ask it rather
      // than guess a token or fall back to a token-less QR.
      get: (service) => service === 'connection'
        ? { authenticatedUrl: (baseUrl) => baseUrl + '?token=test-launch-token' }
        : undefined,
      effect: (fn) => fn(),
    })
    const expected = ['/dsh-ops/status', '/dsh-ops/tailscale', '/dsh-ops/tailscale/selftest', '/dsh-ops/trust', '/dsh-ops/auth']
    for (const path of expected) {
      const route = handlers.get(path)
      if (!route) { bad(path + ' route missing'); continue }
      const result = await invoke(route, { url: path })
      const data = JSON.parse(result.output)
      if (result.status === 200 && data.ok === true) ok(path + ' returns usable JSON')
      else bad(path + ' failed: ' + result.output.slice(0, 300))
    }
    for (const path of ['/dsh-ops/tailscale/enable', '/dsh-ops/tailscale/disable']) {
      if (handlers.has(path)) ok(path + ' route registered')
      else bad(path + ' route missing')
    }
    const fallbackProbe = JSON.parse((await invoke(handlers.get('/dsh-ops/tailscale/selftest'), { url: '/dsh-ops/tailscale/selftest' })).output)
    if (fallbackProbe.verdict === 'not-reachable' && fallbackProbe.via === 'tailnet-ip' && fallbackProbe.ip === '127.0.0.1') ok('self-test falls back to the Tailscale IP when local DNS cannot reach the URL')
    else bad('self-test did not use the Tailscale IP fallback: ' + JSON.stringify(fallbackProbe))
    const publicStatus = JSON.parse((await invoke(handlers.get('/dsh-ops/status'), { url: '/dsh-ops/status' })).output)
    if (!('pid' in publicStatus) && !('port' in publicStatus) && !('engine' in publicStatus) && !('url' in publicStatus)) ok('public health omits process and engine details')
    else bad('public health leaks implementation details: ' + JSON.stringify(publicStatus))
    const publicTrust = JSON.parse((await invoke(handlers.get('/dsh-ops/trust'), { url: '/dsh-ops/trust' })).output)
    if (!('patchFile' in publicTrust)) ok('trust response omits the local profile path')
    else bad('trust response leaks local path: ' + JSON.stringify(publicTrust))
    const removed = ['/dsh-ops/summary', '/dsh-ops/diagnose', '/dsh-ops/timeline', '/dsh-ops/report', '/dsh-ops/balance', '/dsh-ops/settings', '/dsh-ops/settings/save', '/dsh-ops/logs', '/dsh-ops/pairing/create', '/dsh-ops/pairing/cancel', '/dsh-ops/pairing/redeem', '/dsh-ops/remote/checkin', '/dsh-ops/sessions', '/dsh-ops/sessions/revoke', '/dsh-ops/sessions/revoke-all', '/dsh-ops/auth/rotate-master', '/dsh-ops/security/tighten', '/dsh-ops/trust/add', '/dsh-ops/trust/remove']
    for (const path of removed) {
      if (handlers.has(path)) bad(path + ' route should have been removed')
      else ok(path + ' is no longer registered')
    }
    if (!handlers.has('/dsh-ops/guardian') && !handlers.has('/dsh-ops/restart') && !handlers.has('/dsh-ops/preflight')) ok('no Guardian control routes are registered')
    else bad('obsolete Guardian control route remains registered')
    const enable = handlers.get('/dsh-ops/tailscale/enable')
    const denied = await invoke(enable, { method: 'POST', url: '/dsh-ops/tailscale/enable', headers: { origin: 'http://localhost', host: 'localhost' } })
    if (denied.status === 401 && JSON.parse(denied.output).authRequired === true) ok('writes still require an admin token')
    else bad('write authentication guard failed: ' + denied.output)
    const crossSite = await invoke(enable, { method: 'POST', url: '/dsh-ops/tailscale/enable', headers: {} })
    if (crossSite.status === 403) ok('writes still reject untrusted origins')
    else bad('CSRF guard failed: ' + crossSite.output)

    const authHeaders = { origin: 'http://localhost', host: 'localhost', 'x-dsh-ops-token': 'v'.repeat(48) }
    const remoteHeaders = { origin: 'https://dsh-host.example.ts.net', host: 'dsh-host.example.ts.net' }
    const readyAccess = JSON.parse((await invoke(handlers.get('/dsh-ops/tailscale'), { url: '/dsh-ops/tailscale', headers: authHeaders })).output)
    const qrSvg = readyAccess.invitation?.qrSvg ?? ''
    if (readyAccess.invitation?.url === 'https://dsh-host.example.ts.net/?token=test-launch-token' && qrSvg.startsWith('<svg') && qrSvg.includes('<path')) ok('ready remote access includes a token-bearing local SVG QR')
    else bad('token-bearing local QR failed: ' + JSON.stringify(readyAccess.invitation))
    const anonymousAccess = JSON.parse((await invoke(handlers.get('/dsh-ops/tailscale'), { url: '/dsh-ops/tailscale' })).output)
    if (anonymousAccess.invitation === null && !JSON.stringify(anonymousAccess).includes('test-launch-token')) ok('anonymous callers never receive the login invitation')
    else bad('anonymous callers received the login invitation: ' + JSON.stringify(anonymousAccess.invitation))
    const remoteTokenAccess = JSON.parse((await invoke(handlers.get('/dsh-ops/tailscale'), { url: '/dsh-ops/tailscale', headers: { ...remoteHeaders, 'x-dsh-ops-token': 'v'.repeat(48) } })).output)
    if (remoteTokenAccess.invitation === null) ok('remote devices never receive the login invitation')
    else bad('remote device received the login invitation: ' + JSON.stringify(remoteTokenAccess.invitation))
    const remoteAuth = JSON.parse((await invoke(handlers.get('/dsh-ops/auth'), { url: '/dsh-ops/auth', headers: remoteHeaders })).output)
    if (remoteAuth.local === false && remoteAuth.token === undefined && remoteAuth.contractVersion === 3) ok('remote page learns the UI contract without receiving local management credentials')
    else bad('remote auth boundary failed: ' + JSON.stringify(remoteAuth))
    const remoteDisable = await invoke(handlers.get('/dsh-ops/tailscale/disable'), { method: 'POST', url: '/dsh-ops/tailscale/disable', headers: remoteHeaders })
    const remoteEnable = await invoke(enable, { method: 'POST', url: '/dsh-ops/tailscale/enable', headers: remoteHeaders })
    if (remoteDisable.status === 403 && remoteEnable.status === 403 && JSON.parse(remoteDisable.output).localRequired === true) ok('remote devices cannot manage the Mac remote-access configuration')
    else bad('remote device unexpectedly retained local management privileges')

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

    writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), '- id: connection\n  config:\n    trustedHosts: []\n')
    const enabled = await invoke(enable, { method: 'POST', url: '/dsh-ops/tailscale/enable', headers: authHeaders })
    const enabledData = JSON.parse(enabled.output)
    const backupDir = join(home, 'ops-console', 'config-backups')
    const tempFiles = readdirSync(join(home, 'profiles', 'web')).filter((name) => name.includes('.new-'))
    const savedPatch = readFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    if (enabled.status === 200 && enabledData.ok === true && enabledData.autoTrusted === true && savedPatch.includes('dsh-host.example.ts.net') && readdirSync(backupDir).length === 1 && tempFiles.length === 0) ok('enabling automatically saves only the detected Tailscale address with atomic replacement')
    else bad('automatic Tailscale address setup failed: ' + enabled.output)

    const patchPath = join(home, 'profiles', 'web', 'cordis.patch.yml')
    writeFileSync(patchPath, '- id: connection\n  config:\n    trustedHosts:\n      - existing.example.com\n')
    renameSync(backupDir, backupDir + '.held')
    writeFileSync(backupDir, 'isolated fixture: prevent backup directory creation')
    const callsBeforeRetry = readFileSync(tailscaleLog, 'utf8')
    const partial = JSON.parse((await invoke(enable, { method: 'POST', headers: authHeaders })).output)
    if (partial.ok === false && partial.partial === true && partial.stage === 'address' && partial.message.includes('继续完成设置')) ok('failed configuration write reports partial success with a retry, not false success')
    else bad('partial setup was not actionable: ' + JSON.stringify(partial))
    rmSync(backupDir)
    renameSync(backupDir + '.held', backupDir)
    const retried = JSON.parse((await invoke(enable, { method: 'POST', headers: authHeaders })).output)
    const retryCommands = readFileSync(tailscaleLog, 'utf8').slice(callsBeforeRetry.length)
    if (retried.ok && retried.autoTrusted && retried.restartRequired && !retryCommands.includes('"--bg"') && readFileSync(patchPath, 'utf8').includes('existing.example.com')) ok('retry completes only missing settings and preserves Serve and existing addresses')
    else bad('partial setup retry failed: ' + JSON.stringify(retried))

    const publicServe = { Web: { 'dsh-host.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3080' } } } }, AllowFunnel: { 'dsh-host.example.ts.net:443': true } }
    writeFileSync(tailscaleState, JSON.stringify(publicServe))
    const exposedWrite = JSON.parse((await invoke(enable, { method: 'POST', headers: authHeaders })).output)
    const exposedAccess = JSON.parse((await invoke(handlers.get('/dsh-ops/tailscale'), { url: '/dsh-ops/tailscale', headers: authHeaders })).output)
    if (exposedWrite.ok === false && exposedWrite.stage === 'exposure' && exposedAccess.exposure?.state === 'detected' && exposedAccess.invitation === null) ok('Funnel warning prevents misleading QR and setup without changing public configuration')
    else bad('Funnel route protection failed')
    if (JSON.stringify(JSON.parse(readFileSync(tailscaleState, 'utf8'))) === JSON.stringify(publicServe)) ok('exposure detection never mutates Tailscale')
    else bad('exposure detection mutated Tailscale')
    writeFileSync(tailscaleState, JSON.stringify({ AllowFunnel: { 'dsh-host.example.ts.net:443': true } }))
    const staleFunnel = JSON.parse((await invoke(enable, { method: 'POST', headers: authHeaders })).output)
    if (!staleFunnel.ok && staleFunnel.stage === 'exposure') ok('setup never creates a new Harness route under a pre-enabled Funnel listener')
    else bad('setup would create a public Harness route')
    writeFileSync(tailscaleState, '{invalid')
    await invoke(enable, { method: 'POST', headers: authHeaders })
    const unknownAccess = JSON.parse((await invoke(handlers.get('/dsh-ops/tailscale'), { url: '/dsh-ops/tailscale', headers: authHeaders })).output)
    if (unknownAccess.exposure?.state === 'unknown' && unknownAccess.invitation === null) ok('unreadable Serve configuration is unknown, never safe')
    else bad('unreadable Serve configuration was treated as safe')

    writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), '- id: connection\n  config:\n    trustedHosts:\n      - changed-host.example.ts.net\n')
    const pendingTrust = JSON.parse((await invoke(handlers.get('/dsh-ops/trust'), { url: '/dsh-ops/trust' })).output)
    if (pendingTrust.pendingRestart === true && !('hosts' in pendingTrust) && !('activeHosts' in pendingTrust)) ok('trust status reports reload state without exposing editable host lists')
    else bad('minimal pending trusted-host state was not reported')
    const pendingAccess = JSON.parse((await invoke(handlers.get('/dsh-ops/tailscale'), { url: '/dsh-ops/tailscale', headers: authHeaders })).output)
    if (pendingAccess.invitation === null) ok('QR stays hidden while the automatic Tailscale address is waiting for restart')
    else bad('QR appeared before the automatic Tailscale address became active')

    writeFileSync(tailscaleState, JSON.stringify({
      Web: { 'dsh-host.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:9999' } } } },
    }))
    await new Promise((resolve) => setTimeout(resolve, 4100))
    const conflictEnable = await invoke(enable, { method: 'POST', url: '/dsh-ops/tailscale/enable', headers: authHeaders })
    const conflictData = JSON.parse(conflictEnable.output)
    if (conflictEnable.status === 200 && conflictData.ok === false && conflictData.conflict === true) ok('existing HTTPS root proxy is never overwritten')
    else bad('Serve root conflict was not rejected: ' + conflictEnable.output)

    writeFileSync(tailscaleState, JSON.stringify({ Web: { 'dsh-host.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3080' } } } } }))
    writeFileSync(tailscaleRuntime, JSON.stringify({ BackendState: 'Stopped', Health: ['Tailscale is stopped.'], Self: { DNSName: 'dsh-host.example.ts.net.', Online: false } }))
    await new Promise((resolve) => setTimeout(resolve, 4100))
    const stoppedAccess = JSON.parse((await invoke(handlers.get('/dsh-ops/tailscale'), { url: '/dsh-ops/tailscale' })).output)
    const stoppedCheck = JSON.parse((await invoke(handlers.get('/dsh-ops/tailscale/selftest'), { url: '/dsh-ops/tailscale/selftest' })).output)
    if (stoppedAccess.tailscaleRunning === false && stoppedAccess.serveActive === true && stoppedCheck.verdict === 'tailscale-stopped') ok('stopped Tailscale is distinct from a missing Serve configuration')
    else bad('stopped Tailscale state was misreported: ' + JSON.stringify({ stoppedAccess, stoppedCheck }))

    writeFileSync(tailscaleRuntime, JSON.stringify({ BackendState: 'Running', Health: [], Self: { DNSName: 'dsh-host.example.ts.net.', Online: true } }))
    writeFileSync(tailscaleState, JSON.stringify({ Web: {
      'dsh-host.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3080' } } },
      'other-service.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:9999' } } },
    } }))
    await new Promise((resolve) => setTimeout(resolve, 4100))
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
  writeFileSync(join(SMOKE_PROFILE, 'cordis.patch.yml'), '- id: connection\n  config:\n    trustedHosts:\n      - dsh-host.example.ts.net\n')
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
  const smokeTailscale = join(SMOKE_HOME, 'tailscale.mjs')
  writeFileSync(smokeTailscale, `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === 'status' && args[1] === '--json') {
  process.stdout.write(JSON.stringify({ BackendState: 'Running', Health: [], Self: { DNSName: 'dsh-host.example.ts.net.', Online: true }, Peer: {} }))
} else if (args[0] === 'serve' && args[1] === 'status') {
  process.stdout.write(JSON.stringify({ Web: { 'dsh-host.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3080' } } } } }))
} else {
  process.stderr.write('unexpected fake tailscale command: ' + args.join(' '))
  process.exitCode = 2
}
`)
  chmodSync(smokeTailscale, 0o755)
  const port = await freePort()
  const base = 'http://127.0.0.1:' + port
  let output = ''
  const child = spawn(process.execPath, [dsh, '--profile', 'ops-smoke', '--host', '127.0.0.1', '--port', String(port), '--no-open'], { env: { ...process.env, DSH_HOME: SMOKE_HOME, DSH_OPS_TAILSCALE_BIN: smokeTailscale, DSH_OPS_ADMIN_TOKEN: 's'.repeat(48) }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', () => {})
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
    // The engine serves plugin clients through revision-addressed combo URLs,
    // so fetch the URL it advertised instead of guessing a raw file path.
    const loginUrl = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/)?.[1]
    if (!loginUrl) {
      bad('smoke boot did not print a login URL for the client bundle check')
    } else {
      const issued = await fetch(loginUrl, { redirect: 'manual' })
      const cookie = (issued.headers.getSetCookie?.()[0] ?? issued.headers.get('set-cookie') ?? '').split(';')[0]
      const index = await fetch(base + '/', { headers: { cookie } }).then((r) => r.text())
      const comboPath = index.match(/plugins\/\?\?[^"]*dsh-ops-console\/client\.js[^"]*/)?.[0]
      if (!comboPath) {
        bad('smoke boot did not compose this repository client into the boot bundle')
      } else {
        const bundle = await fetch(base + '/' + comboPath.replaceAll('&amp;', '&'), { headers: { cookie } }).then((r) => r.text())
        if (bundle.includes('dshops-root') && bundle.includes('二维码包含本次启动的登录令牌，只在 Mac 本机页面生成')) ok('smoke boot served this repository client bundle')
        else bad('smoke boot served a different client bundle')
      }
    }
    const adminHeaders = { 'x-dsh-ops-token': 's'.repeat(48) }
    const accessData = await fetch(base + '/dsh-ops/tailscale', { headers: adminHeaders }).then((r) => r.json()).catch(() => null)
    if (typeof accessData?.invitation?.url === 'string' && accessData.invitation.url.includes('?token=') && accessData.invitation.qrSvg?.startsWith('<svg')) ok('real Connection service mints a token-bearing login QR')
    else bad('real token-bearing login QR missing: ' + JSON.stringify(accessData?.invitation))
    const anonymous = await fetch(base + '/dsh-ops/tailscale').then((r) => r.json()).catch(() => null)
    if (anonymous?.invitation === null) ok('real server withholds the login QR without the local admin token')
    else bad('real server exposed the login QR anonymously: ' + JSON.stringify(anonymous?.invitation))
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
}

console.log('dsh-ops-console verify — ' + new Date().toISOString())
for (const script of ['test-exposure.mjs', 'test-client.mjs']) {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', script)], { stdio: 'inherit' })
  if (result.status !== 0) bad(script + ' failed')
}
gate1()
gate2()
await gate3()
await gate4()
console.log(failures === 0 ? '\nALL GATES GREEN — safe to deploy.' : '\n' + failures + ' gate(s) FAILED — do not deploy.')
process.exit(failures === 0 ? 0 : 1)
