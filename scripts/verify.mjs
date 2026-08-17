#!/usr/bin/env node
/**
 * dsh-ops-console — verification gates (run from repo root: `node scripts/verify.mjs`)
 *
 * Four gates, in increasing cost. Gates 1–3 never touch any live dsh profile;
 * gate 4 boots a throwaway dsh web whose DSH_HOME lives INSIDE this repo
 * (.smoke-dsh/, gitignored) so a bad edit can never break the running service.
 *
 *   gate 1  syntax check both lib files            (`node --check`)
 *   gate 2  stub-load the browser client bundle    (catches load-time crashes
 *           in the custom window.__ModuleLoader__ format)
 *   gate 3  unit-harness the host: call apply()
 *           with a mock ctx; assert the 5 ops_* tools
 *           register with valid schemas and the
 *           /dsh-ops/status route answers; assert the
 *           CSRF same-origin guard on POST routes
 *   gate 4  smoke boot: start `dsh web` on a scratch
 *           profile (DSH_HOME=.smoke-dsh, node_modules
 *           symlinked from the live web profile) and
 *           hit /dsh-ops/* routes end to end
 *
 * Exit code 0 = all gates green. Anything else aborts a deploy.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const HOME = homedir()
const DSH_HOME = process.env.DSH_HOME ?? join(HOME, '.dsh')
const LIVE_PROFILE_NM = join(DSH_HOME, 'profiles', 'web', 'node_modules')
const SMOKE_HOME = join(ROOT, '.smoke-dsh')
const SMOKE_PROFILE = join(SMOKE_HOME, 'profiles', 'ops-smoke')
const BOOT_TIMEOUT_MS = 90_000

let failures = 0
const ok = (msg) => console.log('  \u2713 ' + msg)
const bad = (msg) => { console.log('  \u2717 ' + msg); failures++ }

// ---------------------------------------------------------------- dsh bin

function resolveDshBin() {
  if (process.env.DSH_BIN && existsSync(process.env.DSH_BIN)) return process.env.DSH_BIN
  const which = spawnSync('which', ['dsh'], { encoding: 'utf8' })
  if (which.status === 0 && which.stdout.trim() !== '') return which.stdout.trim()
  // npx cache fallback: newest ~/.npm/_npx/*/node_modules/@deepseek-ai/dsh/lib/bin.js
  const npxRoot = join(HOME, '.npm', '_npx')
  let best = null
  try {
    for (const dir of readdirSync(npxRoot)) {
      const candidate = join(npxRoot, dir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
      if (!existsSync(candidate)) continue
      if (best === null || statSync(candidate).mtimeMs > statSync(best).mtimeMs) best = candidate
    }
  } catch { /* no npx cache */ }
  return best
}

// ---------------------------------------------------------------- gate 1

function gate1Syntax() {
  console.log('gate 1 — syntax (`node --check`)')
  for (const file of ['lib/index.js', 'lib/client.js']) {
    const r = spawnSync(process.execPath, ['--check', join(ROOT, file)], { encoding: 'utf8' })
    if (r.status === 0) ok(`${file} parses`)
    else { bad(`${file} syntax error:\n${r.stderr}`); return }
  }
}

// ---------------------------------------------------------------- gate 2

function gate2ClientStubLoad() {
  console.log('gate 2 — client bundle stub-load')
  try {
    const src = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
    const reactStub = {
      createElement: () => ({}),
      Fragment: Symbol('Fragment'),
      useState: () => [],
      useEffect: () => {},
      useCallback: (f) => f,
      useRef: () => ({}),
    }
    let captured = null
    const requireStub = (id) => {
      if (id === 'react') return reactStub
      throw new Error('client bundle unexpectedly requires: ' + id)
    }
    const windowStub = {
      __ModuleLoader__: { load: (spec) => { captured = spec.factory(requireStub) } },
    }
    // eslint-disable-next-line no-new-func
    const fn = new Function('window', 'require', 'console', src)
    fn(windowStub, requireStub, console)
    if (captured === null || captured.name !== 'dsh-ops-console' || typeof captured.apply !== 'function') {
      bad('client factory did not produce a valid module (name/apply missing)')
      return
    }
    ok('factory runs, exports.name + apply intact')
  } catch (error) {
    bad(`client load crashed: ${error?.message ?? error}`)
  }
}

// ---------------------------------------------------------------- gate 3

