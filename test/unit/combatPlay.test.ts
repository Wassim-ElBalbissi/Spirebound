import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { rankCombatPlays } from '../../src/main/services/recommender/combatPlay'
import { normalize } from '../../src/main/services/screens'
import type { RawGameState } from '../../src/main/types/rawState'
import type { CombatState } from '../../src/main/types/gameState'

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

  it('exposes a per-enemy threat breakdown', () => {
    const combat = combatFromFixture('combat.lethal.json')
    const res = rankCombatPlays(combat)
    expect(res.threats).toHaveLength(combat.enemies.length)
    const attacker = res.threats.find((t) => t.adjusted !== null)!
    expect(attacker.rawIntent).toBe(11)
    expect(attacker.adjusted).toBe(11) // modifiers off by default → raw == adjusted
  })

  it('applies Weak / Strength to intents only when the option is enabled', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      enemies: [
        {
          entityId: 'e1',
          name: 'Brute',
          hp: 40,
          maxHp: 40,
          block: 0,
          status: [
            { name: 'Strength', amount: 3, type: 'Buff' },
            { name: 'Weak', amount: 2, type: 'Debuff' }
          ],
          intent: { type: 'Attack', label: '10' }
        }
      ]
    }

    const off = rankCombatPlays(combat)
    expect(off.threats[0]?.adjusted).toBe(10)
    expect(off.incomingDamage).toBe(10)

    const on = rankCombatPlays(combat, undefined, { applyIntentModifiers: true })
    // (10 base + 3 Strength) × 1 hit = 13, then Weak ×0.75 → floor 9.
    expect(on.threats[0]?.adjusted).toBe(9)
    expect(on.incomingDamage).toBe(9)
    expect(on.threats[0]?.applied.join(' ')).toMatch(/strength/i)
    expect(on.threats[0]?.applied.join(' ')).toMatch(/weak/i)
  })

  it('counts multi-hit attacks (NxM) as damage × hits', () => {
    const base = combatFromFixture('combat.lethal.json')
    for (const label of ['3x4', '3X4', '3×4', '3 x 4']) {
      const combat: CombatState = {
        ...base,
        enemies: [
          {
            entityId: 'e1',
            name: 'Spire Growth',
            hp: 50,
            maxHp: 50,
            block: 0,
            status: [],
            intent: { type: 'Attack', label }
          }
        ]
      }
      const res = rankCombatPlays(combat)
      expect(res.threats[0]?.rawIntent).toBe(12)
      expect(res.incomingDamage).toBe(12)
    }
  })

  it('applies per-hit Strength to multi-hit attacks when enabled', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      enemies: [
        {
          entityId: 'e1',
          name: 'Brute',
          hp: 50,
          maxHp: 50,
          block: 0,
          status: [{ name: 'Strength', amount: 2, type: 'Buff' }],
          intent: { type: 'Attack', label: '7x3' }
        }
      ]
    }
    const on = rankCombatPlays(combat, undefined, { applyIntentModifiers: true })
    // (7 + 2 Strength) × 3 hits = 27.
    expect(on.threats[0]?.adjusted).toBe(27)
    expect(on.incomingDamage).toBe(27)
  })

  function disarmHand(): CombatState['hand'] {
    return [
      {
        index: 0,
        id: 'DISARM',
        name: 'Disarm',
        type: 'Skill',
        cost: 1,
        description: 'Enemy loses 2 Strength.',
        upgraded: false,
        canPlay: true,
        unplayableReason: null,
        parsedDamage: null,
        parsedBlock: null
      },
      {
        index: 1,
        id: 'STRIKE_R',
        name: 'Strike',
        type: 'Attack',
        cost: 1,
        description: 'Deal 6 damage.',
        upgraded: false,
        canPlay: true,
        unplayableReason: null,
        parsedDamage: 6,
        parsedBlock: null
      }
    ]
  }

  function worm(intentType: string, label: string): CombatState['enemies'][number] {
    return {
      entityId: 'e1',
      name: 'Spire Worm',
      hp: 40,
      maxHp: 40,
      block: 0,
      status: [{ name: 'Strength', amount: 3, type: 'Buff' }],
      intent: { type: intentType, label }
    }
  }

  it('does not push a Strength-down card when no enemy is attacking', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      energy: 3,
      enemies: [worm('Buff', '')],
      hand: disarmHand()
    }
    const res = rankCombatPlays(combat)
    const disarm = res.ranked.find((r) => r.id === 'DISARM')!
    const strike = res.ranked.find((r) => r.id === 'STRIKE_R')!
    expect(strike.score).toBeGreaterThan(disarm.score)
    expect(disarm.rationale.join(' ')).toMatch(/no enemy is attacking|little value/i)
  })

  it('rewards a Strength-down card when the enemy is attacking', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      energy: 3,
      enemies: [worm('Attack', '20')],
      hand: disarmHand()
    }
    const res = rankCombatPlays(combat)
    const disarm = res.ranked.find((r) => r.id === 'DISARM')!
    expect(disarm.rationale.join(' ')).toMatch(/cuts the enemy attack/i)
  })

  function vulnAndAttackHand(): CombatState['hand'] {
    return [
      {
        index: 0,
        id: 'TERROR',
        name: 'Terror',
        type: 'Skill',
        cost: 1,
        description: 'Apply 3 Vulnerable.',
        upgraded: false,
        canPlay: true,
        unplayableReason: null,
        parsedDamage: null,
        parsedBlock: null
      },
      {
        index: 1,
        id: 'POMMEL',
        name: 'Pommel Strike',
        type: 'Attack',
        cost: 1,
        description: 'Deal 9 damage.',
        upgraded: false,
        canPlay: true,
        unplayableReason: null,
        parsedDamage: 9,
        parsedBlock: null
      }
    ]
  }

  it('sequences Vulnerable before the attacks it amplifies', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      energy: 3,
      enemies: [
        {
          entityId: 'e1',
          name: 'Slaver',
          hp: 40,
          maxHp: 40,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '12' }
        }
      ],
      hand: vulnAndAttackHand()
    }
    const res = rankCombatPlays(combat)
    expect(res.ranked[0]?.id).toBe('TERROR')
    expect(res.ranked[0]?.rationale.join(' ')).toMatch(/before your attacks/i)
  })

  it('does not delay a lethal attack to apply Vulnerable first', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      energy: 3,
      enemies: [
        {
          entityId: 'e1',
          name: 'Cultist',
          hp: 8, // a 9-damage hit already kills
          maxHp: 50,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '6' }
        }
      ],
      hand: vulnAndAttackHand()
    }
    const res = rankCombatPlays(combat)
    expect(res.ranked[0]?.id).toBe('POMMEL')
  })

  it('parses self-damage and accounts for held Burn-like cards', () => {
    const raw = fixture('combat.lethal.json')
    ;(raw.player as { hand: unknown }).hand = [
      {
        index: 0,
        id: 'HEMOKINESIS',
        name: 'Hemokinesis',
        type: 'Attack',
        cost: '1',
        star_cost: null,
        description: 'Lose 2 HP. Deal 15 damage.',
        target_type: 'AnyEnemy',
        can_play: true,
        unplayable_reason: null,
        is_upgraded: false,
        keywords: []
      },
      {
        index: 1,
        id: 'BURN',
        name: 'Burn',
        type: 'Status',
        cost: '1',
        star_cost: null,
        description: 'Unplayable. At the end of your turn, take 2 damage.',
        target_type: 'None',
        can_play: false,
        unplayable_reason: 'Unplayable',
        is_upgraded: false,
        keywords: []
      }
    ]
    const out = normalize(raw)
    if (out.screen.kind !== 'combat') throw new Error('not combat')
    const combat = out.screen.combat

    expect(combat.hand[0].parsedSelfDamage).toBe(2)
    expect(combat.hand[1].parsedSelfDamage).toBe(2)

    const res = rankCombatPlays(combat)
    // Held Burn is counted (Status card); the playable Hemokinesis is not.
    expect(res.selfDamage).toBe(2)
    expect(res.notes.join(' ')).toMatch(/self-damage/i)
    const hemo = res.ranked.find((r) => r.id === 'HEMOKINESIS')!
    expect(hemo.rationale.join(' ')).toMatch(/costs 2 hp/i)
  })

  function lonelyStrikeHand(): CombatState['hand'] {
    return [
      {
        index: 0,
        id: 'STRIKE_R',
        name: 'Strike',
        type: 'Attack',
        cost: 1,
        description: 'Deal 6 damage.',
        upgraded: false,
        canPlay: true,
        unplayableReason: null,
        parsedDamage: 6,
        parsedBlock: null,
        parsedSelfDamage: null
      }
    ]
  }

  const FIRE_POTION = {
    id: 'FIRE_POTION',
    name: 'Fire Potion',
    description: 'Deal 20 damage.',
    targetType: 'AnyEnemy',
    parsedDamage: 20,
    parsedBlock: null
  }
  const BLOCK_POTION = {
    id: 'BLOCK_POTION',
    name: 'Block Potion',
    description: 'Gain 12 Block.',
    targetType: 'None',
    parsedDamage: null,
    parsedBlock: 12
  }

  it('tells you to USE a lethal potion when no card can finish the target', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      block: 0,
      energy: 3,
      hand: lonelyStrikeHand(), // Strike (6) can't kill a 12-hp enemy
      enemies: [
        {
          entityId: 'e1',
          name: 'Jaw Worm',
          hp: 12,
          maxHp: 40,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '10' }
        }
      ],
      potions: [FIRE_POTION, BLOCK_POTION]
    }
    const res = rankCombatPlays(combat)
    const fire = res.potions.find((p) => p.id === 'FIRE_POTION')!
    expect(fire.lethal).toBe(true)
    expect(fire.advice).toBe('use')
    expect(res.notes.join(' ')).toMatch(/Fire Potion/)
    // 'use' potions sort to the front.
    expect(res.potions[0]?.id).toBe('FIRE_POTION')
  })

  it('HOLDs a lethal potion when a card already kills, USEs a block potion to survive', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      block: 0,
      energy: 1,
      hp: 20,
      hand: lonelyStrikeHand(), // Strike (6) kills the 5-hp enemy
      enemies: [
        {
          entityId: 'e1',
          name: 'Mugger',
          hp: 5,
          maxHp: 30,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '30' } // unblockable, would near-kill
        }
      ],
      potions: [FIRE_POTION, BLOCK_POTION]
    }
    const res = rankCombatPlays(combat)
    const fire = res.potions.find((p) => p.id === 'FIRE_POTION')!
    const block = res.potions.find((p) => p.id === 'BLOCK_POTION')!
    expect(fire.advice).toBe('hold') // a card already kills — save it
    expect(block.advice).toBe('use') // 30 incoming, no card block, 20 HP
  })

  it('only includes potions usable in combat', () => {
    const raw = fixture('combat.lethal.json')
    ;(raw.player as { potions: unknown }).potions = [
      {
        id: 'FIRE_POTION',
        name: 'Fire Potion',
        description: 'Deal 20 damage.',
        slot: 0,
        can_use_in_combat: true,
        target_type: 'AnyEnemy',
        keywords: []
      },
      {
        id: 'FRUIT_JUICE',
        name: 'Fruit Juice',
        description: 'Gain 5 Max HP.',
        slot: 1,
        can_use_in_combat: false,
        target_type: 'None',
        keywords: []
      }
    ]
    const out = normalize(raw)
    if (out.screen.kind !== 'combat') throw new Error('not combat')
    expect(out.screen.combat.potions.map((p) => p.id)).toEqual(['FIRE_POTION'])
    expect(out.screen.combat.potions[0].parsedDamage).toBe(20)
  })
})
