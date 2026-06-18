import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { rankHandSelect } from '../../src/main/services/recommender/cardChoiceAdvisor'
import { normalize } from '../../src/main/services/screens'
import type { RawGameState } from '../../src/main/types/rawState'
import type { CardInstance, CombatState, EnemyState } from '../../src/main/types/gameState'

function card(p: Partial<CardInstance> & { id: string; name: string }): CardInstance {
  return { upgraded: false, ...p }
}

function enemy(intentLabel: string | null): EnemyState {
  return {
    entityId: 'e1',
    name: 'Brute',
    hp: 40,
    maxHp: 40,
    block: 0,
    status: [],
    intent: intentLabel ? { type: 'Attack', label: intentLabel } : null
  }
}

/** Minimal combat — rankHandSelect only reads enemies (intents) and block. */
function combat(block: number, enemies: EnemyState[]): CombatState {
  return {
    round: 1,
    turn: 'player',
    energy: 3,
    maxEnergy: 3,
    block,
    hp: 60,
    maxHp: 70,
    hand: [],
    enemies,
    playerStatus: [],
    potions: [],
    orbs: [],
    deck: []
  } as CombatState
}

describe('rankHandSelect (in-combat card choice)', () => {
  it('normalizes the live discard capture and discards the Strike, keeping the Defends', () => {
    const raw: RawGameState = JSON.parse(
      readFileSync(join(__dirname, '..', 'fixtures', 'handSelect.discard.silent.json'), 'utf-8')
    )
    const out = normalize(raw)
    if (out.screen.kind !== 'handSelect') throw new Error('expected handSelect, got ' + out.screen.kind)
    expect(out.screen.action).toBe('discard')

    const ranked = rankHandSelect(out.screen.cards, out.screen.combat, out.screen.action)
    // An attack is incoming and block is short, so the Strike is the dead weight.
    expect(ranked[0].name).toBe('Strike')
    // Both Defends are the least-discardable (you need the Block).
    expect(ranked[ranked.length - 1].name).toBe('Defend')
    const defend = ranked.find((r) => r.name === 'Defend')!
    expect(defend.rationale.join(' ')).toMatch(/need block/i)
  })

  it('protects a block card only while a hit is incoming', () => {
    const cards = [
      card({ id: 'DEFEND', name: 'Defend', rarity: 'Basic', type: 'Skill', description: 'Gain 5 Block.' }),
      card({ id: 'CLEAVE', name: 'Cleave', type: 'Attack', description: 'Deal 8 damage to ALL enemies.' })
    ]
    const underAttack = rankHandSelect(cards, combat(0, [enemy('12')]), 'discard')
    // With a hit incoming, you keep Block — the attack is the better discard.
    expect(underAttack[0].name).toBe('Cleave')

    const safe = rankHandSelect(cards, combat(0, [enemy(null)]), 'discard')
    // Nothing attacking → the Block has no situational value, so the basic
    // Defend becomes the chaff to drop.
    expect(safe[0].name).toBe('Defend')
  })

  it('always treats a Status/Curse as the top thing to dump', () => {
    const cards = [
      card({ id: 'STRIKE', name: 'Strike', rarity: 'Basic', type: 'Attack', description: 'Deal 6 damage.' }),
      card({ id: 'WOUND', name: 'Wound', type: 'Status', description: 'Unplayable.' })
    ]
    const ranked = rankHandSelect(cards, combat(0, [enemy('10')]), 'discard')
    expect(ranked[0].name).toBe('Wound')
    expect(ranked[0].rationale.join(' ')).toMatch(/status|curse|dump/i)
  })

  it('never picks a Power to discard, and fetches the best card on a keep prompt', () => {
    const cards = [
      card({ id: 'STRIKE', name: 'Strike', rarity: 'Basic', type: 'Attack', description: 'Deal 6 damage.' }),
      card({ id: 'DEMON_FORM', name: 'Demon Form', type: 'Power', description: 'Gain 2 Strength at the start of each turn.' })
    ]
    const discard = rankHandSelect(cards, combat(0, [enemy('10')]), 'discard')
    expect(discard[0].name).toBe('Strike') // dump the basic, not the Power
    expect(discard[discard.length - 1].name).toBe('Demon Form')

    // A fetch ("keep") wants the *best* card first.
    const fetch = rankHandSelect(cards, combat(0, [enemy('10')]), 'keep')
    expect(fetch[0].name).toBe('Demon Form')
  })

  it('falls back to plain combat when hand_select has no real prompt', () => {
    const raw: RawGameState = JSON.parse(
      readFileSync(join(__dirname, '..', 'fixtures', 'handSelect.discard.silent.json'), 'utf-8')
    )
    // Strip the selection payload — now it's just a combat sub-state.
    const bare = { ...raw, hand_select: {} }
    const out = normalize(bare as RawGameState)
    expect(out.screen.kind).toBe('combat')
  })
})
