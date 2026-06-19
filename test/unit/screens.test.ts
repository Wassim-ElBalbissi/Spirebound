import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { classifyScreen, normalize, nodeId } from '../../src/main/services/screens'
import type { RawGameState } from '../../src/main/types/rawState'

function fixture(name: string): RawGameState {
  const p = join(__dirname, '..', 'fixtures', name)
  return JSON.parse(readFileSync(p, 'utf-8'))
}

describe('classifyScreen', () => {
  it('classifies menu', () => {
    expect(classifyScreen(fixture('menu.json'))).toEqual({ kind: 'menu' })
  })

  it('classifies card reward and surfaces offers', () => {
    const s = classifyScreen(fixture('cardReward.ironclad-act1.json'))
    expect(s.kind).toBe('cardReward')
    if (s.kind !== 'cardReward') throw new Error('unreachable')
    expect(s.offers).toHaveLength(3)
    expect(s.offers.map((c) => c.id)).toEqual([
      'UPPERCUT',
      'HEAVY_BLADE',
      'INTIMIDATE'
    ])
    expect(s.canSkip).toBe(true)
  })

  it('classifies map', () => {
    expect(classifyScreen(fixture('map.act1-floor3.json'))).toEqual({
      kind: 'map'
    })
  })

  it('classifies event with structured choices', () => {
    const s = classifyScreen(fixture('event.neow.json'))
    expect(s.kind).toBe('event')
    if (s.kind !== 'event') throw new Error('unreachable')
    expect(s.eventId).toBe('NEOW')
    expect(s.choices.map((c) => c.title)).toEqual(['Max HP', 'Relic', 'Card'])
    expect(s.choices.every((c) => !c.isLocked)).toBe(true)
  })

  it('classifies relic_select (boss relics)', () => {
    const s = classifyScreen(fixture('relicSelect.bossRelics.json'))
    expect(s.kind).toBe('relicReward')
    if (s.kind !== 'relicReward') throw new Error('unreachable')
    expect(s.offers.map((r) => r.id)).toEqual([
      'BLACK_STAR',
      'RUNIC_DOME',
      'SOZU'
    ])
  })

  it('classifies combat and surfaces hand + enemies', () => {
    const s = classifyScreen(fixture('combat.monster.json'))
    expect(s.kind).toBe('combat')
    if (s.kind !== 'combat') throw new Error('unreachable')
    expect(s.combat.enemies).toHaveLength(1)
    expect(s.combat.enemies[0]?.name).toBe('Jaw Worm')
    expect(s.combat.enemies[0]?.intent?.type).toBe('Attack')
  })

  it('parses multi-hit counts from card text', () => {
    const hits = (description: string): number | undefined => {
      const raw: RawGameState = {
        state_type: 'monster',
        run: { act: 1, floor: 1, ascension: 0 },
        player: {
          character: 'The Ironclad',
          hp: 70,
          max_hp: 70,
          block: 0,
          gold: 0,
          energy: 3,
          max_energy: 3,
          status: [],
          relics: [],
          potions: [],
          hand: [
            {
              index: 0,
              id: 'C',
              name: 'C',
              type: 'Attack',
              cost: '1',
              star_cost: null,
              description,
              is_upgraded: false,
              can_play: true,
              unplayable_reason: null,
              keywords: []
            }
          ]
        },
        battle: { round: 1, turn: 'player', enemies: [] }
      } as unknown as RawGameState
      const s = classifyScreen(raw)
      if (s.kind !== 'combat') throw new Error('not combat')
      return s.combat.hand[0]?.parsedHits
    }
    expect(hits('Deal 5 damage 3 times.')).toBe(3)
    expect(hits('Deal 5 damage to ALL enemies twice.')).toBe(2)
    expect(hits('Deal 6 damage.')).toBe(1)
    // A later unrelated count must not be mistaken for a hit count.
    expect(hits('Deal 6 damage. Draw 2 cards.')).toBe(1)
  })

  it('parses card draw from card text', () => {
    const draw = (description: string): number | undefined => {
      const raw: RawGameState = {
        state_type: 'monster',
        run: { act: 1, floor: 1, ascension: 0 },
        player: {
          character: 'The Defect',
          hp: 70,
          max_hp: 70,
          block: 0,
          gold: 0,
          energy: 3,
          max_energy: 3,
          status: [],
          relics: [],
          potions: [],
          hand: [
            {
              index: 0,
              id: 'C',
              name: 'C',
              type: 'Skill',
              cost: '1',
              star_cost: null,
              description,
              is_upgraded: false,
              can_play: true,
              unplayable_reason: null,
              keywords: []
            }
          ]
        },
        battle: { round: 1, turn: 'player', enemies: [] }
      } as unknown as RawGameState
      const s = classifyScreen(raw)
      if (s.kind !== 'combat') throw new Error('not combat')
      return s.combat.hand[0]?.parsedDraw
    }
    expect(draw('Draw 3 cards.')).toBe(3)
    expect(draw('Channel 1 Frost. Draw 1 card.')).toBe(1)
    expect(draw('Draw a card.')).toBe(1)
    expect(draw('Deal 6 damage.')).toBeUndefined()
    // A *conditional* draw is not parsed as guaranteed — the combat scorer
    // evaluates it from state instead.
    expect(
      draw('Deal 5 damage. If you have played fewer than 3 cards this turn, draw 1 card.')
    ).toBeUndefined()
  })

  it('treats transient treasure (only message) as unknown', () => {
    expect(classifyScreen(fixture('treasureTransient.json'))).toEqual({
      kind: 'unknown'
    })
  })
})

