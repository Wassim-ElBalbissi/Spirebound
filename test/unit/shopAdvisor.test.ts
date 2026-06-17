import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { rankShop, ShopContext } from '../../src/main/services/recommender/shopAdvisor'
import type { Screen } from '../../src/main/types/gameState'
import type { TierBundle } from '../../src/main/types/tierData'

type ShopScreen = Extract<Screen, { kind: 'shop' }>

function loadBundle(): TierBundle {
  const p = join(__dirname, '..', '..', 'resources', 'tier-cache', 'bundle.json')
  return JSON.parse(readFileSync(p, 'utf-8'))
}

function shopCtx(gold: number): ShopContext {
  return {
    character: 'ironclad',
    deck: [],
    ownedRelicIds: [],
    archetypeTags: new Set(),
    act: 1,
    floor: 5,
    gold
  }
}

function makeShop(cards: { id: string; price: number }[]): ShopScreen {
  return {
    kind: 'shop',
    cards: cards.map((c) => ({ id: c.id, name: c.id, upgraded: false, price: c.price })),
    relics: [],
    potions: []
  }
}

describe('rankShop', () => {
  const bundle = loadBundle()

  it('keeps a cheap junk card below a quality affordable card (quality gate)', () => {
    const shop = makeShop([
      { id: 'HEAVY_BLADE', price: 150 },
      { id: 'JUNK_FAKE_CARD', price: 5 }
    ])
    const { items } = rankShop(shop, shopCtx(200), bundle)
    expect(items[0]?.id).toBe('HEAVY_BLADE')
    const junk = items.find((i) => i.id === 'JUNK_FAKE_CARD')!
    expect(junk.affordable).toBe(true)
    expect(items.indexOf(junk)).toBeGreaterThan(0)
  })

  it('prefers value-per-gold among equally affordable quality cards', () => {
    const shop = makeShop([
      { id: 'HEAVY_BLADE', price: 160 },
      { id: 'UPPERCUT', price: 40 }
    ])
    const { items } = rankShop(shop, shopCtx(200), bundle)
    expect(items[0]?.id).toBe('UPPERCUT')
  })

  it('flags a strong, nearly-affordable item as worth saving for', () => {
    const shop = makeShop([{ id: 'HEAVY_BLADE', price: 140 }])
    const { items } = rankShop(shop, shopCtx(100), bundle)
    expect(items[0]?.affordable).toBe(false)
    expect(items[0]?.saveUp).toBe(true)
  })

  it('does not suggest saving for an out-of-reach item', () => {
    const shop = makeShop([{ id: 'HEAVY_BLADE', price: 300 }])
    const { items } = rankShop(shop, shopCtx(100), bundle)
    expect(items[0]?.affordable).toBe(false)
    expect(items[0]?.saveUp).toBe(false)
  })
})
