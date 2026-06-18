import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Character } from '../../types/gameState'
import type {
  CardTierEntry,
  RelicTierEntry,
  Tier,
  TierBundle
} from '../../types/tierData'
import { logger } from '../logger'
import { deriveArchetypeTags } from './deriveArchetypeTags'

/**
 * Raw shape of `cards.json` from github.com/nkhoit/spire-archive (data/sts2/).
 * Captures only the fields we use; extra fields are tolerated.
 */
interface RawArchiveCard {
  id: string
  name: string
  cost: number | string
  type: 'Attack' | 'Skill' | 'Power' | 'Status' | 'Curse'
  rarity: string
  target?: string
  color: string
  keywords?: string[]
  tags?: string[]
  vars?: Record<string, number | string>
  upgrade?: Record<string, number | string | string[]>
  star_cost?: number
  description?: string
  description_template?: string
  image_url?: string
}

interface RawArchiveRelic {
  id: string
  name: string
  description?: string
  /** Spire-archive calls rarity "tier" here — Common/Uncommon/Rare/Boss/Shop/Event/Starter/Ancient/etc. */
  tier: string
  color?: string
}

const ARCHIVE_DIR_RELATIVE = 'resources/spire-archive'

const SOURCE = 'spire-archive' as const

/** Card/relic art is served by the spire-archive site. */
const IMAGE_HOST = 'https://spire-archive.com'

/**
 * Load the bundled spire-archive snapshot.
 * Returns null if the snapshot is missing (graceful degrade — the bundled
 * fallback in tier-cache/bundle.json still applies).
 */
export function loadSpireArchiveBundle(): TierBundle | null {
  const dir = app.isPackaged
    ? join(process.resourcesPath, 'spire-archive')
    : join(process.cwd(), ARCHIVE_DIR_RELATIVE)

  const cardsPath = join(dir, 'cards.json')
  const relicsPath = join(dir, 'relics.json')
  if (!existsSync(cardsPath) || !existsSync(relicsPath)) {
    logger.warn({ dir }, 'spire-archive snapshot missing')
    return null
  }

  try {
    const rawCards: RawArchiveCard[] = JSON.parse(
      readFileSync(cardsPath, 'utf-8')
    )
    const rawRelics: RawArchiveRelic[] = JSON.parse(
      readFileSync(relicsPath, 'utf-8')
    )

    const cards: Record<string, CardTierEntry> = {}
    for (const r of rawCards) {
      const entry = normalizeCard(r)
      if (entry) cards[entry.id] = entry
    }
    const relics: Record<string, RelicTierEntry> = {}
    for (const r of rawRelics) {
      const entry = normalizeRelic(r)
      if (entry) relics[entry.id] = entry
    }

    return {
      schemaVersion: 1,
      gameVersion: 'spire-archive',
      fetchedAt: 0,
      cards,
      relics
    }
  } catch (err) {
    logger.error({ err }, 'failed to load spire-archive bundle')
    return null
  }
}

/**
 * Merge `override` on top of `base`. Existing entries in base keep their
 * `perSource` history; override values for the same id win on top-level fields.
 */
export function mergeBundles(
  base: TierBundle,
  override: TierBundle
): TierBundle {
  const out: TierBundle = {
    schemaVersion: 1,
    gameVersion: override.gameVersion || base.gameVersion,
    fetchedAt: Math.max(base.fetchedAt, override.fetchedAt),
    cards: { ...base.cards },
    relics: { ...base.relics }
  }

  for (const [id, entry] of Object.entries(override.cards)) {
    const existing = base.cards[id]
    out.cards[id] = existing
      ? mergeCardEntry(existing, entry)
      : entry
  }
  for (const [id, entry] of Object.entries(override.relics)) {
    const existing = base.relics[id]
    out.relics[id] = existing
      ? mergeRelicEntry(existing, entry)
      : entry
  }
  return out
}

function mergeCardEntry(
  base: CardTierEntry,
  override: CardTierEntry
): CardTierEntry {
  return {
    ...base,
    name: override.name || base.name,
    tags: Array.from(new Set([...(base.tags ?? []), ...(override.tags ?? [])])),
    blendedScore: pickScore(base.blendedScore, override.blendedScore),
    tier: pickTier(base.tier, override.tier),
    // Display + editorial fields: curated override wins when present.
    cost: override.cost ?? base.cost,
    starCost: override.starCost ?? base.starCost,
    type: override.type ?? base.type,
    description: override.description ?? base.description,
    descriptionTemplate: override.descriptionTemplate ?? base.descriptionTemplate,
    vars: override.vars ?? base.vars,
    commentary: override.commentary ?? base.commentary,
    author: override.author ?? base.author,
    imageUrl: override.imageUrl ?? base.imageUrl,
    colorless: override.colorless ?? base.colorless,
    perSource: [...base.perSource, ...override.perSource]
  }
}

