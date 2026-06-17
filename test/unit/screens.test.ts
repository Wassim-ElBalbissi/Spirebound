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
})