async function gate3HostUnit() {
  console.log('gate 3 — host apply() unit harness (mock ctx)')
  try {
    const handlers = new Map()
    const toolDefs = []
    const ctx = {
      credentials: undefined,
      webServer: { register: (route) => { handlers.set(route.path, route); return () => {} } },
      tools: { register: (def) => { toolDefs.push(def); return () => {} } },
      effect: (fn) => fn(),
    }
    const previousGuardian = process.env.DSH_GUARDIAN
    process.env.DSH_GUARDIAN = join(SMOKE_HOME, 'missing-guardian.mjs')
    let mod
    try {
      mod = await import(new URL(`../lib/index.js?verify=${Date.now()}`, import.meta.url))
    } finally {
      if (previousGuardian === undefined) delete process.env.DSH_GUARDIAN
      else process.env.DSH_GUARDIAN = previousGuardian
    }
    mod.apply(ctx)

    // -- tools: all five present, schema shape sound
    const expected = ['ops_status', 'ops_balance', 'ops_logs', 'ops_tailscale', 'ops_preflight', 'ops_restart']
    const names = toolDefs.map((d) => d.name)
    for (const want of expected) {
      if (!names.includes(want)) bad(`tool ${want} not registered (got: ${names.join(', ') || 'none'})`)
    }
    if (toolDefs.length !== expected.length) bad(`expected ${expected.length} tools, got ${toolDefs.length}`)
    for (const def of toolDefs) {
      const problems = []
      if (def.parameters?.type !== 'object') problems.push('parameters.type !== object')
      const outSchema = def.output?.schema
      if (outSchema?.type !== 'object') problems.push('output.schema.type !== object')
      if (outSchema?.properties && typeof outSchema.properties === 'object') {
        for (const [key, prop] of Object.entries(outSchema.properties)) {
          if (Array.isArray(prop?.type)) problems.push(`output.schema.properties.${key}.type is an array`)
        }
      }
      if (typeof def.execute !== 'function') problems.push('execute is not a function')
      if (problems.length > 0) bad(`${def.name}: ${problems.join('; ')}`)
    }
    if (toolDefs.length === expected.length && names.every((n) => expected.includes(n))) {
      ok(`all ${expected.length} ops_* tools register with valid schemas`)
    }
    const restartTool = toolDefs.find((d) => d.name === 'ops_restart')
    const unavailable = await restartTool?.execute({})
    if (unavailable?.ok === false && unavailable?.guardian === false) ok('ops_restart refuses unsafe fallback when guardian is missing')
    else bad(`ops_restart must refuse without guardian: ${JSON.stringify(unavailable)}`)

    // -- routes: GET /dsh-ops/status answers 200 JSON
    const statusRoute = handlers.get('/dsh-ops/status')
    if (!statusRoute) { bad('/dsh-ops/status route missing'); return }
    const res = await invoke(statusRoute, { method: 'GET', url: '/dsh-ops/status', headers: {} })
    const parsed = JSON.parse(res.body)
    if (res.status === 200 && parsed.ok === true && parsed.pid > 0) ok('/dsh-ops/status -> 200 { ok: true, pid }')
    else bad(`/dsh-ops/status -> HTTP ${res.status}: ${res.body.slice(0, 200)}`)

    // -- CSRF guard: POST without Origin must 403
    const restartRoute = handlers.get('/dsh-ops/restart')
    if (restartRoute) {
      const r = await invoke(restartRoute, { method: 'POST', url: '/dsh-ops/restart', headers: {} })
      if (r.status === 403) ok('POST /dsh-ops/restart rejected (no Origin) -> 403')
      else bad(`POST /dsh-ops/restart -> HTTP ${r.status} (expected 403 CSRF guard)`)
    } else {
      bad('POST /dsh-ops/restart route missing')
    }
    if (restartRoute) {
      const r = await invoke(restartRoute, {
        method: 'POST', url: '/dsh-ops/restart',
        headers: { origin: 'http://localhost', host: 'localhost' },
      })
      if (r.status === 503 && JSON.parse(r.body).guardian === false) ok('POST /dsh-ops/restart -> 503 without guardian (no naked restart)')
      else bad(`POST /dsh-ops/restart unsafe fallback: HTTP ${r.status} ${r.body.slice(0, 200)}`)
    }
  } catch (error) {
    bad(`host unit harness crashed: ${error?.stack ?? error}`)
  }
}

function invoke(route, { method = 'GET', url = '', headers = {} }) {
  return new Promise((resolve) => {
    let status = 0
    let body = ''
    const res = {
      writeHead: (s) => { status = s },
      end: (b) => { body = b; resolve({ status, body }) },
    }
    Promise.resolve(route.handler({ method, url, headers }, res)).catch((error) => resolve({ status: 0, body: String(error) }))
  })
}

// ---------------------------------------------------------------- gate 4

