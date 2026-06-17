import { describe, it, expect } from 'vitest'
import { normalize } from '../../src/main/services/screens'
import type { RawGameState } from '../../src/main/types/rawState'

function shopState(): RawGameState {
  return {
    state_type: 'shop',
    run: { act: 1, floor: 6, ascension: 0 },
    player: {
      character: 'The Ironclad',
      hp: 50,
      max_hp: 70,
      block: 0,
      gold: 120,
      status: [],
      relics: [],
      potions: [],
      max_potion_slots: 3
    },
    shop: {
      can_proceed: true,
      items: [
        {
          index: 0,
          category: 'card',
          price: 75,
          is_stocked: true,
          can_afford: true,
          card_id: 'OFFERING',
          card_name: 'Offering',
          card_type: 'Skill',
          card_rarity: 'Rare',
          card_description: 'Lose 6 HP. Draw 3 cards. Gain 2 Energy. Exhaust.'
        },
        {
          index: 5,
          category: 'relic',
          price: 150,
          is_stocked: true,
          can_afford: false,
          relic_id: 'VAJRA',
          relic_name: 'Vajra',
          relic_description: 'Start each combat with 1 Strength.'
        },
        {
          index: 8,
          category: 'potion',
          price: 50,
          is_stocked: true,
          can_afford: true,
          potion_id: 'FIRE_POTION',
          potion_name: 'Fire Potion',
          potion_description: 'Deal 20 damage.'
        },
        {
          // already purchased — must be skipped
          index: 9,
          category: 'card',
          price: 50,
          is_stocked: false,
          card_id: 'STRIKE_R',
          card_name: 'Strike'
        },
        {
          // card-removal service — no advice slot yet, must be skipped
          index: 10,
          category: 'card_removal',
          price: 75,
          is_stocked: true
        }
      ]
    }
  }
}

describe('shop screen normalization (STS2MCP items[] shape)', () => {
  it('parses the flat items array by category into priced lists', () => {
    const out = normalize(shopState())
    expect(out.screen.kind).toBe('shop')
    if (out.screen.kind !== 'shop') return

    expect(out.screen.cards).toEqual([
      expect.objectContaining({ id: 'OFFERING', name: 'Offering', price: 75 })
    ])
    expect(out.screen.relics).toEqual([
      expect.objectContaining({ id: 'VAJRA', name: 'Vajra', price: 150 })
    ])
    expect(out.screen.potions).toEqual([
      expect.objectContaining({ id: 'FIRE_POTION', name: 'Fire Potion', price: 50 })
    ])
  })

  it('drops out-of-stock items and card-removal rows', () => {
    const out = normalize(shopState())
    if (out.screen.kind !== 'shop') throw new Error('not a shop')
    const allIds = [
      ...out.screen.cards,
      ...out.screen.relics,
      ...out.screen.potions
    ].map((i) => i.id)
    expect(allIds).not.toContain('STRIKE_R') // out of stock
    expect(allIds).toHaveLength(3)
  })
})
