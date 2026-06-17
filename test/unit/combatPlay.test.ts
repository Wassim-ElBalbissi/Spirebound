import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { rankCombatPlays } from '../../src/main/services/recommender/combatPlay'
import { normalize } from '../../src/main/services/screens'
import type { RawGameState } from '../../src/main/types/rawState'

function fixture(name: string): RawGameState {
  return JSON.parse(
    readFileSync(join(__dirname, '..', 'fixtures', name), 'utf-8')
  )
}

function combatFromFixture(name: string) {
  const out = normalize(fixture(name))
  if (out.screen.kind !== 'combat')
    throw new Error(`fixture ${name} did not normalize to combat`)
  return out.screen.combat
}

describe('rankCombatPlays', () => {
  it('flags lethal as the top recommendation', () => {
    const combat = combatFromFixture('combat.lethal.json')
    const res = rankCombatPlays(combat)
    expect(res.ranked.length).toBeGreaterThan(0)
    expect(res.ranked[0]?.id).toBe('STRIKE_R')
    expect(res.ranked[0]?.rationale.join(' ')).toMatch(/lethal/i)
  })

  it('reports incoming damage and required block', () => {
    const combat = combatFromFixture('combat.lethal.json')
    const res = rankCombatPlays(combat)
    expect(res.incomingDamage).toBe(11)
    expect(res.blockNeeded).toBe(11)
  })

  it('returns empty ranked list and a note when it is not the player turn', () => {
    const combat = combatFromFixture('combat.lethal.json')
    const enemyTurn = { ...combat, turn: 'enemy' as const }
    const res = rankCombatPlays(enemyTurn)
    expect(res.ranked).toHaveLength(0)
    expect(res.notes.join(' ').toLowerCase()).toContain('enemy turn')
  })

  it('excludes cards the mod marked as unplayable', () => {
    const combat = combatFromFixture('combat.lethal.json')
    const unplayable = {
      ...combat,
      hand: combat.hand.map((c) => ({
        ...c,
        canPlay: false,
        unplayableReason: 'test'
      }))
    }
    const res = rankCombatPlays(unplayable)
    expect(res.ranked).toHaveLength(0)
  })

  it('surfaces every playable card, even utility ones with no parsed numbers', () => {
    const combat = combatFromFixture('combat.noThreats.mixedHand.json')
    const res = rankCombatPlays(combat)
    expect(res.ranked).toHaveLength(combat.hand.length)
    const ids = res.ranked.map((r) => r.id)
    expect(ids).toContain('DEFEND_B')
    expect(ids).toContain('STRIKE_B')
    expect(ids).toContain('DUALCAST')
  })

  it('Defend with no threats stays non-negative and ranks below attacks', () => {
    const combat = combatFromFixture('combat.noThreats.mixedHand.json')
    const res = rankCombatPlays(combat)
    for (const row of res.ranked) {
      expect(row.score).toBeGreaterThanOrEqual(0)
    }
    const defend = res.ranked.find((r) => r.id === 'DEFEND_B')!
    const strike = res.ranked.find((r) => r.id === 'STRIKE_B')!
    expect(strike.score).toBeGreaterThan(defend.score)
  })

  it('utility cards get a small fallback score with explanatory rationale', () => {
    const combat = combatFromFixture('combat.noThreats.mixedHand.json')
    const res = rankCombatPlays(combat)
    const dualcast = res.ranked.find((r) => r.id === 'DUALCAST')!
    expect(dualcast.score).toBeGreaterThan(0)
    expect(dualcast.rationale.join(' ').toLowerCase()).toContain('utility')
  })
})