function mergeRelicEntry(
  base: RelicTierEntry,
  override: RelicTierEntry
): RelicTierEntry {
  return {
    ...base,
    name: override.name || base.name,
    tags: Array.from(new Set([...(base.tags ?? []), ...(override.tags ?? [])])),
    blendedScore: pickScore(base.blendedScore, override.blendedScore),
    tier: pickTier(base.tier, override.tier),
    // Display + editorial fields: curated override wins when present.
    description: override.description ?? base.description,
    commentary: override.commentary ?? base.commentary,
    author: override.author ?? base.author,
    imageUrl: override.imageUrl ?? base.imageUrl,
    character: override.character ?? base.character,
    perSource: [...base.perSource, ...override.perSource]
  }
}

function pickScore(base: number, override: number): number {
  // Override wins when it carries real win-rate data; bundled fallback wins
  // when its score is explicitly higher (the curated baseline cases).
  return override
}

function pickTier(base: Tier, override: Tier): Tier {
  return override
}

function normalizeCard(raw: RawArchiveCard): CardTierEntry | null {
  if (!raw.id || !raw.name) return null

  const character = mapColorToCharacter(raw.color)
  const rarity = mapRarity(raw.rarity)
  const tags = deriveTags(raw)
  const blendedScore = synthesizeCardScore(raw, rarity, tags)
  const tier = scoreToTier(blendedScore)

  return {
    id: raw.id,
    name: raw.name,
    character,
    rarity,
    tags,
    tier,
    blendedScore,
    // Retained for browse display in the Hub. Spire-archive encodes X-cost as -1.
    cost: raw.cost === -1 || raw.cost === '-1' ? 'X' : raw.cost,
    starCost: raw.star_cost,
    type: raw.type,
    description: raw.description,
    descriptionTemplate: raw.description_template,
    vars: raw.vars,
    target: raw.target,
    upgrade: raw.upgrade,
    imageUrl: raw.image_url ? `${IMAGE_HOST}${raw.image_url}` : undefined,
    colorless: (raw.color ?? '').toLowerCase() === 'colorless',
    perSource: [
      {
        source: SOURCE,
        scoreRaw: blendedScore,
        fetchedAt: 0
      }
    ]
  }
}

function normalizeRelic(raw: RawArchiveRelic): RelicTierEntry | null {
  if (!raw.id || !raw.name) return null

  const rarity = mapRelicRarity(raw.tier)
  const tags = deriveRelicTags(raw)
  const blendedScore = synthesizeRelicScore(rarity, tags)
  const tier = scoreToTier(blendedScore)

  return {
    id: raw.id,
    name: raw.name,
    rarity,
    character: mapColorToCharacter(raw.color),
    tags,
    tier,
    blendedScore,
    // Retained for browse display in the Hub.
    description: raw.description,
    imageUrl: `${IMAGE_HOST}/images/sts2/relics/${raw.id.toLowerCase()}.png`,
    perSource: [
      {
        source: SOURCE,
        scoreRaw: blendedScore,
        fetchedAt: 0
      }
    ]
  }
}

const COLOR_TO_CHARACTER: Record<string, Character | 'neutral'> = {
  ironclad: 'ironclad',
  red: 'ironclad',
  silent: 'silent',
  green: 'silent',
  defect: 'defect',
  blue: 'defect',
  regent: 'regent',
  necrobinder: 'necrobinder',
  shared: 'neutral',
  colorless: 'neutral',
  curse: 'neutral',
  event: 'neutral',
  status: 'neutral',
  starter: 'neutral'
}

function mapColorToCharacter(color: string | undefined): Character | 'neutral' {
  if (!color) return 'neutral'
  return COLOR_TO_CHARACTER[color.toLowerCase()] ?? 'neutral'
}

function mapRarity(rarity: string): CardTierEntry['rarity'] {
  const r = rarity.toLowerCase()
  if (r === 'starter' || r === 'basic') return 'starter'
  if (r === 'common') return 'common'
  if (r === 'uncommon') return 'uncommon'
  if (r === 'rare' || r === 'ancient') return 'rare'
  if (r === 'curse') return 'curse'
  if (r === 'status') return 'special'
  return 'special'
}

function mapRelicRarity(t: string): RelicTierEntry['rarity'] {
  const r = t.toLowerCase()
  if (r === 'common' || r === 'shared') return 'common'
  if (r === 'uncommon') return 'uncommon'
  if (r === 'rare' || r === 'ancient') return 'rare'
  if (r === 'boss') return 'boss'
  if (r === 'event') return 'event'
  if (r === 'shop') return 'shop'
  if (r === 'starter') return 'starter'
  return 'common'
}

