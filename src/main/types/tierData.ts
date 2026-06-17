import type { Character } from './gameState'

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

export type DataSource =
  | 'codex'
  | 'metabot'
  | 'stratgg'
  | 'spire-archive'
  | 'fallback'

export interface PerSourceScore {
  source: DataSource
  scoreRaw: number
  winRate?: number
  samples?: number
  fetchedAt: number
}

export interface CardTierEntry {
  id: string
  name: string
  character: Character | 'neutral'
  rarity: 'starter' | 'common' | 'uncommon' | 'rare' | 'special' | 'curse'
  tags: string[]
  tier: Tier
  /** 0..100 blended score */
  blendedScore: number
  perSource: PerSourceScore[]
  /** Energy cost. May be 'X' or unknown ('?') for some cards. */
  cost?: number | string
  /** Star cost (the Regent spends Stars instead of / alongside Energy). */
  starCost?: number
  /** Card type for browse display. */
  type?: 'Attack' | 'Skill' | 'Power' | 'Status' | 'Curse'
  /** Rules text for browse display. */
  description?: string
  /** Template with {var} placeholders, used to compute the upgraded text. */
  descriptionTemplate?: string
  /** Current variable values for the template. */
  vars?: Record<string, number | string>
  /** Target (Self / Enemy / All Enemies …) for browse display. */
  target?: string
  /** What changes on upgrade, e.g. { damage: 3 } — shown as "adjustments". */
  upgrade?: Record<string, number | string | string[]>
  /** Expert/editorial commentary shown in the Hub (from the curated bundle). */
  commentary?: string
  /** Attribution for the commentary (e.g. a streamer/author name). */
  author?: string
  /** Absolute URL to the card art (spire-archive.com). */
  imageUrl?: string
  /** True for Colorless cards (usable in any character's deck). */
  colorless?: boolean
}

export interface RelicTierEntry {
  id: string
  name: string
  rarity: 'common' | 'uncommon' | 'rare' | 'boss' | 'event' | 'shop' | 'starter'
  /** Class the relic belongs to, or 'neutral' for shared relics. */
  character?: Character | 'neutral'
  tier: Tier
  blendedScore: number
  tags: string[]
  perSource: PerSourceScore[]
  /** Flavor/rules text for browse display. */
  description?: string
  /** Expert/editorial commentary shown in the Hub (from the curated bundle). */
  commentary?: string
  /** Attribution for the commentary. */
  author?: string
  /** Absolute URL to the relic art (spire-archive.com). */
  imageUrl?: string
}

export interface TierBundle {
  schemaVersion: 1
  gameVersion: string
  fetchedAt: number
  cards: Record<string, CardTierEntry>
  relics: Record<string, RelicTierEntry>
}

export type ArchetypeTagTable = Record<Character, Record<string, number>>
