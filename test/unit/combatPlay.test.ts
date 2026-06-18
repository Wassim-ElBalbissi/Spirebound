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

  it('does not rank a big non-lethal attack above survival blocks (live boss lethal turn)', () => {
    // Captured live: Ironclad at 20/84 HP, 0 block, 3 energy vs Vantom (129 HP)
    // intending a 29 attack. Bludgeon (deal 32) is the highest-damage card but
    // spends all energy, grants no block, and can't kill — playing it is lethal
    // to yourself. The top pick must be the block that survives the turn.
    const combat = combatFromFixture('combat.survivalUrgent.bigAttack.json')
    const res = rankCombatPlays(combat)

    expect(res.incomingDamage).toBe(29)
    expect(res.notes.join(' ')).toMatch(/survival risk/i)

    // Defend+ (8 block) leads; the do-nothing-for-survival Bludgeon must not.
    expect(res.ranked[0]?.name).toBe('Defend+')
    const bludgeon = res.ranked.find((r) => r.id === 'BLUDGEON')!
    const defendPlus = res.ranked.find((r) => r.name === 'Defend+')!
    const defend = res.ranked.find((r) => r.name === 'Defend')!
    expect(defendPlus.score).toBeGreaterThan(bludgeon.score)
    expect(defend.score).toBeGreaterThan(bludgeon.score)
    // The muted attack still surfaces, but is explained as not saving you.
    expect(bludgeon.rationale.join(' ')).toMatch(/survive first/i)
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

  it('buries an Evoke card when there are no orbs to evoke', () => {
    const combat = combatFromFixture('combat.noThreats.mixedHand.json')
    const res = rankCombatPlays(combat)
    const dualcast = res.ranked.find((r) => r.id === 'DUALCAST')!
    expect(dualcast.score).toBe(0)
    expect(dualcast.rationale.join(' ').toLowerCase()).toContain('no orbs')
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
      hand: lonelyStrikeHand(), // Strike (6) kills the 5-hp Worm
      enemies: [
        {
          // priority target (lowest HP), not attacking — your card kills it
          entityId: 'e1',
          name: 'Worm',
          hp: 5,
          maxHp: 30,
          block: 0,
          status: [],
          intent: { type: 'Buff', label: '' }
        },
        {
          // the real threat — too big to kill, so you must block its hit
          entityId: 'e2',
          name: 'Brute',
          hp: 60,
          maxHp: 60,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '30' }
        }
      ],
      potions: [FIRE_POTION, BLOCK_POTION]
    }
    const res = rankCombatPlays(combat)
    const fire = res.potions.find((p) => p.id === 'FIRE_POTION')!
    const block = res.potions.find((p) => p.id === 'BLOCK_POTION')!
    expect(fire.advice).toBe('hold') // a card already kills the Worm — save it
    expect(block.advice).toBe('use') // 30 from the unkillable Brute, 20 HP
  })

  it('counts end-of-turn Plating block toward blockNeeded and survival', () => {
    const combat = combatFromFixture('combat.defect.plating.json')
    const res = rankCombatPlays(combat)
    // Incoming 12, no current block, but Plating grants 3 at end of turn.
    expect(res.incomingDamage).toBe(12)
    expect(res.blockNeeded).toBe(9) // 12 − 3 Plating
    // Two Defends (10) + Plating (3) = 13 ≥ 12, so there is no survival alarm.
    expect(res.notes.join(' ')).not.toMatch(/survival risk/i)
    expect(res.notes.join(' ')).toMatch(/incl\. 3 end-of-turn/i)
    // The two Defends are still the top plays.
    expect(res.ranked[0]?.id).toBe('DEFEND_DEFECT')
    expect(res.ranked[1]?.id).toBe('DEFEND_DEFECT')
    // A big uncovered hit is flagged, and the do-nothing Power sinks last.
    expect(res.notes.join(' ')).toMatch(/big hit incoming/i)
    expect(res.ranked[res.ranked.length - 1]?.id).toBe('CAPACITOR')
    // FTL's free draw is valued (and ranks above the do-nothing Power), but
    // never above the survival Defends.
    const ftl = res.ranked.find((r) => r.id === 'FTL')!
    expect(ftl.rationale.join(' ')).toMatch(/draws 1/i)
    const cap = res.ranked.find((r) => r.id === 'CAPACITOR')!
    expect(ftl.score).toBeGreaterThan(cap.score)
    const topDefend = res.ranked[0]!
    expect(topDefend.score).toBeGreaterThan(ftl.score)
  })

  it('values card draw, scaling it up when digging for an answer', () => {
    const base = combatFromFixture('combat.lethal.json')
    const skim = (): CombatState['hand'][number] => ({
      index: 0,
      id: 'SKIM',
      name: 'Skim',
      type: 'Skill',
      cost: 1,
      description: 'Draw 3 cards.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: null,
      parsedDraw: 3,
      parsedBlock: null,
      parsedSelfDamage: null,
      keywords: []
    })
    // No threat → draw is plain card advantage.
    const calm: CombatState = {
      ...base,
      energy: 3,
      orbs: [],
      hand: [skim()],
      enemies: [
        {
          entityId: 'e1',
          name: 'Idle',
          hp: 50,
          maxHp: 50,
          block: 0,
          status: [],
          intent: { type: 'Buff', label: '' }
        }
      ]
    }
    const calmSkim = rankCombatPlays(calm).ranked.find((r) => r.id === 'SKIM')!
    expect(calmSkim.rationale.join(' ')).toMatch(/card advantage/i)

    // Big hit incoming → drawing to find an answer is worth more.
    const urgent: CombatState = {
      ...calm,
      hp: 12,
      block: 0,
      enemies: [
        {
          entityId: 'e1',
          name: 'Brute',
          hp: 50,
          maxHp: 50,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '10' }
        }
      ]
    }
    const urgentSkim = rankCombatPlays(urgent).ranked.find((r) => r.id === 'SKIM')!
    expect(urgentSkim.rationale.join(' ')).toMatch(/dig for an answer/i)
    expect(urgentSkim.score).toBeGreaterThan(calmSkim.score)
  })

  it('does not award a scaling Power its bonus when survival is urgent', () => {
    const base = combatFromFixture('combat.lethal.json')
    const power = (id: string): CombatState['hand'][number] => ({
      index: 0,
      id,
      name: id,
      type: 'Power',
      cost: 1,
      description: 'Gain 3 Orb Slots.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: null,
      parsedBlock: null,
      parsedSelfDamage: null,
      keywords: []
    })
    const defend: CombatState['hand'][number] = {
      index: 1,
      id: 'DEFEND_B',
      name: 'Defend',
      type: 'Skill',
      cost: 1,
      description: 'Gain 5 Block.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: null,
      parsedBlock: 5,
      parsedSelfDamage: null,
      keywords: []
    }
    const combat: CombatState = {
      ...base,
      hp: 6,
      block: 0,
      energy: 1, // only one card playable, so block can't fully cover
      orbs: [],
      playerStatus: [],
      hand: [power('CAPACITOR'), defend],
      enemies: [
        {
          entityId: 'e1',
          name: 'Brute',
          hp: 60,
          maxHp: 60,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '20' }
        }
      ]
    }
    const res = rankCombatPlays(combat)
    const cap = res.ranked.find((r) => r.id === 'CAPACITOR')!
    const def = res.ranked.find((r) => r.id === 'DEFEND_B')!
    expect(cap.rationale.join(' ')).toMatch(/defend first/i)
    expect(cap.rationale.join(' ')).not.toMatch(/scales the rest/i)
    // Block beats a do-nothing Power when you might die this turn.
    expect(def.score).toBeGreaterThan(cap.score)
  })

  it('adds player Strength to attack damage (and lethal detection)', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      energy: 3,
      orbs: [],
      playerStatus: [{ name: 'Strength', amount: 4, type: 'Buff' }],
      hand: lonelyStrikeHand(), // Strike: Deal 6
      enemies: [
        {
          entityId: 'e1',
          name: 'Slug',
          hp: 10, // 6 + 4 Strength = 10 → exactly lethal
          maxHp: 40,
          block: 0,
          status: [],
          intent: { type: 'Buff', label: '' }
        }
      ]
    }
    const res = rankCombatPlays(combat)
    const strike = res.ranked.find((r) => r.id === 'STRIKE_R')!
    expect(strike.rationale.join(' ')).toMatch(/~10 damage/)
    expect(strike.rationale.join(' ')).toMatch(/lethal/i)
  })

  it('adds player Dexterity to card block when sizing the threat', () => {
    const base = combatFromFixture('combat.lethal.json')
    const defend: CombatState['hand'][number] = {
      index: 0,
      id: 'DEFEND_B',
      name: 'Defend',
      type: 'Skill',
      cost: 1,
      description: 'Gain 5 Block.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: null,
      parsedBlock: 5,
      parsedSelfDamage: null,
      keywords: []
    }
    const combat: CombatState = {
      ...base,
      hp: 8,
      block: 0,
      energy: 1,
      orbs: [],
      playerStatus: [{ name: 'Dexterity', amount: 3, type: 'Buff' }],
      hand: [defend],
      enemies: [
        {
          entityId: 'e1',
          name: 'Slug',
          hp: 40,
          maxHp: 40,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '8' }
        }
      ]
    }
    const res = rankCombatPlays(combat)
    // One Defend now blocks 5 + 3 Dexterity = 8 → fully covers the 8 hit, so
    // it is not a survival emergency.
    expect(res.notes.join(' ')).not.toMatch(/survival risk/i)
    const def = res.ranked.find((r) => r.id === 'DEFEND_B')!
    expect(def.rationale.join(' ')).toMatch(/covers 8 incoming/i)
  })

  it('applies Strength per hit on multi-hit attacks', () => {
    const base = combatFromFixture('combat.lethal.json')
    const pummel: CombatState['hand'][number] = {
      index: 0,
      id: 'PUMMEL',
      name: 'Pummel',
      type: 'Attack',
      cost: 1,
      description: 'Deal 5 damage 3 times.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: 5,
      parsedHits: 3,
      parsedBlock: null,
      parsedSelfDamage: null,
      keywords: []
    }
    const combat: CombatState = {
      ...base,
      energy: 3,
      orbs: [],
      playerStatus: [{ name: 'Strength', amount: 2, type: 'Buff' }],
      hand: [pummel],
      enemies: [
        {
          entityId: 'e1',
          name: 'Slug',
          hp: 21, // (5 + 2 Strength) × 3 hits = 21 → exactly lethal
          maxHp: 40,
          block: 0,
          status: [],
          intent: { type: 'Buff', label: '' }
        }
      ]
    }
    const res = rankCombatPlays(combat)
    const p = res.ranked.find((r) => r.id === 'PUMMEL')!
    expect(p.rationale.join(' ')).toMatch(/~21 damage/)
    expect(p.rationale.join(' ')).toMatch(/lethal/i)
  })

  it('cuts our attack damage when the player is Weak', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      energy: 3,
      orbs: [],
      playerStatus: [{ name: 'Weakened', amount: 2, type: 'Debuff' }],
      hand: lonelyStrikeHand(), // Deal 6
      enemies: [
        {
          entityId: 'e1',
          name: 'Slug',
          hp: 7,
          maxHp: 40,
          block: 0,
          status: [],
          intent: { type: 'Buff', label: '' }
        }
      ]
    }
    const res = rankCombatPlays(combat)
    const strike = res.ranked.find((r) => r.id === 'STRIKE_R')!
    // floor(6 × 0.75) = 4 → no longer lethal against 7 HP.
    expect(strike.rationale.join(' ')).toMatch(/~4 damage/)
    expect(strike.rationale.join(' ')).not.toMatch(/lethal/i)
  })

  it('cuts our card block when the player is Frail', () => {
    const base = combatFromFixture('combat.lethal.json')
    const defend: CombatState['hand'][number] = {
      index: 0,
      id: 'DEFEND_B',
      name: 'Defend',
      type: 'Skill',
      cost: 1,
      description: 'Gain 8 Block.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: null,
      parsedBlock: 8,
      parsedSelfDamage: null,
      keywords: []
    }
    const combat: CombatState = {
      ...base,
      hp: 30,
      block: 0,
      energy: 1,
      orbs: [],
      playerStatus: [{ name: 'Frail', amount: 2, type: 'Debuff' }],
      hand: [defend],
      enemies: [
        {
          entityId: 'e1',
          name: 'Slug',
          hp: 40,
          maxHp: 40,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '7' }
        }
      ]
    }
    const res = rankCombatPlays(combat)
    const def = res.ranked.find((r) => r.id === 'DEFEND_B')!
    // floor(8 × 0.75) = 6 block vs a 7 hit → doesn't fully cover.
    expect(def.rationale.join(' ')).toMatch(/\+6 block \(need 7\)/i)
  })

  it('spends Vigor on only one attack when checking lethal', () => {
    const base = combatFromFixture('combat.lethal.json')
    const strike = (index: number): CombatState['hand'][number] => ({
      index,
      id: `S${index}`,
      name: 'Strike',
      type: 'Attack',
      cost: 1,
      description: 'Deal 6 damage.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: 6,
      parsedBlock: null,
      parsedSelfDamage: null,
      keywords: []
    })
    const combat: CombatState = {
      ...base,
      energy: 2,
      orbs: [],
      playerStatus: [{ name: 'Vigor', amount: 5, type: 'Buff' }],
      hand: [strike(0), strike(1)],
      enemies: [
        {
          entityId: 'e1',
          name: 'Brute',
          hp: 18, // 6 + 6 + 5 Vigor (once) = 17 < 18 → not killable
          maxHp: 60,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '15' }
        }
      ]
    }
    const res = rankCombatPlays(combat)
    expect(res.notes.join(' ')).not.toMatch(/kill the attacker/i)
    // Each attack is shown as if it were the Vigor recipient: 6 + 5 = 11.
    const s0 = res.ranked.find((r) => r.id === 'S0')!
    expect(s0.rationale.join(' ')).toMatch(/~11 damage/)
  })

  it('parks a card whose only effect is a condition that is currently false', () => {
    const base = combatFromFixture('combat.lethal.json')
    // Entire payload is gated on Vulnerable; against a non-Vulnerable target it
    // does nothing this turn.
    const gated: CombatState['hand'][number] = {
      index: 0,
      id: 'GATED',
      name: 'Finisher',
      type: 'Attack',
      cost: 1,
      description: 'If the enemy is Vulnerable, deal 12 damage.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: null, // stripped — the damage is conditional
      parsedBlock: null,
      parsedSelfDamage: null,
      keywords: []
    }
    const plainStrike: CombatState['hand'][number] = {
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
      parsedBlock: null,
      parsedSelfDamage: null,
      keywords: []
    }
    const combat: CombatState = {
      ...base,
      energy: 3,
      orbs: [],
      hand: [gated, plainStrike],
      enemies: [
        {
          entityId: 'e1',
          name: 'Slug',
          hp: 40,
          maxHp: 40,
          block: 0,
          status: [], // not Vulnerable
          intent: { type: 'Buff', label: '' }
        }
      ]
    }
    const res = rankCombatPlays(combat)
    const g = res.ranked.find((r) => r.id === 'GATED')!
    // Still surfaced, but parked at 0 and explained — never suggested.
    expect(g.score).toBe(0)
    expect(g.rationale.join(' ')).toMatch(/does nothing/i)
    // A card that actually does something outranks it.
    const strike = res.ranked.find((r) => r.id === 'STRIKE_R')!
    expect(strike.score).toBeGreaterThan(g.score)
    expect(res.ranked[res.ranked.length - 1]?.id).toBe('GATED')
  })

  it('does not park a utility card whose effect it cannot fully parse', () => {
    const base = combatFromFixture('combat.lethal.json')
    // We don't model Scry, but it clearly does something — must stay live.
    const scry: CombatState['hand'][number] = {
      index: 0,
      id: 'SCRY_CARD',
      name: 'Nightmare',
      type: 'Skill',
      cost: 1,
      description: 'Scry 3. If you have no Block, do it again.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: null,
      parsedBlock: null,
      parsedSelfDamage: null,
      keywords: []
    }
    const combat: CombatState = {
      ...base,
      block: 5, // condition false, but "Scry 3" is unconditional
      energy: 3,
      orbs: [],
      hand: [scry],
      enemies: [
        {
          entityId: 'e1',
          name: 'Slug',
          hp: 40,
          maxHp: 40,
          block: 0,
          status: [],
          intent: { type: 'Buff', label: '' }
        }
      ]
    }
    const r = rankCombatPlays(combat).ranked.find((x) => x.id === 'SCRY_CARD')!
    expect(r.rationale.join(' ')).not.toMatch(/does nothing/i)
    expect(r.score).toBeGreaterThan(0)
  })

  it('credits a conditional damage rider only when its condition holds', () => {
    const base = combatFromFixture('combat.lethal.json')
    const riderCard: CombatState['hand'][number] = {
      index: 0,
      id: 'RIDER',
      name: 'Rider',
      type: 'Attack',
      cost: 1,
      description: 'Deal 6 damage. If the enemy is Vulnerable, deal 6 more damage.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: 6, // base only — the rider is evaluated from state
      parsedBlock: null,
      parsedSelfDamage: null,
      keywords: []
    }
    const enemy = (vulnerable: boolean): CombatState['enemies'][number] => ({
      entityId: 'e1',
      name: 'Slug',
      hp: 40,
      maxHp: 40,
      block: 0,
      status: vulnerable ? [{ name: 'Vulnerable', amount: 2, type: 'Debuff' }] : [],
      intent: { type: 'Buff', label: '' }
    })
    const make = (vulnerable: boolean): CombatState => ({
      ...base,
      energy: 3,
      orbs: [],
      hand: [riderCard],
      enemies: [enemy(vulnerable)]
    })

    const off = rankCombatPlays(make(false)).ranked.find((r) => r.id === 'RIDER')!
    const on = rankCombatPlays(make(true)).ranked.find((r) => r.id === 'RIDER')!
    // Inactive: just the 6 base. Active: (6 + 6) × 1.5 Vulnerable = 18.
    expect(off.rationale.join(' ')).toMatch(/~6 damage/)
    expect(on.rationale.join(' ')).toMatch(/~18 damage/)
    expect(on.rationale.join(' ')).toMatch(/\+6 damage/)
    // The card is worth more exactly when its rider is live.
    expect(on.score).toBeGreaterThan(off.score)
  })

  it('flags an unreadable conditional draw rider rather than assuming it free', () => {
    const base = combatFromFixture('combat.lethal.json')
    const ftl: CombatState['hand'][number] = {
      index: 0,
      id: 'FTL',
      name: 'FTL',
      type: 'Attack',
      cost: 0,
      description:
        'Deal 5 damage. If you have played fewer than 3 cards this turn, draw 1 card.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: 5,
      parsedBlock: null,
      parsedSelfDamage: null,
      keywords: []
    }
    const combat: CombatState = {
      ...base,
      energy: 3,
      orbs: [],
      hand: [ftl],
      enemies: [
        {
          entityId: 'e1',
          name: 'Slug',
          hp: 40,
          maxHp: 40,
          block: 0,
          status: [],
          intent: { type: 'Buff', label: '' }
        }
      ]
    }
    const r = rankCombatPlays(combat).ranked.find((x) => x.id === 'FTL')!
    // Draw is credited but labelled conditional, not silently assumed.
    expect(r.rationale.join(' ')).toMatch(/draws 1 if/i)
  })

  it('credits a conditional block rider when you have no Block', () => {
    const base = combatFromFixture('combat.lethal.json')
    const card: CombatState['hand'][number] = {
      index: 0,
      id: 'SECONDWIND',
      name: 'Reservoir',
      type: 'Skill',
      cost: 1,
      description: 'Gain 4 Block. If you have no Block, gain 8 Block.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: null,
      parsedBlock: 4, // base only
      parsedSelfDamage: null,
      keywords: []
    }
    const combat: CombatState = {
      ...base,
      block: 0,
      energy: 1,
      orbs: [],
      hand: [card],
      enemies: [
        {
          entityId: 'e1',
          name: 'Slug',
          hp: 40,
          maxHp: 40,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '12' }
        }
      ]
    }
    const r = rankCombatPlays(combat).ranked.find((x) => x.id === 'SECONDWIND')!
    // 4 base + 8 conditional (no Block) = 12 → fully covers the 12 hit.
    expect(r.rationale.join(' ')).toMatch(/\+8 block/i)
    expect(r.rationale.join(' ')).toMatch(/covers 12 incoming/i)
  })

  it('counts Frost orb passive block toward blockNeeded', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      block: 0,
      enemies: [
        {
          entityId: 'e1',
          name: 'Slug',
          hp: 40,
          maxHp: 40,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '10' }
        }
      ],
      orbs: [
        {
          id: 'FROST_ORB',
          name: 'Frost',
          description: 'Passive: gain 2 Block.',
          passiveValue: 2,
          evokeValue: 5,
          passiveKind: 'block'
        }
      ]
    }
    const res = rankCombatPlays(combat)
    expect(res.blockNeeded).toBe(8) // 10 incoming − 2 Frost block
  })

  it('counts orb damage toward lethal and values Evoke cards', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      energy: 3,
      enemies: [
        {
          entityId: 'e1',
          name: 'Slug',
          hp: 8,
          maxHp: 40,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '5' }
        }
      ],
      orbs: [
        {
          id: 'LIGHTNING_ORB',
          name: 'Lightning',
          description:
            'Passive: At the end of turn, deal 3 damage. Evoke: Deal 8 damage.',
          passiveValue: 3,
          evokeValue: 8,
          passiveKind: 'damage'
        }
      ],
      hand: [
        {
          index: 0,
          id: 'DUALCAST',
          name: 'Dualcast',
          type: 'Skill',
          cost: 1,
          description: 'Evoke your rightmost Orb twice.',
          upgraded: false,
          canPlay: true,
          unplayableReason: null,
          parsedDamage: null,
          parsedBlock: null,
          parsedSelfDamage: null,
          keywords: ['Evoke']
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
          parsedBlock: null,
          parsedSelfDamage: null,
          keywords: []
        }
      ]
    }
    const res = rankCombatPlays(combat)
    const dualcast = res.ranked.find((r) => r.id === 'DUALCAST')!
    expect(dualcast.rationale.join(' ')).toMatch(/evoke/i)
    expect(dualcast.score).toBeGreaterThan(10) // 8 evoke × 2 = 16 damage
    const strike = res.ranked.find((r) => r.id === 'STRIKE_R')!
    expect(strike.rationale.join(' ')).toMatch(/lethal/i) // 6 + 3 orb ≥ 8 hp
  })

  it('disambiguates duplicate enemy names by board position', () => {
    const base = combatFromFixture('combat.lethal.json')
    const combat: CombatState = {
      ...base,
      enemies: [
        {
          entityId: 'e1',
          name: 'Corpse Slug',
          hp: 25,
          maxHp: 25,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '6' }
        },
        {
          entityId: 'e2',
          name: 'Corpse Slug',
          hp: 26,
          maxHp: 26,
          block: 0,
          status: [],
          intent: { type: 'Attack', label: '6' }
        }
      ]
    }
    const names = rankCombatPlays(combat).threats.map((t) => t.name)
    expect(names).toContain('Corpse Slug #1')
    expect(names).toContain('Corpse Slug #2')
  })

  it('de-prioritizes a Retain card when it is not urgent', () => {
    const base = combatFromFixture('combat.lethal.json')
    const utility = (id: string, keywords: string[]): CombatState['hand'][number] => ({
      index: id === 'RETAINER' ? 0 : 1,
      id,
      name: id,
      type: 'Skill',
      cost: 1,
      description: 'Do a thing.',
      upgraded: false,
      canPlay: true,
      unplayableReason: null,
      parsedDamage: null,
      parsedBlock: null,
      parsedSelfDamage: null,
      keywords
    })
    const combat: CombatState = {
      ...base,
      orbs: [],
      enemies: [
        {
          entityId: 'e1',
          name: 'Idle',
          hp: 50,
          maxHp: 50,
          block: 0,
          status: [],
          intent: { type: 'Buff', label: '' }
        }
      ],
      hand: [utility('RETAINER', ['Retain']), utility('PLAIN', [])]
    }
    const res = rankCombatPlays(combat)
    const ret = res.ranked.find((r) => r.id === 'RETAINER')!
    const plain = res.ranked.find((r) => r.id === 'PLAIN')!
    expect(ret.rationale.join(' ')).toMatch(/retain/i)
    expect(plain.score).toBeGreaterThan(ret.score)
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
