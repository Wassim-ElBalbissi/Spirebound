/**
 * Pure geometry for the map-doodle feature: where on screen to draw, and how
 * to turn a normalized shape into a dense pixel polyline the in-game pen can
 * follow. No Electron / Node imports so it stays unit-testable.
 */
import type { Point, Shape } from './shapes'

export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A virtual-screen pixel rectangle — either the game window or a display work
 * area. Kept structural so this module doesn't depend on gameWindow's exports.
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// A square keeps shapes undistorted. Sized to a fraction of the smaller
// window dimension and biased to the lower-middle so it clears the top HUD
// strip and the left-anchored map panel.
const SIDE_FRACTION = 0.42
const CENTER_Y_FRACTION = 0.56

/**
 * The on-screen box to draw inside. Centered horizontally in the game window
 * (or the primary display when the game window can't be found) and pushed
 * below the top HUD band.
 */
export function computeRegion(
  gameRect: Rect | null,
  display: Rect
): PixelRect {
  const base = gameRect ?? display
  const side = Math.min(base.width, base.height) * SIDE_FRACTION
  const cx = base.x + base.width / 2
  const cy = base.y + base.height * CENTER_Y_FRACTION
  return {
    x: Math.round(cx - side / 2),
    y: Math.round(cy - side / 2),
    width: Math.round(side),
    height: Math.round(side)
  }
}

// Max pixel gap between consecutive points. Small enough that the game samples
// a continuous line as the cursor moves.
const MAX_STEP_PX = 5

/**
 * Map a shape's normalized strokes into pixel polylines within `region`, then
 * densify each stroke so adjacent points are at most MAX_STEP_PX apart.
 */
export function toPixelStrokes(shape: Shape, region: PixelRect): Point[][] {
  return shape.strokes.map((stroke) => {
    const pixels = stroke.map((p) => ({
      x: region.x + p.x * region.width,
      y: region.y + p.y * region.height
    }))
    return densify(pixels).map((p) => ({
      x: Math.round(p.x),
      y: Math.round(p.y)
    }))
  })
}

function densify(points: Point[]): Point[] {
  if (points.length < 2) return points
  const out: Point[] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.max(1, Math.ceil(dist / MAX_STEP_PX))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}
