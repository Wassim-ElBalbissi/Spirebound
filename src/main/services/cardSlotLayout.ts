export interface SlotRect {
  /** Center X in display-relative pixels. */
  x: number
  /** Top Y of the card in display-relative pixels. */
  y: number
  width: number
  height: number
}

export interface SlotCalibration {
  /** -10..10 percentage of display height to shift slots vertically. */
  verticalOffsetPct: number
  /** -20..20 percentage to widen / tighten the card row horizontally. */
  horizontalStretchPct: number
}

export const DEFAULT_CALIBRATION: SlotCalibration = {
  verticalOffsetPct: 0,
  horizontalStretchPct: 0
}

export interface AnchorCalibration {
  /** Hand size when the user clicked the leftmost / rightmost card centers. */
  handSize: number
  leftCenter: { x: number; y: number }
  rightCenter: { x: number; y: number }
  display: { width: number; height: number }
}

export interface ModCardPos {
  x: number
  y: number
  w: number
  h: number
}

export interface SlotLayoutInput {
  handSize: number
  displayWidth: number
  displayHeight: number
  calibration?: SlotCalibration
  /** Pixel-accurate anchors from click-to-calibrate. If present, anchors win. */
  anchors?: AnchorCalibration | null
  /**
   * Per-card rects from the SlayOverlay STS2MCP fork. When present and
   * length matches handSize, these override everything else (pixel-perfect).
   * Coordinates are in viewport space; we scale to display space using
   * `modViewport` when needed.
   */
  modPositions?: (ModCardPos | undefined)[]
  modViewport?: { w: number; h: number }
}

const REFERENCE_HEIGHT = 1080
const REFERENCE_CARD_WIDTH = 145
const REFERENCE_CARD_HEIGHT = 230
const REFERENCE_GAP = 8
/** Pixels between the card bottom and the screen bottom at 1080p. */
const REFERENCE_BOTTOM_OFFSET = 30
const MAX_ROW_WIDTH_PCT = 0.55

/**
 * Approximates STS2's hand layout: cards centered horizontally, bottom-anchored
 * at ~Y=83% of display height. Width scales linearly with display height.
 * For large hands the row is constrained to MAX_ROW_WIDTH_PCT of the display
 * width, after which cards begin to overlap (negative gap).
 *
 * Calibration sliders shift Y and stretch the row symmetrically around center.
 *
 * Output coordinates are display-relative (not screen-absolute) — the caller
 * positions the annotation window over the right display and CSS-positions
 * each badge from these rects.
 */
export function estimateCardSlots(input: SlotLayoutInput): SlotRect[] {
  const { handSize, displayWidth, displayHeight } = input
  if (handSize <= 0) return []

  // Mod-provided pixel positions (SlayOverlay STS2MCP fork) — pixel-perfect.
  // Requires every hand card to have a `pos` and a viewport size we can
  // scale against the overlay's display rect.
  if (
    input.modPositions &&
    input.modPositions.length === handSize &&
    input.modPositions.every((p): p is ModCardPos => !!p && p.w > 0 && p.h > 0)
  ) {
    return slotsFromModPositions(
      input.modPositions,
      input.modViewport,
      displayWidth,
      displayHeight
    )
  }

  // Click-calibrated anchors override the heuristic estimator entirely
  // (within ±20% display tolerance — clears if resolution changes drastically).
  if (input.anchors && anchorsValid(input.anchors, displayWidth, displayHeight)) {
    return slotsFromAnchors(input.anchors, handSize)
  }

  const cal = input.calibration ?? DEFAULT_CALIBRATION
  const scale = displayHeight / REFERENCE_HEIGHT
  const cardW = REFERENCE_CARD_WIDTH * scale
  const cardH = REFERENCE_CARD_HEIGHT * scale
  const baseGap = REFERENCE_GAP * scale

  const maxRowWidth = displayWidth * MAX_ROW_WIDTH_PCT
  const idealRowWidth = handSize * cardW + (handSize - 1) * baseGap
  // When the ideal row width fits, use the original gap. Otherwise compress.
  const fitsCleanly = idealRowWidth <= maxRowWidth
  const stretchedRowWidth = fitsCleanly
    ? idealRowWidth
    : Math.max(handSize * cardW * 0.55, maxRowWidth)

  const stretchFactor = 1 + cal.horizontalStretchPct / 100
  const rowWidth = stretchedRowWidth * stretchFactor

  // Gap (possibly negative for crowded hands).
  const gap =
    handSize > 1 ? (rowWidth - handSize * cardW) / (handSize - 1) : 0

  const rowLeft = displayWidth / 2 - rowWidth / 2
  // STS2 anchors the hand near the bottom of the screen, not at a fixed
  // percentage from the top. Compute the card-top Y from a bottom offset so
  // resolutions / taskbars don't throw it off. Slider then shifts up/down.
  const bottomOffset = REFERENCE_BOTTOM_OFFSET * scale
  const yTop =
    displayHeight - cardH - bottomOffset + (cal.verticalOffsetPct / 100) * displayHeight

  const out: SlotRect[] = []
  for (let i = 0; i < handSize; i++) {
    const xLeft = rowLeft + i * (cardW + gap)
    out.push({
      x: xLeft + cardW / 2,
      y: yTop,
      width: cardW,
      height: cardH
    })
  }
  return out
}

