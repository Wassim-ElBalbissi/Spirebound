/**
 * Shape mirrored to the renderer over IPC. Kept in a separate file so the
 * preload can import the types without dragging in the main-process modules.
 */
import type { EventChoice, RoomKind } from './gameState'

export type TierLetter = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

export interface CombatHandAnnotation {
  handIndex: number
  rank: number
  tier: TierLetter | null
  score: number
  isLethal: boolean
  name: string
  cost: number | 'X' | null
  /**
   * Pixel rect from the SlayOverlay STS2MCP fork (viewport coordinates).
   * Absent on stock STS2MCP.
   */
  pos?: { x: number; y: number; w: number; h: number }
}

export interface CombatPlayRankedView {
  index: number
  id: string
  name: string
  cost: number | 'X' | null
  score: number
  targetEntityId: string | null
  rationale: string[]
  /** Card art + tier from the bundle, for the in-panel hand view. */
  imageUrl?: string
  tier?: TierLetter | null
  starCost?: number
}

export interface CombatPlayResultView {
  ranked: CombatPlayRankedView[]
  incomingDamage: number
  blockNeeded: number
  notes: string[]
  hand: CombatHandAnnotation[]
}

export interface AnnotationSlotRect {
  x: number
  y: number
  width: number
  height: number
}

export type CalibrationSource = 'mod' | 'manual' | 'window' | 'heuristic'

export interface AnnotationPayload {
  visible: boolean
  display: { width: number; height: number }
  slots: AnnotationSlotRect[]
  annotations: CombatHandAnnotation[]
  showCalibrationGrid: boolean
  /** Where the slot rects came from, surfaced to the Settings status pill. */
  calibrationSource: CalibrationSource
}

export interface CalibrationStatePayload {
  active: boolean
  /** 1 = clicking leftmost, 2 = clicking rightmost. */
  step: 0 | 1 | 2
  /** Hand size we expect the user to calibrate against (frozen on start). */
  handSize: number
  /** Click captured for step 1, if any. */
  leftCard?: { x: number; y: number }
}

export interface CardPickRankedView {
  offerIndex: number | null
  id: string
  name: string
  score: number
  rationale: string[]
}

export interface RelicPickRankedView {
  offerIndex: number | null
  id: string
  name: string
  score: number
  rationale: string[]
}

export interface MapPathView {
  nodeIds: string[]
  rooms: RoomKind[]
  score: number
  counts: Record<RoomKind, number>
  rationale: string[]
}

export type RecommendationView =
  | {
      kind: 'cardPick'
      ranked: CardPickRankedView[]
      canSkip: boolean
    }
  | {
      kind: 'relicPick'
      ranked: RelicPickRankedView[]
      canSkip: boolean
    }
  | { kind: 'mapPath'; paths: MapPathView[] }
  | { kind: 'event'; eventName: string; choices: EventChoice[] }
  | { kind: 'combatPlay'; result: CombatPlayResultView }
  | { kind: 'none' }
