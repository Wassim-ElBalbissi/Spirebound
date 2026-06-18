import { existsSync, promises as fs, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

/**
 * Pure, dependency-free save-copy engine. Kept separate from saveMigrator so it
 * can be unit-tested without pulling in electron (`app`) or the logger.
 *
 * Policy (confirmed with the user): copy the vanilla save scope into the modded
 * scope ONLY when the modded scope is empty, backing up the modded target
 * first. This is non-destructive — vanilla is read-only, and existing modded
 * progress is never overwritten.
 */

export type SaveCopyAction =
  | 'migrated'
  | 'skipped-modded-not-empty'
  | 'skipped-no-vanilla'
  | 'skipped-overlapping-paths'

export interface SaveCopyResult {
  action: SaveCopyAction
  vanillaDir: string
  moddedDir: string
  backupDir?: string
  copiedEntries?: number
}

export interface CopyOptions {
  vanillaDir: string
  moddedDir: string
  /** Root under which a timestamped backup of the modded target is written. */
  backupRoot: string
  /** Timestamp segment for the backup folder name (injected for tests). */
  stamp: string
}

/**
 * Names of profile-slot directories (`profile1`, `profile2`, …) directly under
 * a save scope root. STS2 keeps per-profile progress in these; the modded scope
 * mirrors the same slot names under `remote/modded/`.
 */
export function listProfileDirs(scopeRoot: string): string[] {
  try {
    return readdirSync(scopeRoot).filter((name) => {
      if (!/^profile\d+$/i.test(name)) return false
      try {
        return statSync(join(scopeRoot, name)).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

/** A directory counts as empty if it is missing or contains no entries. */
export async function isEmptyDir(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return true
  try {
    const entries = await fs.readdir(dir)
    return entries.length === 0
  } catch {
    return true
  }
}

/**
 * True when one path is the other (or a parent of the other). Copying between
 * overlapping paths would recurse/duplicate, so we refuse it.
 */
export function pathsOverlap(a: string, b: string): boolean {
  const ra = resolve(a)
  const rb = resolve(b)
  if (ra === rb) return true
  const aWithSep = ra.endsWith('\\') || ra.endsWith('/') ? ra : ra + '\\'
  const bWithSep = rb.endsWith('\\') || rb.endsWith('/') ? rb : rb + '\\'
  return (
    rb.toLowerCase().startsWith(aWithSep.toLowerCase()) ||
    ra.toLowerCase().startsWith(bWithSep.toLowerCase())
  )
}

export async function copyVanillaToModdedIfEmpty(
  opts: CopyOptions
): Promise<SaveCopyResult> {
  const { vanillaDir, moddedDir, backupRoot, stamp } = opts
  const base = { vanillaDir, moddedDir }

  if (pathsOverlap(vanillaDir, moddedDir)) {
    return { ...base, action: 'skipped-overlapping-paths' }
  }
  if (await isEmptyDir(vanillaDir)) {
    return { ...base, action: 'skipped-no-vanilla' }
  }
  if (!(await isEmptyDir(moddedDir))) {
    return { ...base, action: 'skipped-modded-not-empty' }
  }

  // Back up an existing (empty) modded target so the operation is auditable and
  // reversible, then copy the vanilla tree in.
  let backupDir: string | undefined
  if (existsSync(moddedDir)) {
    backupDir = join(backupRoot, `modded-${stamp}`)
    await fs.cp(moddedDir, backupDir, { recursive: true })
  }

  await fs.mkdir(moddedDir, { recursive: true })
  await fs.cp(vanillaDir, moddedDir, { recursive: true })
  const copiedEntries = (await fs.readdir(moddedDir)).length

  return { ...base, action: 'migrated', backupDir, copiedEntries }
}
