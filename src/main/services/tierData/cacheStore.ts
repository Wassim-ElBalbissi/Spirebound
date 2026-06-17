import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { TierBundle } from '../../types/tierData'
import { logger } from '../logger'
import { loadSpireArchiveBundle, mergeBundles } from './spireArchive'

const BUNDLED_RELATIVE = 'resources/tier-cache/bundle.json'

/**
 * Compose the tier bundle from two layers, lowest to highest priority:
 *
 *   1. **Hand-curated bundle** at `resources/tier-cache/bundle.json` — small,
 *      carries explicit win-rate proxies for high-confidence cards.
 *   2. **Spire-archive snapshot** at `resources/spire-archive/{cards,relics}.json`
 *      — full catalog from github.com/nkhoit/spire-archive (~577 cards, ~289
 *      relics). Scores are synthesized from rarity/type/tags so every card
 *      gets a sensible default.
 *
 * Later layers can be added (live win-rate scrape from MetaBot.GG, etc.)
 * without changing the loader signature.
 */
let cachedBundle: TierBundle | null = null

export function loadTierBundle(): TierBundle {
  const curated = loadCuratedBundle()
  const archive = loadSpireArchiveBundle()
  const merged = archive ? mergeBundles(archive, curated) : curated
  cachedBundle = merged
  return merged
}

/**
 * Return the merged bundle, loading it once and caching it. Used to serve the
 * full catalog to the Hub window without re-reading from disk on every request.
 */
export function getTierBundle(): TierBundle {
  return cachedBundle ?? loadTierBundle()
}

function loadCuratedBundle(): TierBundle {
  const bundledPath = app.isPackaged
    ? join(process.resourcesPath, 'tier-cache', 'bundle.json')
    : join(process.cwd(), BUNDLED_RELATIVE)

  if (!existsSync(bundledPath)) {
    logger.warn({ bundledPath }, 'curated tier bundle missing; using empty bundle')
    return emptyBundle()
  }

  try {
    const raw = readFileSync(bundledPath, 'utf-8')
    return JSON.parse(raw) as TierBundle
  } catch (err) {
    logger.error({ err }, 'failed to parse curated tier bundle')
    return emptyBundle()
  }
}

export function emptyBundle(): TierBundle {
  return {
    schemaVersion: 1,
    gameVersion: 'unknown',
    fetchedAt: 0,
    cards: {},
    relics: {}
  }
}
