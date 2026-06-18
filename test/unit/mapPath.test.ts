import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { normalize } from '../../src/main/services/screens'
import { rankMapPath } from '../../src/main/services/recommender/mapPath'
import type { RawGameState } from '../../src/main/types/rawState'
import type { RunState } from '../../src/main/types/gameState'

function fixtureMap(): NonNullable<RunState['map']> {
  const raw: RawGameState = JSON.parse(
    readFileSync(join(__dirname, '..', 'fixtures', 'map.act1-floor3.json'), 'utf-8')
  )
  const state = normalize(raw)
  if (!state.run?.map) throw new Error('expected a map')
  return state.run.map
}

describe('rankMapPath', () => {
  const map = fixtureMap()

  it('takes the Elite branch when healthy (relic worth the risk)', () => {
    const result = rankMapPath(map, { hp: 55, maxHp: 70 })
    expect(result).not.toBeNull()
    const rooms = result!.steps.map((s) => s.room)
    // Best path from (3,2): Rest -> Elite -> Monster.
    expect(rooms[0]).toBe('rest')
    expect(rooms).toContain('elite')
    expect(result!.nextRoom).toBe('rest')
  })

  it('avoids the Elite when low on HP', () => {
    const result = rankMapPath(map, { hp: 12, maxHp: 70 })
    expect(result).not.toBeNull()
    const rooms = result!.steps.map((s) => s.room)
    expect(rooms).not.toContain('elite')
    // It should still rest first and then take the Merchant branch.
    expect(rooms[0]).toBe('rest')
    expect(rooms).toContain('shop')
    expect(result!.rationale.join(' ')).toMatch(/Low HP/i)
  })

  it('annotates each step with a direction to disambiguate same-type nodes', () => {
    const result = rankMapPath(map, { hp: 55, maxHp: 70 })
    // Current node is at col 3; the recommended Rest is at col 2 → up-left.
    expect(result!.steps[0]!.dir).toBe('left')
    for (const step of result!.steps) {
      expect(['left', 'up', 'right']).toContain(step.dir)
      expect(typeof step.col).toBe('number')
    }
  })

  it('only ever recommends a legal first step (a child of the current node)', () => {
    const result = rankMapPath(map, { hp: 55, maxHp: 70 })
    const legalFirstIds = map.nodes.find((n) => n.id === map.currentNodeId)!.children
    expect(legalFirstIds).toContain(result!.nextId)
  })

  it('suggests an entry node at the start of an act (no current node yet)', () => {
    const startMap = {
      ...map,
      currentNodeId: null,
      nextOptionIds: ['2,3', '4,3']
    }
    const result = rankMapPath(startMap, { hp: 70, maxHp: 70 })
    expect(result).not.toBeNull()
    expect(['2,3', '4,3']).toContain(result!.nextId)
  })

  it('returns null for an empty map', () => {
    const empty = { ...map, nodes: [], nextOptionIds: [] }
    expect(rankMapPath(empty, { hp: 70, maxHp: 70 })).toBeNull()
  })
})
