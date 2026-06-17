import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type {
  BuildEntry,
  CharacterEntry,
  Compendium,
  EventEntry,
  GlossaryEntry,
  PotionEntry
} from '../../types/compendium'
import { logger } from '../logger'

const COMPENDIUM_DIR_RELATIVE = 'resources/compendium'

let cached: Compendium | null = null

/**
 * Load the hand-authored Characters / Potions / Events seed data. Same
 * packaged-vs-dev path resolution as the spire-archive loader. Missing or
 * malformed files degrade to empty arrays rather than crashing.
 */
export function loadCompendium(): Compendium {
  if (cached) return cached

  const dir = app.isPackaged
    ? join(process.resourcesPath, 'compendium')
    : join(process.cwd(), COMPENDIUM_DIR_RELATIVE)

  cached = {
    characters: readJson<CharacterEntry[]>(join(dir, 'characters.json')) ?? [],
    potions: readJson<PotionEntry[]>(join(dir, 'potions.json')) ?? [],
    events: readJson<EventEntry[]>(join(dir, 'events.json')) ?? [],
    builds: readJson<BuildEntry[]>(join(dir, 'builds.json')) ?? [],
    glossary: readJson<GlossaryEntry[]>(join(dir, 'glossary.json')) ?? []
  }
  return cached
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) {
    logger.warn({ path }, 'compendium file missing')
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch (err) {
    logger.error({ err, path }, 'failed to parse compendium file')
    return null
  }
}
