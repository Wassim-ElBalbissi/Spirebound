import { app } from 'electron'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { logger } from './logger'
import type { StateStore, SaveMigrationRecord } from './persistedState'
import {
  copyVanillaToModdedIfEmpty,
  listProfileDirs,
  type SaveCopyResult
} from './saveCopy'
import { candidateSteamRoots, STS2_STEAM_APP_ID } from './steamPaths'

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
  store: StateStore
): Promise<SaveMigrationResult> {
  const prior = store.get('saveMigration')
  if (prior?.done) {
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
  const backupBase = join(app.getPath('userData'), 'backups', `saves-${stamp}`)

  try {
    const details: Array<{
      label: string
      action: SaveCopyResult['action']
    }> = []
    let firstBackup: string | undefined
    for (const p of pairs) {
      const res = await copyVanillaToModdedIfEmpty({
        vanillaDir: p.vanillaDir,
        moddedDir: p.moddedDir,
        backupRoot: join(backupBase, p.label),
        stamp
      })
      details.push({ label: p.label, action: res.action })
      if (res.backupDir && !firstBackup) firstBackup = res.backupDir
    }

    const migrated = details.filter((d) => d.action === 'migrated')
    const allSkippedFull = details.every(
      (d) => d.action === 'skipped-modded-not-empty'
    )
    const action: SaveMigrationResult['action'] =
      migrated.length > 0 && migrated.length === details.length
        ? 'migrated'
        : migrated.length > 0
          ? 'mixed'
          : allSkippedFull
            ? 'skipped-modded-not-empty'
            : 'mixed'

    const record: SaveMigrationRecord = {
      done: true,
      action,
      migratedAt: stamp,
      backupDir: firstBackup
    }
    store.set('saveMigration', record)
    logger.info({ action, details, backupBase }, 'save migration results')
    return { ok: true, action, details, backupDir: firstBackup }
  } catch (err) {
    logger.error({ err }, 'save migration failed')
    return { ok: false, action: 'error', reason: (err as Error).message }
  }
}
