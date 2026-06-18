import { app } from 'electron'
import { promises as fs } from 'fs'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { logger } from './logger'
import { migrateSaves, type SaveMigrationResult } from './saveMigrator'
import { candidateSteamRoots } from './steamPaths'
import type { StateStore } from './persistedState'

const STS2_DIR_NAME = 'Slay the Spire 2'
const MOD_DLL_NAME = 'STS2_MCP.dll'
const MOD_MANIFEST_NAME = 'STS2_MCP.json'

export interface ModInstallResult {
  ok: boolean
  installedTo?: string
  /** Names of the files copied into the game's mods folder. */
  files?: string[]
  reason?: string
}

/** Combined result of the install-time setup: mod (+deps) install and save migration. */
export interface SetupResult {
  mod: ModInstallResult
  saves: SaveMigrationResult
}

/** Resource folder shipped with the installer / present in dev. */
function bundledModDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'mod')
  }
  return join(app.getAppPath(), 'resources', 'mod')
}

/**
 * Scans Steam library folders for an STS2 install. Reads
 * `<steam>/config/libraryfolders.vdf` (a Valve KV file) and checks each
 * library for `steamapps/common/Slay the Spire 2`. Returns the first match.
 */
export function findSts2Install(): string | null {
  const steamRoots = candidateSteamRoots()
  for (const root of steamRoots) {
    const libs = readLibraryFolders(root)
    for (const lib of libs) {
      const guess = join(lib, 'steamapps', 'common', STS2_DIR_NAME)
      if (existsSync(join(guess, 'SlayTheSpire2.exe'))) {
        return guess
      }
    }
  }
  return null
}

function readLibraryFolders(steamRoot: string): string[] {
  const libs: string[] = [steamRoot]
  const vdfPath = join(steamRoot, 'config', 'libraryfolders.vdf')
  if (!existsSync(vdfPath)) return libs
  try {
    const text = readFileSync(vdfPath, 'utf8')
    // libraryfolders.vdf entries look like:  "path"  "G:\\SteamLibrary"
    const pathRe = /"path"\s+"([^"]+)"/g
    let m: RegExpExecArray | null
    while ((m = pathRe.exec(text)) !== null) {
      const raw = m[1]
      if (!raw) continue
      const p = raw.replace(/\\\\/g, '\\')
      if (!libs.includes(p)) libs.push(p)
    }
  } catch (err) {
    logger.warn({ err }, 'libraryfolders.vdf read failed')
  }
  return libs
}

/**
 * Copies the bundled mod AND its dependencies into the game's mods folder.
 * Everything in `resources/mod` is copied verbatim, so shipping an extra
 * dependency (e.g. `0Harmony.dll`, which the mod references) is just a matter of
 * dropping the file into that folder — no code change here.
 */
export async function installBundledMod(): Promise<ModInstallResult> {
  const gameDir = findSts2Install()
  if (!gameDir) {
    return {
      ok: false,
      reason:
        'Could not locate Slay the Spire 2 in any Steam library. Install or move the game, then retry.'
    }
  }

  const bundled = bundledModDir()
  if (!existsSync(bundled)) {
    return { ok: false, reason: `Bundled mod folder missing at ${bundled}.` }
  }

  let files: string[]
  try {
    files = (await fs.readdir(bundled, { withFileTypes: true }))
      .filter((e) => e.isFile())
      .map((e) => e.name)
  } catch (err) {
    return { ok: false, reason: `Could not read bundled mod folder: ${(err as Error).message}` }
  }

  // The DLL + manifest are the mod itself; any other files are dependencies.
  if (!files.includes(MOD_DLL_NAME) || !files.includes(MOD_MANIFEST_NAME)) {
    return { ok: false, reason: `Bundled mod files missing at ${bundled}.` }
  }

  const modsDir = join(gameDir, 'mods')
  try {
    await fs.mkdir(modsDir, { recursive: true })
  } catch (err) {
    return {
      ok: false,
      reason: `Could not create mods directory: ${(err as Error).message}`
    }
  }

  try {
    for (const name of files) {
      await fs.copyFile(join(bundled, name), join(modsDir, name))
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EBUSY') {
      return {
        ok: false,
        reason: 'The mod is locked by a running Slay the Spire 2 instance — close the game and retry.'
      }
    }
    return {
      ok: false,
      reason: `Copy failed: ${(err as Error).message}`
    }
  }

  logger.info({ modsDir, files }, 'mod installed')
  return { ok: true, installedTo: modsDir, files }
}

/**
 * One-shot install-time setup: install the mod + its dependencies, then migrate
 * the unmodded save profile into the modded scope so progress isn't lost.
 *
 * Best-effort and non-fatal: each step reports its own result and a failure in
 * one never throws past this boundary. Used both by the headless installer step
 * (`--spirebound-setup`) and the in-app onboarding button.
 */
export async function runSetup(store: StateStore): Promise<SetupResult> {
  const mod = await installBundledMod().catch(
    (err): ModInstallResult => ({ ok: false, reason: (err as Error).message })
  )
  const saves = await migrateSaves(store).catch(
    (err): SaveMigrationResult => ({
      ok: false,
      action: 'error',
      reason: (err as Error).message
    })
  )
  logger.info({ mod, saves }, 'spirebound setup complete')
  return { mod, saves }
}
