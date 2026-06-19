import { existsSync, promises as fs, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

/**
 * Pure, dependency-free save-copy engine. Kept separate from saveMigrator so it
 * can be unit-tested without pulling in electron (`app`) or the logger.
 *
 * Policy: copy the vanilla save scope into the modded scope when the modded
 * scope holds no REAL save data (no `saves/progress.save` and no run history) —
 * even if the game has already pre-created an empty `saves/` scaffold there.
 * The copy is a non-destructive MERGE: vanilla is read-only, existing modded
 * files are never overwritten (only missing ones are filled in), and any
 * pre-existing modded target is backed up first.
 */

export type SaveCopyAction =
  | 'migrated'
  /** Modded scope already holds real progress — left untouched. */
  | 'already-correct'
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

/** Save files that represent real run/unlock progress (not just settings). */
const REAL_SAVE_FILES = ['progress.save']

async function isNonEmptyFile(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).size > 0
  } catch {
    return false
  }
}

/**
 * True when a profile directory holds actual STS2 progress — a non-empty
 * `saves/progress.save` or at least one `saves/history/*.run`.
 *
 * Crucially, an empty `saves/` (or a lone `prefs.save`, which is only settings)
 * does NOT count: STS2 pre-creates that scaffold under the modded scope, and
 * treating it as "has data" is exactly what made migration skip on new
 * installs. We key off real run/unlock data instead of directory emptiness.
 */
export async function hasRealSaveData(profileDir: string): Promise<boolean> {
  const savesDir = join(profileDir, 'saves')
  for (const name of REAL_SAVE_FILES) {
    if (await isNonEmptyFile(join(savesDir, name))) return true
  }
  try {
    const history = await fs.readdir(join(savesDir, 'history'))
    if (history.some((n) => n.toLowerCase().endsWith('.run'))) return true
  } catch {
    /* no history dir */
  }
  return false
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

export async function copyVanillaToModdedIfNoSaveData(
  opts: CopyOptions
): Promise<SaveCopyResult> {
  const { vanillaDir, moddedDir, backupRoot, stamp } = opts
  const base = { vanillaDir, moddedDir }

  if (pathsOverlap(vanillaDir, moddedDir)) {
    return { ...base, action: 'skipped-overlapping-paths' }
  }
  if (!(await hasRealSaveData(vanillaDir))) {
    return { ...base, action: 'skipped-no-vanilla' }
  }
  if (await hasRealSaveData(moddedDir)) {
    // Modded already holds real progress — never clobber it.
    return { ...base, action: 'already-correct' }
  }

  // Back up any pre-existing modded scaffold (the empty `saves/` dirs the game
  // pre-creates) so the operation is auditable and reversible, then MERGE the
  // vanilla tree in — `force:false` means an existing modded file is never
  // overwritten, only missing files are filled in.
  let backupDir: string | undefined
  if (existsSync(moddedDir)) {
    backupDir = join(backupRoot, `modded-${stamp}`)
    await fs.cp(moddedDir, backupDir, { recursive: true })
  }

  await fs.mkdir(moddedDir, { recursive: true })
  await fs.cp(vanillaDir, moddedDir, {
    recursive: true,
    force: false,
    errorOnExist: false
  })
  const copiedEntries = (await fs.readdir(moddedDir)).length

  return { ...base, action: 'migrated', backupDir, copiedEntries }
}
