import { describe, it, expect } from 'vitest'
import {
  estimateCardSlots,
  DEFAULT_CALIBRATION
} from '../../src/main/services/cardSlotLayout'

describe('estimateCardSlots', () => {
  it('returns empty when hand is empty', () => {
    expect(
      estimateCardSlots({
        handSize: 0,
        displayWidth: 1920,
        displayHeight: 1080
      })
    ).toEqual([])
  })

  it('places a single card at horizontal center', () => {
    const slots = estimateCardSlots({
      handSize: 1,
      displayWidth: 1920,
      displayHeight: 1080
    })
    expect(slots).toHaveLength(1)
    expect(slots[0]!.x).toBe(960)
  })

  it('produces evenly-spaced rects centered on the screen at 1080p / 5 cards', () => {
    const slots = estimateCardSlots({
      handSize: 5,
      displayWidth: 1920,
      displayHeight: 1080
    })
    expect(slots).toHaveLength(5)
    const xs = slots.map((s) => s.x)
    const center = (xs[0]! + xs[xs.length - 1]!) / 2
    expect(Math.abs(center - 1920 / 2)).toBeLessThan(0.5)
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i]! - xs[i - 1]!
      expect(d).toBeGreaterThan(0)
      if (i > 1) {
        const prev = xs[i - 1]! - xs[i - 2]!
        expect(Math.abs(d - prev)).toBeLessThan(0.5)
      }
    }
  })

  it('row Y is anchored from the bottom of the display', () => {
    const slots = estimateCardSlots({
      handSize: 3,
      displayWidth: 1920,
      displayHeight: 1080
    })
    // Card top = displayHeight - cardHeight - bottomOffset.
    // With REFERENCE_CARD_HEIGHT=230 and REFERENCE_BOTTOM_OFFSET=30 at 1080p:
    //   1080 - 230 - 30 = 820.
    expect(slots[0]!.y).toBeCloseTo(820, 0)
  })

  it('scales card width/height with display height (4K vs 1080p)', () => {
    const a = estimateCardSlots({
      handSize: 1,
      displayWidth: 3840,
      displayHeight: 2160
    })
    const b = estimateCardSlots({
      handSize: 1,
      displayWidth: 1920,
      displayHeight: 1080
    })
    expect(a[0]!.width).toBeCloseTo(b[0]!.width * 2, 1)
    expect(a[0]!.height).toBeCloseTo(b[0]!.height * 2, 1)
  })

  it('constrains the row when the hand is wide (10 cards)', () => {
    const slots = estimateCardSlots({
      handSize: 10,
      displayWidth: 1920,
      displayHeight: 1080
    })
    const leftEdge = slots[0]!.x - slots[0]!.width / 2
    const rightEdge =
      slots[slots.length - 1]!.x + slots[slots.length - 1]!.width / 2
    expect(leftEdge).toBeGreaterThan(0)
    expect(rightEdge).toBeLessThan(1920)
  })

  it('verticalOffsetPct shifts every slot equally', () => {
    const a = estimateCardSlots({
      handSize: 5,
      displayWidth: 1920,
      displayHeight: 1080
    })
    const b = estimateCardSlots({
      handSize: 5,
      displayWidth: 1920,
      displayHeight: 1080,
      calibration: { ...DEFAULT_CALIBRATION, verticalOffsetPct: -5 }
    })
    for (let i = 0; i < 5; i++) {
      expect(b[i]!.y).toBeCloseTo(a[i]!.y - 54, 0)
    }
  })

  it('mod-provided positions override the heuristic (identity viewport)', () => {
    const slots = estimateCardSlots({
      handSize: 3,
      displayWidth: 1920,
      displayHeight: 1080,
      modPositions: [
        { x: 100, y: 800, w: 145, h: 200 },
        { x: 400, y: 800, w: 145, h: 200 },
        { x: 700, y: 800, w: 145, h: 200 }
      ],
      modViewport: { w: 1920, h: 1080 }
    })
    expect(slots).toHaveLength(3)
    expect(slots[0]!.x).toBe(100 + 145 / 2)
    expect(slots[0]!.y).toBe(800)
    expect(slots[0]!.width).toBe(145)
    expect(slots[0]!.height).toBe(200)
    expect(slots[2]!.x).toBe(700 + 145 / 2)
  })

  it('mod-provided positions scale linearly from viewport to display', () => {
    const slots = estimateCardSlots({
      handSize: 1,
      displayWidth: 1920,
      displayHeight: 1080,
      modPositions: [{ x: 640, y: 360, w: 145, h: 200 }],
      modViewport: { w: 1280, h: 720 }
    })
    // 1920/1280 = 1.5 scale on X; 1080/720 = 1.5 scale on Y.
    expect(slots[0]!.x).toBeCloseTo(640 * 1.5 + 145 * 1.5 / 2, 5)
    expect(slots[0]!.y).toBeCloseTo(360 * 1.5, 5)
    expect(slots[0]!.width).toBeCloseTo(145 * 1.5, 5)
    expect(slots[0]!.height).toBeCloseTo(200 * 1.5, 5)
  })

  it('falls through to anchors / heuristic when mod positions are incomplete', () => {
    const slots = estimateCardSlots({
      handSize: 3,
      displayWidth: 1920,
      displayHeight: 1080,
      modPositions: [
        { x: 100, y: 800, w: 145, h: 200 },
        undefined,
        { x: 700, y: 800, w: 145, h: 200 }
      ],
      modViewport: { w: 1920, h: 1080 }
    })
    // Heuristic path: center of row near 1920 / 2.
    const center = (slots[0]!.x + slots[2]!.x) / 2
    expect(Math.abs(center - 960)).toBeLessThan(0.5)
    expect(slots[0]!.y).toBeCloseTo(820, 0)
  })

  it('horizontalStretchPct widens the row symmetrically around center', () => {
    const a = estimateCardSlots({
      handSize: 5,
      displayWidth: 1920,
      displayHeight: 1080
    })
    const b = estimateCardSlots({
      handSize: 5,
      displayWidth: 1920,
      displayHeight: 1080,
      calibration: { ...DEFAULT_CALIBRATION, horizontalStretchPct: 20 }
    })
    expect(b[0]!.x).toBeLessThan(a[0]!.x)
    expect(b[4]!.x).toBeGreaterThan(a[4]!.x)
    const aCenter = (a[0]!.x + a[4]!.x) / 2
    const bCenter = (b[0]!.x + b[4]!.x) / 2
    expect(Math.abs(aCenter - bCenter)).toBeLessThan(0.5)
  })
})
