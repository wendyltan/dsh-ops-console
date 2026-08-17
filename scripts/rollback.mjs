#!/usr/bin/env node
/** Roll back the internal deployment, then require a guardian preflight. */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const ROOT = process.env.DSH_OPS_DEPLOY_ROOT ?? join(DSH_HOME, 'deployments', 'dsh-ops-console')
const CURRENT = join(ROOT, 'current')
const BACKUPS = join(ROOT, 'backups')
const HISTORY = join(ROOT, 'history.json')
const GUARDIAN = join(DSH_HOME, 'guardian', 'guardian.mjs')
mkdirSync(BACKUPS, { recursive: true })

const names = readdirSync(BACKUPS).sort()
if (names.length === 0) {
  console.error('no internal deployment backup exists; rollback aborted.')
  process.exit(1)
}
const chosen = names[names.length - 1]
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const displaced = join(BACKUPS, `displaced-${stamp}`)
if (existsSync(CURRENT)) renameSync(CURRENT, displaced)
renameSync(join(BACKUPS, chosen), CURRENT)

const checked = spawnSync(process.execPath, [GUARDIAN, 'preflight', '--json'], { encoding: 'utf8', timeout: 120_000 })
process.stdout.write(checked.stdout || '')
let ok = checked.status === 0
try { ok &&= JSON.parse(checked.stdout).ok === true } catch { ok = false }
if (!ok) {
  renameSync(CURRENT, join(BACKUPS, chosen))
  renameSync(displaced, CURRENT)
  console.error('rollback candidate failed guardian preflight; original deployment restored.')
  process.exit(1)
}

const history = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')) : []
history.push({ at: new Date().toISOString(), action: 'rollback', restored: chosen, displaced })
writeFileSync(HISTORY, JSON.stringify(history.slice(-100), null, 2) + '\n')
spawnSync(process.execPath, [GUARDIAN, 'snapshot', '--json'], { stdio: 'inherit' })
console.log(`restored ${chosen}; activate with guardian restart.`)
