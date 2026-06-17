import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { rankCardOffers, sweetDeckSize } from '../../src/main/services/recommender/cardPick'
import type { CardInstance } from '../../src/main/types/gameState'
import type { TierBundle } from '../../src/main/types/tierData'

function loadBundle(): TierBundle {
  const p = join(__dirname, '..', '..', 'resources', 'tier-cache', 'bundle.json')
  return JSON.parse(readFileSync(p, 'utf-8'))
}

const OFFERS: CardInstance[] = [
  { id: 'UPPERCUT', name: 'Uppercut', upgraded: false },
  { id: 'HEAVY_BLADE', name: 'Heavy Blade', upgraded: false },
  { id: 'INTIMIDATE', name: 'Intimidate', upgraded: false }
]

describe('rankCardOffers', () => {
  it('produces one ranked entry per offer plus a synthetic Skip', () => {
    const bundle = loadBundle()
    const ranked = rankCardOffers(
      OFFERS,
      { character: 'ironclad', deck: [], act: 1, floor: 4 },
      bundle
    )
    expect(ranked).toHaveLength(4)
    expect(ranked.map((r) => r.id)).toContain('__SKIP__')
  })

  it('Heavy Blade (A-tier) ranks above Intimidate (B-tier) at act 1', () => {
    const bundle = loadBundle()
    const ranked = rankCardOffers(
      OFFERS,
      { character: 'ironclad', deck: [], act: 1, floor: 4 },
      bundle
    )
    const heavyBlade = ranked.find((r) => r.id === 'HEAVY_BLADE')!
    const intimidate = ranked.find((r) => r.id === 'INTIMIDATE')!
    expect(heavyBlade.score).toBeGreaterThan(intimidate.score)
  })

  it('Skip dominates when deck is bloated', () => {
    const bundle = loadBundle()
    const bloat: CardInstance[] = Array.from({ length: 35 }, (_, i) => ({
      id: 'STRIKE_R',
      name: 'Strike',
      upgraded: i % 2 === 0
    }))
    const ranked = rankCardOffers(
      OFFERS,
      { character: 'ironclad', deck: bloat, act: 1, floor: 5 },
      bundle
    )
    expect(ranked[0]?.id).toBe('__SKIP__')
  })

  it('Skip is bottom-ranked when offers are good and deck is healthy', () => {
    const bundle = loadBundle()
    const ranked = rankCardOffers(
      OFFERS,
      { character: 'ironclad', deck: [], act: 1, floor: 4 },
      bundle
    )
    const skip = ranked.find((r) => r.id === '__SKIP__')!
    expect(skip.score).toBeLessThan(ranked[0]!.score)
  })

  it('uses neutral base for unknown card ids without crashing', () => {
    const bundle = loadBundle()
    const ranked = rankCardOffers(
      [{ id: 'COMPLETELY_MADE_UP', name: 'Mystery', upgraded: false }],
      { character: 'ironclad', deck: [], act: 1, floor: 4 },
      bundle
    )
    expect(ranked).toHaveLength(2)
    expect(ranked.find((r) => r.id === 'COMPLETELY_MADE_UP')?.score).toBeGreaterThan(
      0
    )
  })

  it('sweetDeckSize grows with the act', () => {
    expect(sweetDeckSize(1)).toBe(17)
    expect(sweetDeckSize(3)).toBe(21)
  })
})