function setupSmokeProfile() {
  rmSync(SMOKE_PROFILE, { recursive: true, force: true })
  mkdirSync(SMOKE_PROFILE, { recursive: true })
  writeFileSync(join(SMOKE_PROFILE, 'package.json'), JSON.stringify({
    name: 'dsh-profile-ops-smoke',
    private: true,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-ops-console'] } },
  }, null, 2) + '\n')
  writeFileSync(join(SMOKE_PROFILE, 'cordis.yml'), '[]\n')
  const smokeModules = join(SMOKE_PROFILE, 'node_modules')
  mkdirSync(smokeModules, { recursive: true })
  for (const name of readdirSync(LIVE_PROFILE_NM)) {
    if (name === 'dsh-ops-console') continue
    const source = join(LIVE_PROFILE_NM, name)
    const target = join(smokeModules, name)
    if (!name.startsWith('@')) {
      symlinkSync(source, target, 'dir')
      continue
    }
    mkdirSync(target, { recursive: true })
    for (const child of readdirSync(source)) symlinkSync(join(source, child), join(target, child), 'dir')
  }
  symlinkSync(ROOT, join(smokeModules, 'dsh-ops-console'), 'dir')
}

function findFreePort() {
  return new Promise((resolvePromise, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolvePromise(port))
    })
  })
}

async function gate4SmokeBoot() {
  console.log('gate 4 — smoke boot (throwaway dsh web in .smoke-dsh)')
  const dshBin = resolveDshBin()
  if (dshBin === null) { bad('could not resolve dsh binary (set DSH_BIN env) — skipping smoke boot'); return }
  if (!existsSync(LIVE_PROFILE_NM)) { bad(`live profile node_modules not found at ${LIVE_PROFILE_NM} — skipping smoke boot`); return }

  setupSmokeProfile()
  const port = await findFreePort()
  const base = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, [dshBin, '--profile', 'ops-smoke', '--host', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, DSH_HOME: SMOKE_HOME },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => { stdout += d })
  child.stderr.on('data', (d) => { stderr += d })

  try {
    const deadline = Date.now() + BOOT_TIMEOUT_MS
    let status = null
    while (Date.now() < deadline) {
      if (child.exitCode !== null) break
      try {
        const r = await fetch(`${base}/dsh-ops/status`)
        if (r.ok) { status = await r.json(); break }
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 500))
    }

    if (status === null || status.ok !== true) {
      bad(`smoke server never answered /dsh-ops/status (exit=${child.exitCode ?? 'still running'})`)
      console.error('--- smoke stdout tail ---\n' + stdout.slice(-2000))
      console.error('--- smoke stderr tail ---\n' + stderr.slice(-2000))
      return
    }
    ok(`dsh web booted on :${port}, /dsh-ops/status -> pid ${status.pid}, engine ${status.engine}`)

    // -- the loaded bundle must be THIS repo, not the live deployed snapshot
    const settings = await fetchJson(`${base}/dsh-ops/settings`)
    const loaded = await fetch(`${base}/plugins/dsh-ops-console/client.js`).then((r) => r.text()).catch(() => '')
    const source = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
    if (settings?.ok && String(settings.file).includes('ops-smoke') && loaded === source) {
      ok('smoke profile loaded this repo client bundle (not the live snapshot)')
    } else {
      bad(`/dsh-ops/settings -> ${JSON.stringify(settings).slice(0, 200)}`)
    }

    for (const path of ['/dsh-ops/logs?tail=5', '/dsh-ops/version', '/dsh-ops/trust', '/dsh-ops/guardian', '/dsh-ops/deployments']) {
      const r = await fetchJson(base + path)
      if (r && typeof r === 'object' && Object.keys(r).length > 0) ok(`${path} -> 200 JSON`)
      else bad(`${path} -> ${JSON.stringify(r).slice(0, 200)}`)
    }

    const balance = await fetchJson(`${base}/dsh-ops/balance`)
    if (balance && typeof balance === 'object' && 'ok' in balance) ok('/dsh-ops/balance -> 200 JSON (ok or graceful error)')
    else bad(`/dsh-ops/balance -> ${JSON.stringify(balance).slice(0, 200)}`)
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 800))
      if (child.exitCode === null) child.kill('SIGKILL')
    }
  }
}

async function fetchJson(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    return await r.json()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- main

console.log(`dsh-ops-console verify — ${new Date().toISOString()}`)
gate1Syntax()
gate2ClientStubLoad()
await gate3HostUnit()
await gate4SmokeBoot()

console.log(failures === 0
  ? '\nALL GATES GREEN — safe to deploy.'
  : `\n${failures} gate(s) FAILED — do not deploy.`)
process.exit(failures === 0 ? 0 : 1)
