import { existsSync } from 'fs'
import { join } from 'path'

/** Slay the Spire 2's Steam app id (used for the userdata save root). */
export const STS2_STEAM_APP_ID = '2868840'

/**
 * Steam install roots to probe. These hold `config/libraryfolders.vdf` and the
 * `userdata/` save tree — they are NOT the same as game library folders (which
 * can live on other drives).
 */
export function candidateSteamRoots(): string[] {
  const out: string[] = []
  const pf86 = process.env['ProgramFiles(x86)']
  const pf = process.env['ProgramFiles']
  if (pf86) out.push(join(pf86, 'Steam'))
  if (pf) out.push(join(pf, 'Steam'))
  return out.filter(existsSync)
}
