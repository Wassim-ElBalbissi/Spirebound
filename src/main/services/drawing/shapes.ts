/**
 * Vector shapes for the "doodle on the map" hotkey. Each shape is a list of
 * strokes; each stroke is a polyline in a normalized unit box (x,y in 0..1,
 * y pointing down to match screen space). The pen lifts between strokes, so
 * multi-stroke shapes (smiley, ghost, cat) render as separate pen strokes.
 *
 * drawEngine maps these into on-screen pixels and densifies them; mouseDraw
 * traces each stroke by holding the right mouse button (the in-game pen).
 */

export interface Point {
  x: number
  y: number
}

export interface Shape {
  name: string
  strokes: Point[][]
}

/** Sample an arc of a circle (degrees, clockwise in screen space). */
function arc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  segments: number
): Point[] {
  const pts: Point[] = []
  for (let i = 0; i <= segments; i++) {
    const deg = startDeg + ((endDeg - startDeg) * i) / segments
    const rad = (deg * Math.PI) / 180
    pts.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) })
  }
  return pts
}

function circle(cx: number, cy: number, r: number, segments = 32): Point[] {
  return arc(cx, cy, r, 0, 360, segments)
}

/** Fit points into [pad, 1-pad] preserving aspect ratio; optionally flip Y. */
function normalizeAspect(pts: Point[], pad: number, flipY: boolean): Point[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const w = maxX - minX || 1
  const h = maxY - minY || 1
  const span = 1 - 2 * pad
  const scale = span / Math.max(w, h)
  const offX = pad + (span - w * scale) / 2
  const offY = pad + (span - h * scale) / 2
  return pts.map((p) => {
    const nx = offX + (p.x - minX) * scale
    let ny = offY + (p.y - minY) * scale
    if (flipY) ny = 1 - ny
    return { x: nx, y: ny }
  })
}

/** Classic parametric heart, sampled and normalized (math Y-up → screen). */
function heartStroke(): Point[] {
  const raw: Point[] = []
  const N = 90
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    raw.push({ x, y })
  }
  return normalizeAspect(raw, 0.06, /* flipY */ true)
}

/** Five-point star drawn as a single continuous pentagram stroke. */
function starStroke(): Point[] {
  const cx = 0.5
  const cy = 0.5
  const r = 0.48
  // Visit every other outer point so the whole star is one stroke.
  const order = [0, 2, 4, 1, 3, 0]
  return order.map((k) => {
    const rad = ((-90 + 72 * k) * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  })
}

const smiley: Shape = {
  name: 'smiley',
  strokes: [
    circle(0.5, 0.5, 0.46, 48), // face
    circle(0.37, 0.4, 0.05, 14), // left eye
    circle(0.63, 0.4, 0.05, 14), // right eye
    arc(0.5, 0.52, 0.26, 25, 155, 24) // smile (lower arc)
  ]
}

const ghostOutline: Point[] = [
  { x: 0.22, y: 0.9 },
  { x: 0.22, y: 0.42 },
  ...arc(0.5, 0.42, 0.28, 180, 360, 24), // domed top
  { x: 0.78, y: 0.9 },
  // wavy hem, right → left
  { x: 0.69, y: 0.78 },
  { x: 0.6, y: 0.9 },
  { x: 0.5, y: 0.78 },
  { x: 0.4, y: 0.9 },
  { x: 0.31, y: 0.78 },
  { x: 0.22, y: 0.9 }
]

const ghost: Shape = {
  name: 'ghost',
  strokes: [
    ghostOutline,
    circle(0.4, 0.4, 0.045, 12), // left eye
    circle(0.6, 0.4, 0.045, 12) // right eye
  ]
}

const cat: Shape = {
  name: 'cat',
  strokes: [
    circle(0.5, 0.55, 0.36, 40), // face
    [
      { x: 0.3, y: 0.3 },
      { x: 0.22, y: 0.05 },
      { x: 0.47, y: 0.22 },
      { x: 0.3, y: 0.3 }
    ], // left ear
    [
      { x: 0.7, y: 0.3 },
      { x: 0.78, y: 0.05 },
      { x: 0.53, y: 0.22 },
      { x: 0.7, y: 0.3 }
    ], // right ear
    circle(0.38, 0.52, 0.05, 12), // left eye
    circle(0.62, 0.52, 0.05, 12), // right eye
    [
      { x: 0.46, y: 0.62 },
      { x: 0.54, y: 0.62 },
      { x: 0.5, y: 0.68 },
      { x: 0.46, y: 0.62 }
    ], // nose
    [
      { x: 0.18, y: 0.64 },
      { x: 0.42, y: 0.66 }
    ], // left whisker
    [
      { x: 0.82, y: 0.64 },
      { x: 0.58, y: 0.66 }
    ] // right whisker
  ]
}

export const SHAPES: Shape[] = [
  { name: 'heart', strokes: [heartStroke()] },
  { name: 'star', strokes: [starStroke()] },
  smiley,
  ghost,
  cat
]

/** Pick a random shape to draw. Used by the Ctrl+Alt+D hotkey. */
export function pickRandomShape(): Shape {
  return SHAPES[Math.floor(Math.random() * SHAPES.length)]!
}
