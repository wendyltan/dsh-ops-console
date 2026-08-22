#!/usr/bin/env node
/** Atomically restore the most recent verified plugin snapshot. */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const ROOT = process.env.DSH_OPS_DEPLOY_ROOT ?? join(DSH_HOME, 'deployments', 'dsh-ops-console')
const CURRENT = join(ROOT, 'current')
const BACKUPS = join(ROOT, 'backups')
const HISTORY = join(ROOT, 'history.json')
mkdirSync(BACKUPS, { recursive: true })

const names = readdirSync(BACKUPS).filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name)).sort()
if (!names.length) {
  console.error('no internal deployment backup exists; rollback aborted.')
  process.exit(1)
}
const chosen = names[names.length - 1]
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const displaced = join(BACKUPS, `displaced-${stamp}`)
const hadCurrent = existsSync(CURRENT)
if (hadCurrent) renameSync(CURRENT, displaced)
renameSync(join(BACKUPS, chosen), CURRENT)
const history = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')) : []
history.push({ at: new Date().toISOString(), action: 'rollback', restored: chosen, displaced: hadCurrent ? displaced : null })
writeFileSync(HISTORY, JSON.stringify(history.slice(-100), null, 2) + '\n')
console.log(`restored ${chosen}. Reopen or restart your dsh web service when ready.`)
