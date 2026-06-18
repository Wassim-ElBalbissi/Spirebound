/**
 * Shape mirrored to the renderer over IPC. Kept in a separate file so the
 * preload can import the types without dragging in the main-process modules.
 */
import type { RoomKind } from './gameState'

export type TierLetter = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

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
  threats: EnemyThreatView[]
  /** End-of-turn HP loss from held Status/Curse cards (e.g. Burn). */
  selfDamage: number
  /** Combat potions available, with their situational value. */
  potions: PotionPlayView[]
  /** Defect orbs in play. */
  orbs: OrbView[]
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

/** A single event option, scored by the heuristic event advisor. */
export interface EventChoiceRankedView {
  index: number
  title: string
  description: string
  score: number
  rationale: string[]
  isLocked: boolean
  wasChosen: boolean
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
  | {
      kind: 'event'
      eventName: string
      choices: EventChoiceRankedView[]
    }
  | { kind: 'combatPlay'; result: CombatPlayResultView }
  | {
      kind: 'shopAdvice'
      items: ShopAdviceItemView[]
      gold: number
      build?: MatchedBuildView | null
    }
  | { kind: 'mapPath'; result: MapPathResultView }
  | {
      /**
       * "Choose a card" surfaces — a Discovery potion (out of combat) or an
       * in-combat discard/exhaust/fetch (`hand_select`). `ranked` is already
       * ordered so #1 is the card to pick for `verb` (e.g. "Discard").
       */
      kind: 'cardSelect'
      title: string
      verb: string
      ranked: CardPickRankedView[]
      canSkip: boolean
    }
  | {
      kind: 'restUpgrade'
      action: RestActionView
      cards: UpgradeRankedView[]
      build?: MatchedBuildView | null
    }
  | { kind: 'none' }
