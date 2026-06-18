import { describe, it, expect } from 'vitest'
import { SHAPES, pickRandomShape } from '../../src/main/services/drawing/shapes'

describe('shape library', () => {
  it('every shape has non-empty strokes with points inside the unit box', () => {
    expect(SHAPES.length).toBeGreaterThan(0)
    for (const shape of SHAPES) {
      expect(shape.strokes.length).toBeGreaterThan(0)
      for (const stroke of shape.strokes) {
        expect(stroke.length).toBeGreaterThan(0)
        for (const p of stroke) {
          expect(p.x).toBeGreaterThanOrEqual(0)
          expect(p.x).toBeLessThanOrEqual(1)
          expect(p.y).toBeGreaterThanOrEqual(0)
          expect(p.y).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('includes the requested shapes', () => {
    const names = SHAPES.map((s) => s.name)
    expect(names).toEqual(
      expect.arrayContaining(['heart', 'star', 'smiley'])
    )
  })

  it('smiley has four strokes (face, two eyes, smile)', () => {
    const smiley = SHAPES.find((s) => s.name === 'smiley')
    expect(smiley?.strokes.length).toBe(4)
  })

  it('pickRandomShape always returns a shape from the library', () => {
    for (let i = 0; i < 25; i++) {
      expect(SHAPES).toContain(pickRandomShape())
    }
  })
})
