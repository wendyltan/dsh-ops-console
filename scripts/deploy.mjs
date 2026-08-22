#!/usr/bin/env node
/**
 * Verify and atomically deploy dsh-ops-console to the local profile.
 *
 * This script deliberately has no desktop or Guardian dependency. The
 * candidate's own verification suite is the deployment gate; activation is
 * left to the user's current dsh service workflow.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const DEPLOY_ROOT = process.env.DSH_OPS_DEPLOY_ROOT ?? join(DSH_HOME, 'deployments', 'dsh-ops-console')
const CURRENT = join(DEPLOY_ROOT, 'current')
const BACKUPS = join(DEPLOY_ROOT, 'backups')
const HISTORY = join(DEPLOY_ROOT, 'history.json')
const PROFILE = join(DSH_HOME, 'profiles', 'web')
const liveLink = join(PROFILE, 'node_modules', 'dsh-ops-console')
const packageFile = join(PROFILE, 'package.json')
const lockFile = join(PROFILE, 'pnpm-lock.yaml')
const ITEMS = ['package.json', 'lib', 'scripts', 'cordis.patch.yml', 'README.md', 'LICENSE', '用户体验重构TODO.md']
const KEEP_BACKUPS = 8
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

console.log('== verify candidate ==')
const verified = spawnSync(process.execPath, [join(ROOT, 'scripts', 'verify.mjs')], { stdio: 'inherit' })
if (verified.status !== 0) {
  console.error('deploy aborted: candidate verification failed; live files were not touched.')
  process.exit(1)
}

const originalPackage = readFileSync(packageFile, 'utf8')
const originalLock = existsSync(lockFile) ? readFileSync(lockFile, 'utf8') : null
let originalLink = null
try {
  if (!lstatSync(liveLink).isSymbolicLink()) throw new Error(`refuses to replace a non-symlink package: ${liveLink}`)
  originalLink = readlinkSync(liveLink)
} catch (error) {
  if (existsSync(liveLink)) throw error
}

mkdirSync(BACKUPS, { recursive: true })
const candidate = join(DEPLOY_ROOT, `.candidate-${stamp}`)
rmSync(candidate, { recursive: true, force: true })
mkdirSync(candidate, { recursive: true })
for (const item of ITEMS) cpSync(join(ROOT, item), join(candidate, item), { recursive: true })

let backup = null
if (existsSync(CURRENT)) {
  backup = join(BACKUPS, stamp)
  renameSync(CURRENT, backup)
}
renameSync(candidate, CURRENT)

function restore(reason) {
  const failed = join(DEPLOY_ROOT, `failed-${stamp}`)
  if (existsSync(CURRENT)) renameSync(CURRENT, failed)
  if (backup) renameSync(backup, CURRENT)
  writeFileSync(packageFile, originalPackage)
  if (originalLock !== null) writeFileSync(lockFile, originalLock)
  rmSync(liveLink, { recursive: true, force: true })
  if (originalLink !== null) symlinkSync(originalLink, liveLink, 'dir')
  console.error(`${reason}; deployment was rolled back automatically.`)
}

try {
  const profilePackage = JSON.parse(readFileSync(packageFile, 'utf8'))
  profilePackage.dependencies ??= {}
  const specifier = `link:${CURRENT}`
  profilePackage.dependencies['dsh-ops-console'] = specifier
  writeFileSync(`${packageFile}.new`, JSON.stringify(profilePackage, null, 2) + '\n')
  renameSync(`${packageFile}.new`, packageFile)
  if (existsSync(lockFile)) {
    const lock = readFileSync(lockFile, 'utf8').replace(/(dsh-ops-console:\n\s+specifier:)\s*[^\n]+\n\s+version:\s*[^\n]+/, `$1 ${specifier}\n        version: ${specifier}`)
    writeFileSync(`${lockFile}.new`, lock)
    renameSync(`${lockFile}.new`, lockFile)
  }
  rmSync(`${liveLink}.new`, { recursive: true, force: true })
  symlinkSync(CURRENT, `${liveLink}.new`, 'dir')
  rmSync(liveLink, { recursive: true, force: true })
  renameSync(`${liveLink}.new`, liveLink)
} catch (error) {
  restore(String(error?.message ?? error))
  process.exit(1)
}

function makeReadOnly(path) {
  const stat = lstatSync(path)
  if (stat.isDirectory()) for (const name of readdirSync(path)) makeReadOnly(join(path, name))
  else if (stat.isFile()) chmodSync(path, 0o444)
}
makeReadOnly(CURRENT)
const history = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')) : []
history.push({ at: new Date().toISOString(), action: 'deploy', source: ROOT, current: CURRENT, backup })
writeFileSync(HISTORY, JSON.stringify(history.slice(-100), null, 2) + '\n')
const backups = readdirSync(BACKUPS).filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name)).sort()
while (backups.length > KEEP_BACKUPS) rmSync(join(BACKUPS, backups.shift()), { recursive: true, force: true })
console.log(`deployed -> ${CURRENT}`)
console.log('Reopen or restart your dsh web service when you are ready to activate this version.')
