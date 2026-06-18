import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  rankUpgrades,
  decideRestAction,
  parseHealAmount
} from '../../src/main/services/recommender/restUpgrade'
import type { BuildMatch } from '../../src/main/services/recommender/buildMatch'
import type { BuildEntry } from '../../src/main/types/compendium'
import type { CardInstance } from '../../src/main/types/gameState'
import type { TierBundle } from '../../src/main/types/tierData'

function loadBundle(): TierBundle {
  const p = join(__dirname, '..', '..', 'resources', 'tier-cache', 'bundle.json')
  return JSON.parse(readFileSync(p, 'utf-8'))
}

const card = (id: string, upgraded = false): CardInstance => ({
  id,
  name: id,
  upgraded
})

const strengthBuild: BuildMatch = {
  build: {
    id: 'ic_strength',
    name: 'Strength Scaling',
    keyCards: ['HEAVY_BLADE']
  } as BuildEntry,
  score: 0.6,
  cardOverlap: new Set(),
  relicOverlap: new Set()
}

describe('rankUpgrades', () => {
  const bundle = loadBundle()

  it('ranks a build key card above basic Strikes and reports copies', () => {
    const deck = [
      card('STRIKE_R'),
      card('STRIKE_R'),
      card('HEAVY_BLADE'),
      card('DEFEND_R', true) // already upgraded — excluded
    ]
    const res = rankUpgrades(deck, { matchedBuild: strengthBuild }, bundle)

    expect(res[0]?.id).toBe('HEAVY_BLADE')
    expect(res[0]?.buildKey).toBe(true)

    const strike = res.find((r) => r.id === 'STRIKE_R')!
    expect(strike.copies).toBe(2)
    expect(strike.rationale.join(' ').toLowerCase()).toContain('basic')

    // Already-upgraded cards can't be smithed again.
    expect(res.find((r) => r.id === 'DEFEND_R')).toBeUndefined()
  })

  it('returns nothing for an unknown / empty deck', () => {
    expect(rankUpgrades([], {}, bundle)).toEqual([])
    // A fully-upgraded deck has nothing to smith.
    expect(rankUpgrades([card('STRIKE_R', true)], {}, bundle)).toEqual([])
  })
})

describe('decideRestAction', () => {
  const baseInput = {
    healAmount: 24,
    canRest: true,
    canSmith: true,
    upgradeTargets: 5,
    deckKnown: true,
    dangerAhead: false
  }

  it('recommends Rest when critically low on HP', () => {
    const a = decideRestAction({ ...baseInput, hp: 2, maxHp: 81 })
    expect(a.recommended).toBe('rest')
    expect(a.effectiveHeal).toBe(24) // missing 79, heal 24
    expect(a.reason.toLowerCase()).toMatch(/critically low/)
  })

  it('recommends Smith when healthy', () => {
    const a = decideRestAction({ ...baseInput, hp: 70, maxHp: 81 })
    expect(a.recommended).toBe('smith')
  })

  it('recommends Rest below half HP', () => {
    expect(decideRestAction({ ...baseInput, hp: 30, maxHp: 81 }).recommended).toBe(
      'rest'
    )
  })

  it('rests before an Elite/Boss even at a comfortable HP', () => {
    const safe = decideRestAction({ ...baseInput, hp: 52, maxHp: 81 })
    expect(safe.recommended).toBe('smith') // 64%, nothing ahead
    const danger = decideRestAction({
      ...baseInput,
      hp: 52,
      maxHp: 81,
      dangerAhead: true
    })
    expect(danger.recommended).toBe('rest') // 64% but a hard fight looms
  })

  it('smiths at near-full HP rather than waste the heal', () => {
    const a = decideRestAction({ ...baseInput, hp: 78, maxHp: 81 })
    expect(a.recommended).toBe('smith')
    expect(a.reason.toLowerCase()).toMatch(/wasted|near full/)
  })

  it('rests when there is nothing left to upgrade', () => {
    const a = decideRestAction({
      ...baseInput,
      hp: 75,
      maxHp: 81,
      upgradeTargets: 0,
      deckKnown: true
    })
    expect(a.recommended).toBe('rest')
    expect(a.reason.toLowerCase()).toMatch(/nothing left to upgrade/)
  })

  it('does not assume "nothing to upgrade" when the deck is unknown', () => {
    const a = decideRestAction({
      ...baseInput,
      hp: 75,
      maxHp: 81,
      upgradeTargets: 0,
      deckKnown: false
    })
    expect(a.recommended).toBe('smith')
  })
})

describe('parseHealAmount', () => {
  it('reads the explicit heal amount from the Rest option text', () => {
    const amt = parseHealAmount(
      [{ id: 'HEAL', name: 'Rest', description: 'Heal for 30% of your Max HP (24).' }],
      81
    )
    expect(amt).toBe(24)
  })

  it('falls back to 30% of max HP when no number is present', () => {
    expect(parseHealAmount([], 80)).toBe(24)
  })
})
