import { describe, it, expect, beforeAll, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

vi.mock('electron', () => ({ app: { isPackaged: false } }))

import { classifyScreen } from '../../src/main/services/screens'
import { loadSpireArchiveBundle } from '../../src/main/services/tierData/spireArchive'
import { resolveDeckIds } from '../../src/main/services/tierData/cardNameIndex'
import { createRecommender } from '../../src/main/services/recommender'
import type { BuildEntry } from '../../src/main/types/compendium'
import type { NormalizedState, RelicInstance } from '../../src/main/types/gameState'
import type { TierBundle } from '../../src/main/types/tierData'
import type { RawGameState } from '../../src/main/types/rawState'

function readJson<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(__dirname, '..', '..', ...parts), 'utf-8'))
}
function fixture(name: string): RawGameState {
  return JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', name), 'utf-8'))
}

const CRACKED_CORE: RelicInstance = {
  id: 'CRACKED_CORE',
  name: 'Cracked Core',
  counter: null
}

function defectRun(screen: NormalizedState['screen']): NormalizedState {
  return {
    run: {
      character: 'defect',
      ascension: 0,
      act: 1,
      floor: 7,
      hp: 70,
      maxHp: 75,
      gold: 200,
      relics: [CRACKED_CORE],
      potions: [],
      map: null,
      deckKnown: false
    },
    screen,
    ts: 0
  }
}

describe('end-to-end build-aware flow (Defect lightning)', () => {
  let bundle: TierBundle
  let builds: BuildEntry[]

  beforeAll(() => {
    bundle = loadSpireArchiveBundle()!
    builds = readJson<BuildEntry[]>('resources', 'compendium', 'builds.json')
  })

  it('detects the lightning build from the combat deck and surfaces it in shop + card advice', () => {
    const recommender = createRecommender(bundle, builds)

    // 1. Reconstruct + resolve the deck from a Defect combat, like the pipeline.
    const combat = classifyScreen(fixture('combat.defect.fullDeck.json'))
    if (combat.kind !== 'combat') throw new Error('expected combat')
    const deck = resolveDeckIds(combat.combat.deck ?? [], 'defect', bundle)
    recommender.setDeck(deck)

    // 2. Card reward: offer a lightning key card, a frost card, and a neutral.
    const cardRec = recommender.recommend(
      defectRun({
        kind: 'cardReward',
        offers: [
          { id: 'STORM', name: 'Storm', upgraded: false },
          { id: 'CHILL', name: 'Chill', upgraded: false },
          { id: 'BANDAGE_UP', name: 'Bandage Up', upgraded: false }
        ],
        canSkip: true
      })
    )
    expect(cardRec.kind).toBe('cardPick')
    if (cardRec.kind !== 'cardPick') throw new Error('unreachable')
    expect(cardRec.build).not.toBeNull()
    expect(cardRec.build!.id).toBe('de_lightning')
    // The lightning key card should rank above the off-archetype frost card.
    const storm = cardRec.ranked.find((r) => r.id === 'STORM')!
    const chill = cardRec.ranked.find((r) => r.id === 'CHILL')!
    expect(storm.score).toBeGreaterThan(chill.score)

    // 3. Shop: same build surfaced; lightning card present in the ranked items.
    const shopRec = recommender.recommend(
      defectRun({
        kind: 'shop',
        cards: [{ id: 'STORM', name: 'Storm', upgraded: false, price: 75 }],
        relics: [],
        potions: []
      })
    )
    expect(shopRec.kind).toBe('shopAdvice')
    if (shopRec.kind !== 'shopAdvice') throw new Error('unreachable')
    expect(shopRec.build?.id).toBe('de_lightning')
  })

  it('stays build-blind (no crash, no build) when the deck is unknown', () => {
    const recommender = createRecommender(bundle, builds)
    recommender.setDeck(null)
    const rec = recommender.recommend(
      defectRun({
        kind: 'cardReward',
        offers: [{ id: 'STORM', name: 'Storm', upgraded: false }],
        canSkip: true
      })
    )
    expect(rec.kind).toBe('cardPick')
    // With only the starter relic and no deck, no build should commit yet.
    if (rec.kind === 'cardPick') expect(rec.build).toBeNull()
  })
})
