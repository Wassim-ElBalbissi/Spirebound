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

  it('does not throw for a character/deck with no matching build', () => {
    const deck = [card('INFLAME'), ...FILLER, card('DEMON_FORM')]
    const match = detectBuild('defect', deck, [], builds, new Set(['strength']))
    if (match) expect(match.build.character).toBe('defect')
    else expect(match).toBeNull()
  })

  // Tags carried on the card (set when reconstructed from the combat piles).
  const taggedCard = (id: string, tags: string[]): CardInstance => ({
    id,
    name: id,
    upgraded: false,
    tags
  })

  it('picks the lightning build for a lightning-leaning orb deck', () => {
    const deck = [
      taggedCard('BALL_LIGHTNING', ['lightning', 'orb-gen', 'attack']),
      taggedCard('ZAP', ['lightning', 'orb-gen']),
      taggedCard('DEFRAGMENT', ['focus']),
      taggedCard('BIASED_COGNITION', ['focus']),
      taggedCard('STORM', ['lightning', 'orb-gen']),
      taggedCard('DUALCAST', ['evoke', 'orb-gen']),
      ...Array.from({ length: 4 }, () => taggedCard('STRIKE_B', ['attack']))
    ]
    const tags = new Set(['orb-gen', 'focus', 'lightning', 'evoke', 'attack'])
    const counts = new Map<string, number>([
      ['lightning', 3],
      ['orb-gen', 5],
      ['focus', 2],
      ['evoke', 1]
    ])
    const match = detectBuild('defect', deck, ['CRACKED_CORE'], builds, tags, counts)
    expect(match).not.toBeNull()
    expect(match!.build.id).toBe('de_lightning')
  })

  it('picks the frost build for a frost-leaning orb deck', () => {
    const deck = [
      taggedCard('CHILL', ['frost', 'orb-gen']),
      taggedCard('GLACIER', ['frost', 'orb-gen', 'block']),
      taggedCard('COOLHEADED', ['frost', 'orb-gen', 'draw-cycle']),
      taggedCard('DEFRAGMENT', ['focus']),
      taggedCard('GENETIC_ALGORITHM', ['block']),
      taggedCard('DUALCAST', ['evoke', 'orb-gen']),
      ...Array.from({ length: 4 }, () => taggedCard('DEFEND_B', ['block']))
    ]
    const tags = new Set(['orb-gen', 'focus', 'frost', 'block', 'evoke'])
    const counts = new Map<string, number>([
      ['frost', 3],
      ['orb-gen', 4],
      ['focus', 1]
    ])
    const match = detectBuild('defect', deck, ['CRACKED_CORE'], builds, tags, counts)
    expect(match).not.toBeNull()
    expect(match!.build.id).toBe('de_frost')
  })
})
