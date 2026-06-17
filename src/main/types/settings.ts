export interface CalibrationAnchors {
  /** Hand size when the user calibrated. Other hand sizes are interpolated. */
  handSize: number
  /** Center pixel of the leftmost card. */
  leftCard: { x: number; y: number }
  /** Center pixel of the rightmost card. */
  rightCard: { x: number; y: number }
  /** Display dimensions when calibration was captured. */
  display: { width: number; height: number }
  /** When calibration was captured (epoch ms). */
  capturedAt: number
}

export interface UserSettings {
  /** Multiplier applied to root font size. 0.75–1.5. */
  uiScale: number
  /** Card background opacity. 0.4–1.0. */
  opacity: number
  /** When true, paint per-card badges over the in-game hand during combat. */
  showPerCardBadges: boolean
  /** -25..25 percentage of display height to shift card-slot estimates up/down. */
  verticalOffsetPct: number
  /** -30..30 percentage to widen / tighten the estimated card row. */
  horizontalStretchPct: number
  /** Render reference lines + dashed slot rectangles for calibration. */
  showCalibrationGrid: boolean
  /** Pixel-accurate anchors from the click-to-calibrate flow. */
  calibration: CalibrationAnchors | null
}

export const DEFAULT_SETTINGS: UserSettings = {
  uiScale: 1.0,
  opacity: 0.85,
  showPerCardBadges: false,
  verticalOffsetPct: 0,
  horizontalStretchPct: 0,
  showCalibrationGrid: false,
  calibration: null
}
