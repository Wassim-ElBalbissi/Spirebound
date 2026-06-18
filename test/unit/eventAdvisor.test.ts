import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { rankEventChoices, EventContext } from '../../src/main/services/recommender/eventAdvisor'
import { normalize } from '../../src/main/services/screens'
import type { RawGameState } from '../../src/main/types/rawState'
import type { EventChoice } from '../../src/main/types/gameState'

function choice(partial: Partial<EventChoice> & { description: string }): EventChoice {
  return {
    index: 0,
    title: 't',
    isLocked: false,
    isProceed: false,
    wasChosen: false,
    ...partial
  }
}

const fullHp: EventContext = {
  hp: 80,
  maxHp: 80,
  act: 1,
  floor: 0,
  deckSize: 12,
  gold: 99
}

describe('rankEventChoices', () => {
  it('ranks the bundled Neow fixture: Relic > Max HP > Card', () => {
    const raw: RawGameState = JSON.parse(
      readFileSync(join(__dirname, '..', 'fixtures', 'event.neow.json'), 'utf-8')
    )
    const out = normalize(raw)
    if (out.screen.kind !== 'event') throw new Error('not an event screen')
    const ranked = rankEventChoices(out.screen.choices, {
      hp: raw.player!.hp,
      maxHp: raw.player!.max_hp,
      act: raw.run!.act,
      floor: raw.run!.floor,
      deckSize: 12,
      gold: raw.player!.gold
    })
    expect(ranked.map((r) => r.title)).toEqual(['Relic', 'Max HP', 'Card'])
    expect(ranked[0].rationale.join(' ')).toMatch(/relic/i)
  })

  it("ranks the live Neow dialogue: card+potion over HP-cost removal over a forced card", () => {
    const choices = [
      choice({ index: 0, title: 'Lost Coffer', description: 'Gain 1 card reward and procure 1 random Potion.' }),
      choice({ index: 1, title: "Neow's Torment", description: "Add 1 Neow's Fury to your Deck." }),
      choice({ index: 2, title: 'Precarious Shears', description: 'Remove 2 cards from your Deck. Lose 16 HP.' })
    ]
    const ranked = rankEventChoices(choices, fullHp)
    expect(ranked[0].title).toBe('Lost Coffer')
    expect(ranked[ranked.length - 1].title).toBe("Neow's Torment")
    // The removal is recognized but discounted by its HP cost.
    const shears = ranked.find((r) => r.title === 'Precarious Shears')!
    expect(shears.rationale.join(' ')).toMatch(/thins your deck/i)
    expect(shears.rationale.join(' ')).toMatch(/16 HP/i)
  })

  it('penalizes an HP cost harder the lower you are, and floors a downing option', () => {
    const bleed = choice({
      index: 0,
      title: 'Bleed',
      description: 'Lose 18 HP. Gain a Rare relic.'
    })
    const healthy = rankEventChoices([bleed], { ...fullHp, hp: 80, maxHp: 80 })[0].score
    const wounded = rankEventChoices([bleed], { ...fullHp, hp: 30, maxHp: 80 })[0].score
    // Same effect, lower HP → the cost bites harder, so the option is worth less.
    expect(wounded).toBeLessThan(healthy)

    // An 18 HP cost at 15 HP would down you — floored below a safe alternative.
    const choices = [
      bleed,
      choice({ index: 1, title: 'Safe', description: 'Obtain a random Common relic.' })
    ]
    const lethal = rankEventChoices(choices, { ...fullHp, hp: 15, maxHp: 80 })
    expect(lethal[lethal.length - 1].title).toBe('Bleed')
    expect(lethal.find((r) => r.title === 'Bleed')!.rationale.join(' ')).toMatch(/down you/i)
  })

  it('flags a Curse-adding option as a deck clog and sinks it', () => {
    const choices = [
      choice({ index: 0, title: 'Deal', description: 'Add a Curse to your deck. Gain 100 gold.' }),
      choice({ index: 1, title: 'Pass', description: 'Leave.', isProceed: true })
    ]
    const ranked = rankEventChoices(choices, fullHp)
    const deal = ranked.find((r) => r.title === 'Deal')!
    expect(deal.rationale.join(' ')).toMatch(/curse|status/i)
    expect(ranked[0].title).toBe('Pass') // the safe exit beats a curse-for-gold
  })

  it('sorts locked options to the bottom regardless of effect', () => {
    const choices = [
      choice({ index: 0, title: 'Great but locked', description: 'Obtain a random Rare relic.', isLocked: true }),
      choice({ index: 1, title: 'Meh', description: 'Gain 20 gold.' })
    ]
    const ranked = rankEventChoices(choices, fullHp)
    expect(ranked[0].title).toBe('Meh')
    expect(ranked[ranked.length - 1].title).toBe('Great but locked')
    expect(ranked[ranked.length - 1].rationale.join(' ')).toMatch(/locked/i)
  })

  it('values card removal more in a bloated deck than a lean one', () => {
    const choices = [choice({ index: 0, title: 'Purge', description: 'Remove 2 cards from your Deck.' })]
    const lean = rankEventChoices(choices, { ...fullHp, deckSize: 8 })[0].score
    const bloated = rankEventChoices(choices, { ...fullHp, deckSize: 25 })[0].score
    expect(bloated).toBeGreaterThan(lean)
  })
})
