import { app } from 'electron'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { logger } from './logger'
import type { StateStore, SaveMigrationRecord } from './persistedState'
import {
  copyVanillaToModdedIfNoSaveData,
  listProfileDirs,
  type SaveCopyResult
} from './saveCopy'
import { candidateSteamRoots, STS2_STEAM_APP_ID } from './steamPaths'

/**
 * Version of the save-migration logic. Bumped whenever the copy/lock behavior
 * changes so installs already locked by an older (buggy) record re-run once.
 * v2: content-aware "real save data" gate + non-destructive merge.
 */
export const SAVE_MIGRATION_SCHEMA = 2

export interface SaveMigrationResult {
  ok: boolean
  action:
    | SaveCopyResult['action']
    | 'already-done'
    | 'scopes-not-found'
    | 'mixed'
    | 'error'
  /** Per-profile copy outcomes (for logging / diagnostics). */
  details?: Array<{ label: string; action: SaveCopyResult['action'] }>
  backupDir?: string
  reason?: string
}

/** A vanilla→modded copy pair for one profile slot. */
interface CopyPair {
  label: string
  vanillaDir: string
  moddedDir: string
}

const MODDED_SCOPE = 'modded'

function listDirs(parent: string): string[] {
  try {
    return readdirSync(parent)
      .map((name) => join(parent, name))
      .filter((p) => {
        try {
          return statSync(p).isDirectory()
        } catch {
          return false
        }
      })
  } catch {
    return []
  }
}

/**
 * Build the list of vanilla→modded copy pairs.
 *
 * STS2 stores saves in the Steam Cloud userdata tree:
 *   <steam>/userdata/<accountId>/2868840/remote/
 *     profile1/saves/{progress.save, prefs.save, history/*.run}   ← vanilla scope
 *     modded/profile1/saves/...                                   ← modded scope
 *
 * "Load with Mods" reads the modded scope, so vanilla unlocks/run history don't
 * appear there. We mirror each vanilla `profileN` into `modded/profileN`.
 *
 * Honors SPIREBOUND_SAVE_VANILLA / SPIREBOUND_SAVE_MODDED as a direct override
 * (a single explicit pair) for verification and unusual installs.
 */
export function resolveCopyPairs(): CopyPair[] {
  const envVanilla = process.env['SPIREBOUND_SAVE_VANILLA']
  const envModded = process.env['SPIREBOUND_SAVE_MODDED']
  if (envVanilla && envModded) {
    return [{ label: 'override', vanillaDir: envVanilla, moddedDir: envModded }]
  }

  const pairs: CopyPair[] = []
  for (const steam of candidateSteamRoots()) {
    const userdata = join(steam, 'userdata')
    if (!existsSync(userdata)) continue
    for (const account of listDirs(userdata)) {
      const remote = join(account, STS2_STEAM_APP_ID, 'remote')
      if (!existsSync(remote)) continue
      const moddedRoot = join(remote, MODDED_SCOPE)
      const accountId = account.split(/[\\/]/).pop() ?? 'account'
      for (const profile of listProfileDirs(remote)) {
        pairs.push({
          label: `${accountId}/${profile}`,
          vanillaDir: join(remote, profile),
          moddedDir: join(moddedRoot, profile)
        })
      }
    }
  }
  return pairs
}

/**
 * Copy each vanilla profile into the modded scope so progress carries over when
 * the player chooses "Load with Mods". Per-profile, non-destructive (copy only
 * when the modded profile is empty, backing up first), and idempotent (records
 * the outcome and no-ops once done).
 */
export async function migrateSaves(
  store: StateStore,
  /** Override the backup root (injected for tests so electron isn't needed). */
  backupBaseDir?: string
): Promise<SaveMigrationResult> {
  const prior = store.get('saveMigration')
  // Only honor the lock when it was written by the *current* logic. A record
  // from older, buggy logic (no schemaVersion, or an earlier one) re-runs once.
  if (prior?.done && prior.schemaVersion === SAVE_MIGRATION_SCHEMA) {
    return { ok: true, action: 'already-done', backupDir: prior.backupDir }
  }

  const pairs = resolveCopyPairs()
  if (pairs.length === 0) {
    logger.info('save migration: no STS2 save profiles found yet')
    return {
      ok: true,
      action: 'scopes-not-found',
      reason: 'No STS2 saves found yet; nothing migrated (no data touched).'
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupBase =
    backupBaseDir ?? join(app.getPath('userData'), 'backups', `saves-${stamp}`)

  try {
    const details: Array<{
      label: string
      action: SaveCopyResult['action']
    }> = []
    let firstBackup: string | undefined
    for (const p of pairs) {
      const res = await copyVanillaToModdedIfNoSaveData({
        vanillaDir: p.vanillaDir,
        moddedDir: p.moddedDir,
        backupRoot: join(backupBase, p.label),
        stamp
      })
      details.push({ label: p.label, action: res.action })
      if (res.backupDir && !firstBackup) firstBackup = res.backupDir
    }

    const migrated = details.filter((d) => d.action === 'migrated')
    // At least one profile ended up with real progress in the modded scope.
    const settledProgress = details.some(
      (d) => d.action === 'migrated' || d.action === 'already-correct'
    )
    // "Terminal" = every profile reached a state a retry won't change: copied,
    // already had data, an unresolvable overlap, or simply no vanilla data to
    // copy. (`scopes-not-found` short-circuits earlier and never reaches here.)
    const terminal = details.every((d) =>
      [
        'migrated',
        'already-correct',
        'skipped-overlapping-paths',
        'skipped-no-vanilla'
      ].includes(d.action)
    )

    const action: SaveMigrationResult['action'] =
      migrated.length > 0 && migrated.length === details.length
        ? 'migrated'
        : migrated.length > 0
          ? 'mixed'
          : details.every((d) => d.action === 'already-correct')
            ? 'already-correct'
            : 'mixed'

    const record: SaveMigrationRecord = {
      // Only lock the migration once it has genuinely settled. A transient
      // "no saves synced yet" (settledProgress=false) must be retryable, so we
      // leave done=false and re-attempt on a later setup run.
      done: terminal && settledProgress,
      schemaVersion: SAVE_MIGRATION_SCHEMA,
      action,
      migratedAt: stamp,
      backupDir: firstBackup
    }
    store.set('saveMigration', record)
    logger.info(
      { action, details, backupBase, done: record.done },
      'save migration results'
    )
    return { ok: true, action, details, backupDir: firstBackup }
  } catch (err) {
    logger.error({ err }, 'save migration failed')
    return { ok: false, action: 'error', reason: (err as Error).message }
  }
}
