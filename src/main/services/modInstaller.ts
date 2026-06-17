import { app } from 'electron'
import { promises as fs } from 'fs'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { logger } from './logger'

const STS2_DIR_NAME = 'Slay the Spire 2'
const MOD_DLL_NAME = 'STS2_MCP.dll'
const MOD_MANIFEST_NAME = 'STS2_MCP.json'

export interface ModInstallResult {
  ok: boolean
  installedTo?: string
  reason?: string
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

function candidateSteamRoots(): string[] {
  const out: string[] = []
  const pf86 = process.env['ProgramFiles(x86)']
  const pf = process.env['ProgramFiles']
  if (pf86) out.push(join(pf86, 'Steam'))
  if (pf) out.push(join(pf, 'Steam'))
  return out.filter(existsSync)
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
  const dllSrc = join(bundled, MOD_DLL_NAME)
  const manifestSrc = join(bundled, MOD_MANIFEST_NAME)
  if (!existsSync(dllSrc) || !existsSync(manifestSrc)) {
    return {
      ok: false,
      reason: `Bundled mod files missing at ${bundled}.`
    }
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
    await fs.copyFile(dllSrc, join(modsDir, MOD_DLL_NAME))
    await fs.copyFile(manifestSrc, join(modsDir, MOD_MANIFEST_NAME))
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

  logger.info({ modsDir }, 'mod installed')
  return { ok: true, installedTo: modsDir }
}

// keep dirname referenced so unused-import lint is happy if we extend later
void dirname
