import type { Character } from './gameState'
import type { Tier } from './tierData'

/**
 * Hand-authored + fetched reference data for the Hub's browse section. Cards and
 * relics come from the tier bundle; potions / events are fetched from
 * spire-archive; characters and builds are curated here.
 */

export interface CharacterEntry {
  id: Character
  name: string
  /** One-line identity / pitch. */
  blurb: string
  /** Dominant deck archetypes, ordered strongest-first. */
  archetypes: string[]
  /** Starting relic id (matches a relic in the tier bundle when known). */
  starterRelic?: string
  description?: string
  /** Portrait art (spire-archive.com). */
  imageUrl?: string
}

export interface PotionEntry {
  id: string
  name: string
  /** common | uncommon | rare | event (others map to common). */
  rarity: string
  description: string
  tags?: string[]
  imageUrl?: string
}

export interface EventEntry {
  id: string
  name: string
  /** Act(s) the event can appear in; empty when unknown (early access). */
  acts: number[]
  description: string
  tags?: string[]
}

/** A curated, rateable build/archetype for a character. */
export interface BuildEntry {
  id: string
  character: Character
  name: string
  /** Overall strength tier. */
  tier: Tier
  /** 0..100 community-style rating. */
  rating: number
  /** One-line pitch. */
  summary: string
  /** Archetype tags that define the deck (used to bias the overlay on apply). */
  archetypeTags: string[]
  /** Signature card ids (bundle ids) to prioritize. */
  keyCards?: string[]
  /** Signature relic ids. */
  keyRelics?: string[]
  /** How to pilot the build. */
  howToPlay?: string
}

/** A buff / debuff / status / keyword and what it does. */
export interface GlossaryEntry {
  id: string
  name: string
  description: string
  kind: 'Buff' | 'Debuff' | 'Keyword' | 'Enchantment'
}

export interface Compendium {
  characters: CharacterEntry[]
  potions: PotionEntry[]
  events: EventEntry[]
  builds: BuildEntry[]
  glossary: GlossaryEntry[]
}
