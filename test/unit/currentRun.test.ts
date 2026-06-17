import { describe, it, expect } from 'vitest'
import { parseCurrentRunDeck } from '../../src/main/services/compendium/deckParse'

describe('parseCurrentRunDeck', () => {
  it('reads the deck from current_run.deck (object cards)', () => {
    const deck = parseCurrentRunDeck({
      current_run: {
        deck: [
          { id: 'STRIKE_R', name: 'Strike', is_upgraded: false },
          { id: 'BASH', name: 'Bash', is_upgraded: true }
        ]
      }
    })
    expect(deck).not.toBeNull()
    expect(deck).toHaveLength(2)
    expect(deck![1]).toMatchObject({ id: 'BASH', name: 'Bash', upgraded: true })
  })

  it('accepts bare id strings and the card_id / upgraded aliases', () => {
    const deck = parseCurrentRunDeck({
      deck: ['DEFEND_R', { card_id: 'INFLAME', upgraded: true }]
    })
    expect(deck).toEqual([
      { id: 'DEFEND_R', name: 'DEFEND_R', upgraded: false },
      expect.objectContaining({ id: 'INFLAME', upgraded: true })
    ])
  })

  it('falls back to top-level cards when current_run is absent', () => {
    const deck = parseCurrentRunDeck({ cards: [{ id: 'IRON_WAVE' }] })
    expect(deck).toEqual([
      { id: 'IRON_WAVE', name: 'IRON_WAVE', upgraded: false }
    ])
  })

  it('returns null for unrecognised / empty payloads', () => {
    expect(parseCurrentRunDeck(null)).toBeNull()
    expect(parseCurrentRunDeck({})).toBeNull()
    expect(parseCurrentRunDeck({ current_run: { deck: [] } })).toBeNull()
    expect(parseCurrentRunDeck({ deck: [{ name: 'no id here' }] })).toBeNull()
  })
})
