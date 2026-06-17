import type { Character } from '../../types/gameState'
import type { ArchetypeTagTable } from '../../types/tierData'

/**
 * Archetype weights per character. Heuristic, hand-curated.
 * The numerator is a strictly-positive boost applied when a card with the tag
 * is offered into a deck already containing cards with synergistic tags.
 *
 * These are intentionally rough — scraped data refines them later.
 */
export const ARCHETYPE_TAGS: ArchetypeTagTable = {
  ironclad: {
    strength: 1.2,
    'block-scaling': 1.1,
    exhaust: 1.0,
    'self-damage': 0.8,
    attack: 0.6
  },
  silent: {
    poison: 1.3,
    shiv: 1.2,
    discard: 1.1,
    'draw-cycle': 1.0,
    'weak': 0.7
  },
  defect: {
    'orb-gen': 1.3,
    focus: 1.2,
    frost: 1.0,
    lightning: 1.0,
    evoke: 1.1
  },
  regent: {
    'star-gen': 1.2,
    'star-spend': 1.2,
    'court-summon': 1.1,
    decree: 1.0
  },
  necrobinder: {
    minion: 1.3,
    sacrifice: 1.2,
    'corpse-gen': 1.1,
    'minion-buff': 1.0
  }
}

export function tagWeight(character: Character, tag: string): number {
  return ARCHETYPE_TAGS[character]?.[tag] ?? 0
}

/**
 * Pick the dominant archetype tag(s) in the deck for the given character.
 * Returns tags with their accumulated weight, sorted descending.
 */
export function dominantArchetypes(
  character: Character,
  deckTagCounts: Map<string, number>
): { tag: string; weight: number }[] {
  const out: { tag: string; weight: number }[] = []
  for (const [tag, count] of deckTagCounts) {
    const w = tagWeight(character, tag) * count
    if (w > 0) out.push({ tag, weight: w })
  }
  return out.sort((a, b) => b.weight - a.weight)
}

/**
 * Capped synergy boost for a candidate card against a deck.
 * Each shared character-weighted tag adds proportionally; capped at 0.6.
 */
export function synergyScore(
  character: Character,
  candidateTags: string[],
  deckTagCounts: Map<string, number>
): number {
  if (deckTagCounts.size === 0) return 0
  let raw = 0
  for (const tag of candidateTags) {
    const w = tagWeight(character, tag)
    if (w === 0) continue
    const inDeck = deckTagCounts.get(tag) ?? 0
    raw += w * Math.min(inDeck, 4) * 0.15
  }
  return Math.min(raw, 0.6)
}
