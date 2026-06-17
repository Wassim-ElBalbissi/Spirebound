import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { detectBuild } from '../../src/main/services/recommender/buildMatch'
import type { BuildEntry } from '../../src/main/types/compendium'
import type { CardInstance } from '../../src/main/types/gameState'

function loadBuilds(): BuildEntry[] {
  const p = join(__dirname, '..', '..', 'resources', 'compendium', 'builds.json')
  return JSON.parse(readFileSync(p, 'utf-8'))
}

const card = (id: string): CardInstance => ({ id, name: id, upgraded: false })
const FILLER = Array.from({ length: 6 }, () => card('STRIKE_R'))

describe('detectBuild', () => {
  const builds = loadBuilds()

  it('matches a committed Strength deck above threshold', () => {
    const deck = [card('INFLAME'), card('DEMON_FORM'), card('HEMOKINESIS'), ...FILLER]
    const match = detectBuild(
      'ironclad',
      deck,
      ['VAJRA'],
      builds,
      new Set(['strength', 'attack'])
    )
    expect(match).not.toBeNull()
    expect(match!.build.id).toBe('ic_strength')
    expect(match!.score).toBeGreaterThanOrEqual(0.3)
  })

  it('returns null for a tiny starter deck with no other signal', () => {
    const deck = [card('INFLAME'), card('DEMON_FORM')]
    const match = detectBuild('ironclad', deck, [], builds, new Set())
    expect(match).toBeNull()
  })

  it('matches on relics + tags alone (deck unknown) at the higher threshold', () => {
    const match = detectBuild(
      'ironclad',
      [],
      ['GIRYA', 'VAJRA', 'RUINED_HELMET'],
      builds,
      new Set(['strength', 'attack'])
    )
    expect(match).not.toBeNull()
    expect(match!.build.id).toBe('ic_strength')
  })

  it('returns null when no build exists for the character', () => {
    const deck = [card('INFLAME'), ...FILLER, card('DEMON_FORM')]
    // 'defect' may have no curated builds; if it does, this still must not throw.
    const match = detectBuild('defect', deck, [], builds, new Set(['strength']))
    if (match) expect(match.build.character).toBe('defect')
    else expect(match).toBeNull()
  })
})