describe('normalize', () => {
  it('returns run=null for menu', () => {
    const out = normalize(fixture('menu.json'))
    expect(out.run).toBeNull()
    expect(out.screen.kind).toBe('menu')
  })

  it('extracts canonical character + run info', () => {
    const out = normalize(fixture('cardReward.ironclad-act1.json'))
    expect(out.run?.character).toBe('ironclad')
    expect(out.run?.act).toBe(1)
    expect(out.run?.floor).toBe(4)
    expect(out.run?.hp).toBe(72)
    expect(out.run?.maxHp).toBe(80)
    expect(out.run?.gold).toBe(99)
    expect(out.run?.relics).toHaveLength(1)
    expect(out.run?.relics[0]?.id).toBe('BURNING_BLOOD')
  })

  it('normalizes map graph with col,row keys and child refs', () => {
    const out = normalize(fixture('map.act1-floor3.json'))
    expect(out.run?.map?.currentNodeId).toBe(nodeId(3, 2))
    expect(out.run?.map?.nextOptionIds).toEqual([nodeId(2, 3), nodeId(4, 3)])
    expect(out.run?.map?.bossId).toBe('ENCOUNTER.VANTOM_BOSS')
    const start = out.run?.map?.nodes.find((n) => n.id === nodeId(3, 0))
    expect(start?.children).toEqual([nodeId(3, 1)])
    const branchingMonster = out.run?.map?.nodes.find(
      (n) => n.id === nodeId(3, 2)
    )
    expect(branchingMonster?.children).toEqual([nodeId(2, 3), nodeId(4, 3)])
  })

  it('character canonicalization handles "The " prefix', () => {
    const silent = normalize(fixture('map.act1-floor3.json'))
    expect(silent.run?.character).toBe('silent')
    const defect = normalize(fixture('event.neow.json'))
    expect(defect.run?.character).toBe('defect')
  })

  it('does not throw on a sparse body missing relics/potions/run fields', () => {
    // A co-op/MP body can omit arrays the single-player shape always has. This
    // used to throw (`.map` on undefined) → the poll loop read it as a
    // disconnect. It must degrade gracefully instead.
    const raw = {
      state_type: 'map',
      run: {},
      player: { character: 'The Ironclad', hp: 50, max_hp: 70 }
    } as unknown as RawGameState
    const out = normalize(raw)
    expect(out.run?.character).toBe('ironclad')
    expect(out.run?.relics).toEqual([])
    expect(out.run?.potions).toEqual([])
    expect(out.run?.act).toBe(0)
    expect(out.run?.floor).toBe(0)
    expect(out.run?.gold).toBe(0)
    expect(out.screen.kind).toBe('map')
  })

  it('keeps the classified screen when the character is unknown', () => {
    const raw = {
      state_type: 'map',
      run: { act: 1, floor: 1, ascension: 0 },
      player: { character: 'Stranger', hp: 50, max_hp: 70, relics: [], potions: [] }
    } as unknown as RawGameState
    const out = normalize(raw)
    expect(out.run).toBeNull()
    expect(out.screen.kind).toBe('map')
  })
})
