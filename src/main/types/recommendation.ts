/**
 * Shape mirrored to the renderer over IPC. Kept in a separate file so the
 * preload can import the types without dragging in the main-process modules.
 */
import type { EventChoice } from './gameState'

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
   * Pixel rect from the Spirebound STS2MCP fork (viewport coordinates).
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

export interface EnemyThreatView {
  entityId: string
  name: string
  intentType: string | null
  rawIntent: number | null
  adjusted: number | null
  applied: string[]
}

export interface PotionPlayView {
  id: string
  name: string
  description: string
  lethal: boolean
  coversIncoming: boolean
  advice: 'use' | 'consider' | 'hold'
  rationale: string[]
}

export interface CombatPlayResultView {
  ranked: CombatPlayRankedView[]
  incomingDamage: number
  blockNeeded: number
  notes: string[]
  hand: CombatHandAnnotation[]
  threats: EnemyThreatView[]
  /** End-of-turn HP loss from held Status/Curse cards (e.g. Burn). */
  selfDamage: number
  /** Combat potions available, with their situational value. */
  potions: PotionPlayView[]
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
  /** The build this card is key to, if any — for deep-linking to the Hub. */
  buildId?: string
  buildName?: string
}

export interface RelicPickRankedView {
  offerIndex: number | null
  id: string
  name: string
  score: number
  rationale: string[]
  /** The build this relic is key to, if any — for deep-linking to the Hub. */
  buildId?: string
  buildName?: string
}

export interface ShopAdviceItemView {
  kind: 'card' | 'relic' | 'potion'
  id: string
  name: string
  price: number
  /** Intrinsic quality (reuses the card/relic scorers; ~0..120). */
  intrinsicScore: number
  /** intrinsicScore / price — how much quality per gold. */
  valuePerGold: number
  affordable: boolean
  /** Not affordable now, but high-value and within reach if you save. */
  saveUp: boolean
  rationale: string[]
  buildId?: string
  buildName?: string
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
  | { kind: 'event'; eventName: string; choices: EventChoice[] }
  | { kind: 'combatPlay'; result: CombatPlayResultView }
  | { kind: 'shopAdvice'; items: ShopAdviceItemView[]; gold: number }
  | { kind: 'none' }
