#!/usr/bin/env node
/** Verified, atomic deployment to the internal disk. */
import { spawnSync } from 'node:child_process'
import {
  chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync,
  renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const HOME = homedir()
const DSH_HOME = process.env.DSH_HOME ?? join(HOME, '.dsh')
const DEPLOY_ROOT = process.env.DSH_OPS_DEPLOY_ROOT ?? join(DSH_HOME, 'deployments', 'dsh-ops-console')
const CURRENT = join(DEPLOY_ROOT, 'current')
const BACKUPS = join(DEPLOY_ROOT, 'backups')
const HISTORY = join(DEPLOY_ROOT, 'history.json')
const PROFILE = join(DSH_HOME, 'profiles', 'web')
const GUARDIAN = join(DSH_HOME, 'guardian', 'guardian.mjs')
const KEEP_BACKUPS = 8
const ITEMS = ['package.json', 'lib', 'guardian', 'scripts', 'cordis.patch.yml', 'README.md', 'LICENSE']
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const profilePackageFile = join(PROFILE, 'package.json')
const profileLockFile = join(PROFILE, 'pnpm-lock.yaml')
const liveLink = join(PROFILE, 'node_modules', 'dsh-ops-console')
const originalProfilePackage = readFileSync(profilePackageFile, 'utf8')
const originalProfileLock = existsSync(profileLockFile) ? readFileSync(profileLockFile, 'utf8') : null
let originalLiveLink = null
try { originalLiveLink = readlinkSync(liveLink) } catch {}

mkdirSync(BACKUPS, { recursive: true })

console.log('== verify candidate ==')
const verified = spawnSync(process.execPath, [join(ROOT, 'scripts', 'verify.mjs')], { stdio: 'inherit' })
if (verified.status !== 0) {
  console.error('\ndeploy aborted: candidate verification failed; live files were not touched.')
  process.exit(1)
}

console.log('\n== build internal snapshot ==')
const candidate = join(DEPLOY_ROOT, `.candidate-${stamp}`)
rmSync(candidate, { recursive: true, force: true })
mkdirSync(candidate, { recursive: true })
for (const item of ITEMS) {
  const source = join(ROOT, item)
  if (!existsSync(source)) throw new Error(`missing deploy item: ${item}`)
  cpSync(source, join(candidate, item), { recursive: true })
}

let backup = null
if (existsSync(CURRENT)) {
  backup = join(BACKUPS, stamp)
  renameSync(CURRENT, backup)
}
renameSync(candidate, CURRENT)

function updateProfileLink() {
  const packageFile = profilePackageFile
  const pkg = JSON.parse(readFileSync(packageFile, 'utf8'))
  const specifier = `link:${CURRENT}`
  pkg.dependencies ??= {}
  pkg.dependencies['dsh-ops-console'] = specifier
  const packageBackup = join(DEPLOY_ROOT, `profile-package.pre-internal-${stamp}.json`)
  if (!readdirSync(DEPLOY_ROOT).some((name) => name.startsWith('profile-package.pre-internal-'))) {
    cpSync(packageFile, packageBackup)
  }
  writeFileSync(`${packageFile}.new`, JSON.stringify(pkg, null, 2) + '\n')
  renameSync(`${packageFile}.new`, packageFile)

  const lockFile = profileLockFile
  if (existsSync(lockFile)) {
    let lock = readFileSync(lockFile, 'utf8')
    lock = lock.replace(/(dsh-ops-console:\n\s+specifier:)\s*[^\n]+\n\s+version:\s*[^\n]+/, `$1 ${specifier}\n        version: ${specifier}`)
    writeFileSync(`${lockFile}.new`, lock)
    renameSync(`${lockFile}.new`, lockFile)
  }

  const tempLink = `${liveLink}.new`
  rmSync(tempLink, { recursive: true, force: true })
  symlinkSync(CURRENT, tempLink, 'dir')
  rmSync(liveLink, { recursive: true, force: true })
  renameSync(tempLink, liveLink)
}

updateProfileLink()

console.log('\n== full-profile guardian preflight ==')
let preflight = { status: 0, stdout: '{"ok":true}' }
if (existsSync(GUARDIAN)) {
  preflight = spawnSync(process.execPath, [GUARDIAN, 'preflight', '--json'], { encoding: 'utf8', timeout: 120_000 })
  process.stdout.write(preflight.stdout || '')
}
let preflightOk = preflight.status === 0
try { preflightOk &&= JSON.parse(preflight.stdout).ok === true } catch { preflightOk = false }
if (!preflightOk) {
  const failed = join(DEPLOY_ROOT, `failed-${stamp}`)
  renameSync(CURRENT, failed)
  if (backup !== null) renameSync(backup, CURRENT)
  writeFileSync(profilePackageFile, originalProfilePackage)
  if (originalProfileLock !== null) writeFileSync(profileLockFile, originalProfileLock)
  rmSync(liveLink, { recursive: true, force: true })
  if (originalLiveLink !== null) symlinkSync(originalLiveLink, liveLink, 'dir')
  console.error('full-profile preflight failed; deployment was rolled back automatically.')
  process.exit(1)
}

function makeReadOnly(path) {
  const stat = lstatSync(path)
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) makeReadOnly(join(path, name))
  } else if (stat.isFile()) chmodSync(path, 0o444)
}
makeReadOnly(CURRENT)

const history = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')) : []
history.push({ at: new Date().toISOString(), action: 'deploy', source: ROOT, current: CURRENT, backup })
writeFileSync(HISTORY, JSON.stringify(history.slice(-100), null, 2) + '\n')

const names = readdirSync(BACKUPS).sort()
while (names.length > KEEP_BACKUPS) rmSync(join(BACKUPS, names.shift()), { recursive: true, force: true })

if (existsSync(GUARDIAN)) spawnSync(process.execPath, [GUARDIAN, 'snapshot', '--json'], { stdio: 'inherit' })
console.log(`\ndeployed safely -> ${CURRENT}`)
console.log('activate with: node ~/.dsh/guardian/guardian.mjs restart --json')