function anchorsValid(
  a: AnchorCalibration,
  displayWidth: number,
  displayHeight: number
): boolean {
  const dw = Math.abs(a.display.width - displayWidth) / displayWidth
  const dh = Math.abs(a.display.height - displayHeight) / displayHeight
  return dw < 0.2 && dh < 0.2 && a.handSize >= 1
}

/**
 * Compute slot rects from two click-anchors.
 *
 * For the calibrated hand size: cards spread evenly from leftCenter to
 * rightCenter; Y is the average of the two anchors (corrects for any tilt).
 * For smaller hands: row narrows proportionally around the captured center.
 * For larger hands: row stays at the captured width and cards crowd.
 *
 * Card dimensions are derived from the spacing.
 */
function slotsFromAnchors(
  a: AnchorCalibration,
  handSize: number
): SlotRect[] {
  const refStride =
    a.handSize > 1
      ? (a.rightCenter.x - a.leftCenter.x) / (a.handSize - 1)
      : 0
  const refRowWidth = refStride * (a.handSize - 1)
  const refCenterX = (a.leftCenter.x + a.rightCenter.x) / 2
  const yCenter = (a.leftCenter.y + a.rightCenter.y) / 2

  const cardW = Math.max(80, Math.abs(refStride) * 0.95 || 145)
  const cardH = cardW * 1.4
  const yTop = yCenter - cardH / 2

  let stride: number
  if (handSize === 1) {
    stride = 0
  } else if (handSize <= a.handSize) {
    const targetRowWidth = refRowWidth * ((handSize - 1) / (a.handSize - 1))
    stride = targetRowWidth / (handSize - 1)
  } else {
    stride = refRowWidth / (handSize - 1)
  }

  const rowWidth = stride * (handSize - 1)
  const xLeft = refCenterX - rowWidth / 2

  const out: SlotRect[] = []
  for (let i = 0; i < handSize; i++) {
    out.push({
      x: xLeft + i * stride,
      y: yTop,
      width: cardW,
      height: cardH
    })
  }
  return out
}

/**
 * Convert mod-provided viewport rects to display-relative slot rects.
 *
 * Viewport == display when STS2 renders fullscreen at the overlay's display
 * resolution; we scale linearly otherwise. The mod ships `pos` as the card's
 * top-left + size; SlotRect's `x` is the card center, `y` is the card top.
 */
function slotsFromModPositions(
  positions: ModCardPos[],
  viewport: { w: number; h: number } | undefined,
  displayWidth: number,
  displayHeight: number
): SlotRect[] {
  const sx = viewport && viewport.w > 0 ? displayWidth / viewport.w : 1
  const sy = viewport && viewport.h > 0 ? displayHeight / viewport.h : 1
  return positions.map((p) => {
    const width = p.w * sx
    const height = p.h * sy
    return {
      x: p.x * sx + width / 2,
      y: p.y * sy,
      width,
      height
    }
  })
}
