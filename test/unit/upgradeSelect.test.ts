import { describe, it, expect } from 'vitest'
import { classifyScreen } from '../../src/main/services/screens'
import type { RawGameState } from '../../src/main/types/rawState'

describe('Smith (card_select upgrade) screen', () => {
  it('classifies an upgrade card_select into the upgradeable deck', () => {
    const raw = {
      state_type: 'card_select',
      card_select: {
        screen_type: 'upgrade',
        prompt: 'Choose a card to Upgrade.',
        cards: [
          {
            id: 'STRIKE_DEFECT',
            name: 'Strike',
            type: 'Attack',
            cost: '1',
            star_cost: null,
            description: 'Deal 6 damage.',
            rarity: 'Basic',
            is_upgraded: false,
            keywords: [],
            index: 0
          },
          {
            id: 'ZAP',
            name: 'Zap',
            type: 'Skill',
            cost: '1',
            star_cost: null,
            description: 'Channel 1 Lightning.',
            rarity: 'Basic',
            is_upgraded: false,
            keywords: [],
            index: 1
          }
        ]
      }
    } as unknown as RawGameState

    const screen = classifyScreen(raw)
    expect(screen.kind).toBe('upgradeSelect')
    if (screen.kind !== 'upgradeSelect') return
    expect(screen.cards.map((c) => c.id)).toEqual(['STRIKE_DEFECT', 'ZAP'])
    expect(screen.cards[0].upgraded).toBe(false)
  })

  it('leaves non-upgrade card_select screens as unknown', () => {
    const raw = {
      state_type: 'card_select',
      card_select: { screen_type: 'exhaust', cards: [] }
    } as unknown as RawGameState
    expect(classifyScreen(raw).kind).toBe('unknown')
  })
})
