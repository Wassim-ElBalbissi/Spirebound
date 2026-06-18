import { describe, it, expect } from 'vitest'
import { deriveArchetypeTags } from '../../src/main/services/tierData/deriveArchetypeTags'

describe('deriveArchetypeTags', () => {
  it('tags Defect orb cards by orb color + orb-gen', () => {
    expect(deriveArchetypeTags({ description: 'Deal 7 damage.\nChannel 1 Lightning.', type: 'Attack' }))
      .toEqual(expect.arrayContaining(['lightning', 'orb-gen', 'attack']))
    expect(deriveArchetypeTags({ description: 'Channel 1 Frost for each enemy.' }))
      .toEqual(expect.arrayContaining(['frost', 'orb-gen']))
    expect(deriveArchetypeTags({ description: 'Channel 1 Dark.\nTrigger the passive ability of all Dark Orbs.' }))
      .toEqual(expect.arrayContaining(['dark', 'orb-gen']))
  })

  it('distinguishes Defect orb sub-archetypes', () => {
    const lightning = deriveArchetypeTags({ description: 'Channel 1 Lightning.' })
    const frost = deriveArchetypeTags({ description: 'Channel 1 Frost.' })
    expect(lightning).toContain('lightning')
    expect(lightning).not.toContain('frost')
    expect(frost).toContain('frost')
    expect(frost).not.toContain('lightning')
  })

  it('tags Focus and Evoke', () => {
    expect(deriveArchetypeTags({ description: 'Gain 1 Focus.', type: 'Power' })).toContain('focus')
    expect(deriveArchetypeTags({ description: 'Evoke your rightmost Orb twice.' }))
      .toEqual(expect.arrayContaining(['evoke', 'orb-gen']))
  })

  it('tags Silent poison / shiv / discard / draw', () => {
    expect(deriveArchetypeTags({ description: 'Apply 3 Poison to a random enemy 3 times.' })).toContain('poison')
    expect(deriveArchetypeTags({ description: 'Add 3 Shivs into your Hand.' })).toContain('shiv')
    expect(deriveArchetypeTags({ description: 'Draw 3 cards. Discard 1 card.' }))
      .toEqual(expect.arrayContaining(['draw-cycle', 'discard']))
  })

  it('tags Ironclad strength / exhaust / self-damage', () => {
    expect(deriveArchetypeTags({ description: 'Lose 1 HP. Exhaust 1 card. Gain 1 Strength.' }))
      .toEqual(expect.arrayContaining(['strength', 'exhaust', 'self-damage']))
  })

  it('folds keyword names into the scan', () => {
    expect(deriveArchetypeTags({ description: 'Channel 1 Frost.', keywords: ['Exhaust'] }))
      .toEqual(expect.arrayContaining(['frost', 'orb-gen', 'exhaust']))
  })

  it('does not false-positive orb colors on unrelated cards', () => {
    const tags = deriveArchetypeTags({ description: 'Deal 8 damage. Apply 2 Vulnerable.', type: 'Attack' })
    expect(tags).not.toContain('lightning')
    expect(tags).not.toContain('frost')
    expect(tags).not.toContain('orb-gen')
    expect(tags).toContain('attack')
  })

  it('returns an empty array for empty input', () => {
    expect(deriveArchetypeTags({})).toEqual([])
  })
})