const VAR_TO_TAG: Record<string, string> = {
  poison: 'poison',
  poison_amount: 'poison',
  damage: 'attack',
  block: 'block-scaling',
  strength: 'strength',
  dexterity: 'block-scaling',
  focus: 'focus',
  shiv: 'shiv',
  shivs: 'shiv',
  orbs: 'orb-gen',
  frost: 'frost',
  lightning: 'lightning',
  thorns: 'thorns',
  weak: 'weak',
  vulnerable: 'vulnerable',
  star_cost: 'star-spend',
  draw: 'draw-cycle',
  cards: 'draw-cycle',
  evoke: 'evoke',
  channel: 'orb-gen'
}

function deriveTags(raw: RawArchiveCard): string[] {
  const tags = new Set<string>()
  for (const k of raw.keywords ?? []) tags.add(k.toLowerCase())
  for (const t of raw.tags ?? []) tags.add(t.toLowerCase())
  for (const v of Object.keys(raw.vars ?? {})) {
    // Real `vars` keys are prefixed (e.g. `power_focus`, `power_lightning_rod`);
    // strip a leading `power_` so the lookup matches the canonical mechanic name.
    const key = v.toLowerCase().replace(/^power_/, '')
    const mapped = VAR_TO_TAG[key]
    if (mapped) tags.add(mapped)
  }
  if (raw.type === 'Attack') tags.add('attack')
  if (raw.type === 'Skill') tags.add('skill')
  if (raw.type === 'Power') tags.add('power')
  // Archetype tags (orb-gen/lightning/frost/poison/strength/…) live in the rules
  // text, not in keywords/vars — derive them so synergy + buildMatch come alive.
  for (const t of deriveArchetypeTags({
    description: raw.description,
    descriptionTemplate: raw.description_template,
    keywords: raw.keywords,
    type: raw.type
  })) {
    tags.add(t)
  }
  return [...tags]
}

function deriveRelicTags(raw: RawArchiveRelic): string[] {
  const tags = new Set<string>()
  const text = (raw.description ?? '').toLowerCase()
  if (text.includes('elite')) tags.add('elite-farm')
  if (text.includes('vigor')) tags.add('strength')
  if (text.includes('block')) tags.add('block')
  if (text.includes('strength')) tags.add('strength')
  if (text.includes('focus')) tags.add('focus')
  if (text.includes('poison')) tags.add('poison')
  if (text.includes('energy')) tags.add('energy')
  if (text.includes('potion')) tags.add('potion')
  if (text.includes('shop')) tags.add('shop')
  if (text.includes('vulnerable')) tags.add('vulnerable')
  if (text.includes('weak')) tags.add('weak')
  if (text.includes('gold')) tags.add('gold')
  if (text.includes('hp')) tags.add('sustain')
  return [...tags]
}

const RARITY_BASE_SCORE: Record<CardTierEntry['rarity'], number> = {
  starter: 25,
  common: 50,
  uncommon: 62,
  rare: 78,
  special: 55,
  curse: 5
}

const TYPE_ADJUST: Record<RawArchiveCard['type'], number> = {
  Attack: 0,
  Skill: 0,
  Power: 5,
  Status: -15,
  Curse: -20
}

function synthesizeCardScore(
  raw: RawArchiveCard,
  rarity: CardTierEntry['rarity'],
  tags: string[]
): number {
  let score = RARITY_BASE_SCORE[rarity] + (TYPE_ADJUST[raw.type] ?? 0)

  // High-impact archetypes get a tiny generic nudge — refined by tier-list
  // data in a future layer.
  const POSITIVE_TAGS = new Set([
    'strength',
    'poison',
    'focus',
    'shiv',
    'orb-gen',
    'block-scaling'
  ])
  for (const t of tags) {
    if (POSITIVE_TAGS.has(t)) score += 1.5
  }
  const NEG_TAGS = new Set(['exhaust', 'sly'])
  for (const t of tags) {
    if (NEG_TAGS.has(t)) score -= 0.5
  }
  return clamp(score, 1, 99)
}

const RELIC_RARITY_BASE: Record<RelicTierEntry['rarity'], number> = {
  starter: 55,
  common: 60,
  uncommon: 65,
  rare: 75,
  boss: 70,
  event: 65,
  shop: 60
}

function synthesizeRelicScore(
  rarity: RelicTierEntry['rarity'],
  tags: string[]
): number {
  let score = RELIC_RARITY_BASE[rarity]
  if (tags.includes('elite-farm')) score += 10
  if (tags.includes('energy')) score += 8
  if (tags.includes('strength')) score += 5
  if (tags.includes('focus')) score += 5
  if (tags.includes('poison')) score += 5
  if (tags.includes('shop')) score += 3
  if (tags.includes('gold')) score += 2
  return clamp(score, 5, 99)
}

function scoreToTier(score: number): Tier {
  if (score >= 80) return 'S'
  if (score >= 70) return 'A'
  if (score >= 55) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
