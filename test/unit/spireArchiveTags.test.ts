import { describe, it, expect, beforeAll, vi } from 'vitest'

// loadSpireArchiveBundle reads paths via electron's `app`; stub it to the repo cwd.
vi.mock('electron', () => ({ app: { isPackaged: false } }))

import { loadSpireArchiveBundle } from '../../src/main/services/tierData/spireArchive'
import type { TierBundle } from '../../src/main/types/tierData'

describe('spire-archive archetype tagging', () => {
  let bundle: TierBundle | null

  beforeAll(() => {
    bundle = loadSpireArchiveBundle()
  })

  it('loads the snapshot', () => {
    expect(bundle).not.toBeNull()
  })

  it('now tags Defect orb cards (previously ZERO carried orb tags)', () => {
    const cards = Object.values(bundle!.cards).filter((c) => c.character === 'defect')
    const withOrbGen = cards.filter((c) => c.tags.includes('orb-gen'))
    const withLightning = cards.filter((c) => c.tags.includes('lightning'))
    const withFrost = cards.filter((c) => c.tags.includes('frost'))
    const withDark = cards.filter((c) => c.tags.includes('dark'))

    // Verified description coverage: Channel=25, Lightning=9, Frost=7, Dark=5.
    expect(withOrbGen.length).toBeGreaterThanOrEqual(20)
    expect(withLightning.length).toBeGreaterThanOrEqual(6)
    expect(withFrost.length).toBeGreaterThanOrEqual(5)
    expect(withDark.length).toBeGreaterThanOrEqual(4)
  })

  it('tags specific signature cards correctly', () => {
    const ball = bundle!.cards['BALL_LIGHTNING']
    expect(ball?.tags).toEqual(expect.arrayContaining(['lightning', 'orb-gen']))
    const defrag = bundle!.cards['DEFRAGMENT']
    expect(defrag?.tags).toContain('focus')
  })

  it('tags other characters core archetypes', () => {
    const poisonCards = Object.values(bundle!.cards).filter(
      (c) => c.character === 'silent' && c.tags.includes('poison')
    )
    const strengthCards = Object.values(bundle!.cards).filter(
      (c) => c.character === 'ironclad' && c.tags.includes('strength')
    )
    expect(poisonCards.length).toBeGreaterThan(0)
    expect(strengthCards.length).toBeGreaterThan(0)
  })
})
