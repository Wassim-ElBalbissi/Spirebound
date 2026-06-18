import { describe, it, expect, beforeAll, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { classifyScreen } from '../../src/main/services/screens'
import type { RawGameState } from '../../src/main/types/rawState'
import type { TierBundle } from '../../src/main/types/tierData'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { loadSpireArchiveBundle } from '../../src/main/services/tierData/spireArchive'
import { resolveDeckIds } from '../../src/main/services/tierData/cardNameIndex'

function fixture(name: string): RawGameState {
  return JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', name), 'utf-8'))
}

describe('combat deck reconstruction', () => {
  const raw = fixture('combat.defect.fullDeck.json')
  const screen = classifyScreen(raw)
  if (screen.kind !== 'combat') throw new Error('expected combat screen')
  const deck = screen.combat.deck ?? []

  it('reconstructs the full deck from hand + piles', () => {
    // 3 hand + 5 draw + 1 discard + 1 exhaust = 10
    expect(deck).toHaveLength(10)
  })

  it('tags cards from their descriptions', () => {
    const zap = deck.find((c) => c.name === 'Zap')
    expect(zap?.tags).toEqual(expect.arrayContaining(['lightning', 'orb-gen']))
    const dualcast = deck.find((c) => c.name === 'Dualcast')
    expect(dualcast?.tags).toEqual(expect.arrayContaining(['evoke', 'orb-gen']))
    const defrag = deck.find((c) => c.name === 'Defragment')
    expect(defrag?.tags).toContain('focus')
  })

  it('keeps hand-card ids and uses names as placeholders for pile cards', () => {
    expect(deck.find((c) => c.name === 'Zap')?.id).toBe('ZAP')
    // Pile "Defend" has no id from the mod — placeholder is the name.
    const pileDefend = deck.find((c) => c.id === 'Defend')
    expect(pileDefend).toBeDefined()
  })

  describe('resolveDeckIds', () => {
    let bundle: TierBundle

    beforeAll(() => {
      bundle = loadSpireArchiveBundle()!
    })

    it('resolves placeholder names to character-scoped bundle ids', () => {
      const resolved = resolveDeckIds(deck, 'defect', bundle)
      const ids = resolved.map((c) => c.id)
      // Pile Strikes/Defends resolve to the Defect variants.
      expect(ids).toContain('STRIKE_DEFECT')
      expect(ids).toContain('DEFEND_DEFECT')
      expect(ids).toContain('DUALCAST')
      expect(ids).toContain('DEFRAGMENT')
      // No placeholder names should remain for cards present in the bundle.
      expect(ids).not.toContain('Defend')
      expect(ids).not.toContain('Strike')
    })

    it('leaves already-resolved hand ids untouched', () => {
      const resolved = resolveDeckIds(deck, 'defect', bundle)
      expect(resolved.find((c) => c.name === 'Ball Lightning')?.id).toBe('BALL_LIGHTNING')
    })
  })
})
