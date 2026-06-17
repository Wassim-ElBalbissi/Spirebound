import { describe, it, expect } from 'vitest'
import { rankPathsFor } from '../../src/main/services/recommender/mapPath'
import type { MapNode } from '../../src/main/types/gameState'

function n(
  id: string,
  room: MapNode['room'],
  children: string[] = []
): MapNode {
  return { id, col: 0, row: 0, room, children }
}

/**
 * Synthetic 3-column map:
 *  start → A1/A2 → B → boss
 *  Path A: start → A1 (elite) → B (rest) → boss
 *  Path B: start → A2 (monster) → B (rest) → boss
 *  Path C: start → A1 (elite) → C (monster) → boss
 */
function makeMap(): MapNode[] {
  return [
    n('start', 'start', ['A1', 'A2']),
    n('A1', 'elite', ['B', 'C']),
    n('A2', 'monster', ['B']),
    n('B', 'rest', ['boss']),
    n('C', 'monster', ['boss']),
    n('boss', 'boss', [])
  ]
}

describe('rankPaths', () => {
  it('returns no paths when start is missing', () => {
    expect(
      rankPathsFor([], null, 'boss', { hpFraction: 1, gold: 0, act: 1 })
    ).toEqual([])
  })

  it('act-1 elite path scores higher than the all-monster equivalent', () => {
    const nodes = makeMap()
    const paths = rankPathsFor(nodes, 'start', 'boss', {
      hpFraction: 0.9,
      gold: 0,
      act: 1
    })
    const elitePath = paths.find((p) => p.nodeIds.includes('A1'))!
    const safePath = paths.find((p) => p.nodeIds.includes('A2'))!
    expect(elitePath.score).toBeGreaterThan(safePath.score)
  })

  it('rest weight increases when HP is low', () => {
    const nodes = makeMap()
    const fullHp = rankPathsFor(nodes, 'start', 'boss', {
      hpFraction: 1.0,
      gold: 0,
      act: 1
    })
    const lowHp = rankPathsFor(nodes, 'start', 'boss', {
      hpFraction: 0.2,
      gold: 0,
      act: 1
    })
    const restPathFull = fullHp.find((p) => p.nodeIds.includes('B'))!
    const restPathLow = lowHp.find((p) => p.nodeIds.includes('B'))!
    expect(restPathLow.score).toBeGreaterThan(restPathFull.score)
  })

  it('returns at most 3 paths', () => {
    const nodes = makeMap()
    const paths = rankPathsFor(nodes, 'start', 'boss', {
      hpFraction: 1,
      gold: 0,
      act: 1
    })
    expect(paths.length).toBeLessThanOrEqual(3)
  })

  it('every returned path ends at the boss', () => {
    const nodes = makeMap()
    const paths = rankPathsFor(nodes, 'start', 'boss', {
      hpFraction: 1,
      gold: 0,
      act: 1
    })
    for (const p of paths) {
      expect(p.nodeIds.at(-1)).toBe('boss')
    }
  })
})
