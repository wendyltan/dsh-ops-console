#!/usr/bin/env node
/**
 * dsh-ops-console verification: syntax, browser-module load, standalone
 * HTTP routes and a real throwaway dsh web boot. No Guardian is required.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
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
    if (!pkg?.dsh?.guardian && !JSON.stringify(pkg).includes('guardian')) ok('manifest has no Guardian integration dependency')
    else bad('manifest still declares a Guardian integration')
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
  process.env.DSH_HOME = home
  process.env.DSH_OPS_ADMIN_TOKEN = 'v'.repeat(48)
  mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
  writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), '[]\n')
  const handlers = new Map()
  try {
    const mod = await import(new URL('../lib/index.js?verify=' + Date.now(), import.meta.url))
    mod.apply({ credentials: undefined, webServer: { register: (route) => { handlers.set(route.path, route); return () => {} } }, effect: (fn) => fn() })
    const expected = ['/dsh-ops/status', '/dsh-ops/summary', '/dsh-ops/diagnose', '/dsh-ops/timeline', '/dsh-ops/report', '/dsh-ops/auth']
    for (const path of expected) {
      const route = handlers.get(path)
      if (!route) { bad(path + ' route missing'); continue }
      const result = await invoke(route, { url: path + (path === '/dsh-ops/diagnose' ? '?symptom=remote' : '') })
      const data = JSON.parse(result.output)
      if (result.status === 200 && data.ok === true) ok(path + ' returns usable JSON')
      else bad(path + ' failed: ' + result.output.slice(0, 300))
    }
    if (!handlers.has('/dsh-ops/guardian') && !handlers.has('/dsh-ops/restart') && !handlers.has('/dsh-ops/preflight')) ok('no Guardian control routes are registered')
    else bad('obsolete Guardian control route remains registered')
    const save = handlers.get('/dsh-ops/settings/save')
    const denied = await invoke(save, { method: 'POST', url: '/dsh-ops/settings/save', headers: { origin: 'http://localhost', host: 'localhost' }, body: JSON.stringify({ settings: {} }) })
    if (denied.status === 401 && JSON.parse(denied.output).authRequired === true) ok('writes still require an admin token')
    else bad('write authentication guard failed: ' + denied.output)
    const crossSite = await invoke(save, { method: 'POST', url: '/dsh-ops/settings/save', headers: {}, body: '{}' })
    if (crossSite.status === 403) ok('writes still reject untrusted origins')
    else bad('CSRF guard failed: ' + crossSite.output)
  } catch (error) { bad('route contract crashed: ' + (error.stack || error)) }
  finally {
    if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome
    if (oldToken === undefined) delete process.env.DSH_OPS_ADMIN_TOKEN; else process.env.DSH_OPS_ADMIN_TOKEN = oldToken
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
      try { const r = await fetch(base + '/dsh-ops/summary'); if (r.ok) { ready = await r.json(); break } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (!ready?.ok) { bad('smoke server never answered /dsh-ops/summary'); return }
    ok('dsh web booted and summary is available')
    for (const path of ['/dsh-ops/diagnose?symptom=history', '/dsh-ops/timeline', '/dsh-ops/report', '/dsh-ops/auth', '/dsh-ops/settings', '/dsh-ops/trust']) {
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
