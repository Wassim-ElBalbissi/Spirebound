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

export interface OrbView {
  id: string
  name: string
  description: string
  passiveValue: number
  evokeValue: number
  passiveKind: 'damage' | 'block' | 'energy' | 'other'
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
  /** Defect orbs in play. */
  orbs: OrbView[]
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

/** The curated build the current run resembles, surfaced on the advice panel. */
export interface MatchedBuildView {
  id: string
  name: string
  /** Archetype tags that define the build (e.g. orb-gen, focus, frost). */
  tags: string[]
  /** 0..1 confidence the run is committed to this build. */
  confidence: number
}

/** The headline Rest-vs-Smith call at a campfire, surfaced on the panel. */
export interface RestActionView {
  recommended: 'rest' | 'smith'
  hp: number
  maxHp: number
  healAmount: number
  effectiveHeal: number
  reason: string
  canRest: boolean
  canSmith: boolean
}

/** A card ranked by how worthwhile upgrading it is at a rest site. */
export interface UpgradeRankedView {
  id: string
  name: string
  score: number
  rationale: string[]
  /** A key card of the matched build. */
  buildKey: boolean
  /** Number of copies of this card in the deck. */
  copies: number
  tier?: TierLetter | null
  imageUrl?: string
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

export interface MapStepView {
  id: string
  room: RoomKind
  col: number
  row: number
  /** Direction relative to the previous node — which same-type node to pick. */
  dir: 'left' | 'up' | 'right'
}

export interface MapPathResultView {
  /** Ordered nodes from the immediate next move up to the top of the map. */
  steps: MapStepView[]
  /** Room kind / id of the immediate next move. */
  nextRoom: RoomKind | null
  nextId: string | null
  rationale: string[]
}

export type RecommendationView =
  | {
      kind: 'cardPick'
      ranked: CardPickRankedView[]
      canSkip: boolean
      /** The build the run resembles, when detected. */
      build?: MatchedBuildView | null
    }
  | {
      kind: 'relicPick'
      ranked: RelicPickRankedView[]
      canSkip: boolean
      build?: MatchedBuildView | null
    }
  | { kind: 'event'; eventName: string; choices: EventChoice[] }
  | { kind: 'combatPlay'; result: CombatPlayResultView }
  | {
      kind: 'shopAdvice'
      items: ShopAdviceItemView[]
      gold: number
      build?: MatchedBuildView | null
    }
  | { kind: 'mapPath'; result: MapPathResultView }
  | {
      kind: 'restUpgrade'
      action: RestActionView
      cards: UpgradeRankedView[]
      build?: MatchedBuildView | null
    }
  | { kind: 'none' }
