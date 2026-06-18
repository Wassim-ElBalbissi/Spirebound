import { describe, it, expect } from 'vitest'
import {
  computeRegion,
  toPixelStrokes
} from '../../src/main/services/drawing/drawEngine'
import type { Shape } from '../../src/main/services/drawing/shapes'

const display = { x: 0, y: 0, width: 1920, height: 1080 }

describe('computeRegion', () => {
  it('stays inside the game window and clears the top HUD band', () => {
    const game = { x: 0, y: 0, width: 1920, height: 1080 }
    const r = computeRegion(game, display)
    expect(r.x).toBeGreaterThanOrEqual(game.x)
    expect(r.y).toBeGreaterThanOrEqual(game.y)
    expect(r.x + r.width).toBeLessThanOrEqual(game.x + game.width)
    expect(r.y + r.height).toBeLessThanOrEqual(game.y + game.height)
    // top edge sits well below the ~7% HUD strip
    expect(r.y).toBeGreaterThan(game.height * 0.07)
  })

  it('falls back to the display when the game window is not found', () => {
    const r = computeRegion(null, display)
    expect(r.width).toBeGreaterThan(0)
    expect(r.height).toBeGreaterThan(0)
    expect(r.x).toBeGreaterThanOrEqual(display.x)
    expect(r.y).toBeGreaterThanOrEqual(display.y)
  })

  it('honors a negative (left-of-primary) monitor offset', () => {
    const game = { x: -1920, y: 0, width: 1920, height: 1080 }
    const r = computeRegion(game, display)
    expect(r.x).toBeLessThan(0)
  })

  it('is square so shapes are not distorted', () => {
    const game = { x: 0, y: 0, width: 2560, height: 1440 }
    const r = computeRegion(game, display)
    expect(Math.abs(r.width - r.height)).toBeLessThanOrEqual(1)
  })
})

describe('toPixelStrokes', () => {
  const region = { x: 100, y: 200, width: 400, height: 400 }
  const diagonal: Shape = {
    name: 'diag',
    strokes: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
      ]
    ]
  }

  it('maps normalized points into the region as integer pixels', () => {
    const out = toPixelStrokes(diagonal, region)
    expect(out.length).toBe(1)
    for (const p of out[0]) {
      expect(p.x).toBeGreaterThanOrEqual(region.x)
      expect(p.x).toBeLessThanOrEqual(region.x + region.width)
      expect(p.y).toBeGreaterThanOrEqual(region.y)
      expect(p.y).toBeLessThanOrEqual(region.y + region.height)
      expect(Number.isInteger(p.x)).toBe(true)
      expect(Number.isInteger(p.y)).toBe(true)
    }
  })

  it('densifies long segments so adjacent points stay close', () => {
    const out = toPixelStrokes(diagonal, region)
    // ~565px diagonal at <=5px spacing → well over 100 points
    expect(out[0].length).toBeGreaterThan(100)
    for (let i = 1; i < out[0].length; i++) {
      const dx = out[0][i].x - out[0][i - 1].x
      const dy = out[0][i].y - out[0][i - 1].y
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(6)
    }
  })
})
