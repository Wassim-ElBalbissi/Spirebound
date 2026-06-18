/**
 * Normalized game state used inside the overlay (main + renderer).
 *
 * This is intentionally simpler than the raw STS2MCP shape (see rawState.ts) —
 * it strips combat detail and collapses the 20+ raw state_type values down to
 * the 9 screens the overlay reasons about.
 */

export type Character =
  | 'ironclad'
  | 'silent'
  | 'defect'
  | 'regent'
  | 'necrobinder'

export interface CardInstance {
  id: string
  name: string
  upgraded: boolean
  rarity?: string
  type?: string
  description?: string
  /**
   * Archetype/mechanic tags (e.g. orb-gen, lightning, poison). Set when the
   * card is reconstructed from the live combat deck, where the tier-data id may
   * be unresolved — lets synergy/build detection read tags off the card itself.
   * Falls back to the bundle's tags when absent.
   */
  tags?: string[]
}

export interface RelicInstance {
  id: string
  name: string
  description?: string
  counter?: number | null
}

export interface PotionInstance {
  id: string
  name: string
  description?: string
}

export type RoomKind =
  | 'monster'
  | 'elite'
  | 'event'
  | 'rest'
  | 'shop'
  | 'treasure'
  | 'boss'
  | 'start'
  | 'unknown'

export interface MapNode {
  /** col-row composite key; the mod's map graph has no separate id. */
  id: string
  col: number
  row: number
  room: RoomKind
  children: string[]
}

export interface RunState {
  character: Character
  ascension: number
  act: number
  floor: number
  hp: number
  maxHp: number
  gold: number
  relics: RelicInstance[]
  potions: PotionInstance[]
  /** Map graph is only present when in a run with a known map. */
  map: {
    nodes: MapNode[]
    currentNodeId: string | null
    nextOptionIds: string[]
    bossId: string
    bossName: string
  } | null
  /**
   * The deck is only available on this endpoint during combat
   * (split across hand/draw/discard/exhaust piles).
   * For non-combat decisions we read it from the compendium snapshot.
   */
  deckKnown: boolean
}

export interface EventChoice {
  index: number
  title: string
  description: string
  isLocked: boolean
  isProceed: boolean
  wasChosen: boolean
}

/** An action offered at a rest site (Rest/heal, Smith/upgrade, Dig, …). */
export interface RestOption {
  id: string
  name: string
  description: string
  enabled: boolean
}

export interface PowerInstance {
  name: string
  amount?: number
  type?: 'Buff' | 'Debuff'
  description?: string
}

export interface EnemyState {
  entityId: string
  name: string
  hp: number
  maxHp: number
  block: number
  status: PowerInstance[]
  intent: {
    type: string
    label?: string
    title?: string
    description?: string
  } | null
}

export interface CardPos {
  x: number
  y: number
  w: number
  h: number
}

export interface HandCard {
  index: number
  id: string
  name: string
  type: 'Attack' | 'Skill' | 'Power' | 'Status' | 'Curse'
  /** Numeric cost or "X" for X-cost cards. null when star_cost applies. */
  cost: number | 'X' | null
  description: string
  upgraded: boolean
  canPlay: boolean
  unplayableReason: string | null
  /** Parsed from description; null when not an attack or unparseable. */
  parsedDamage: number | null
  /**
   * Hit count for a multi-hit attack ("Deal X damage 3 times" / "twice").
   * Absent or 1 for single-hit cards. Strength/Vigor apply per hit.
   */
  parsedHits?: number
  /** Cards drawn by this card ("Draw N cards"); absent when it draws none. */
  parsedDraw?: number
  /** Parsed from description. */
  parsedBlock: number | null
  /**
   * HP this card costs you — either to play (e.g. "Lose 6 HP") or, for an
   * unplayable Status/Curse like Burn, at end of turn ("take 2 damage").
   * null when the card doesn't harm you.
   */
  parsedSelfDamage: number | null
  /** Card keyword names (e.g. "Retain", "Evoke", "Channel", "Exhaust"). */
  keywords: string[]
  /**
   * Pixel rect of this card on the game viewport. Present only when the
   * Spirebound STS2MCP fork is installed; absent on stock STS2MCP.
   */
  pos?: CardPos
}

/** A Defect orb, with its passive effect classified for the combat math. */
export interface OrbInstance {
  id: string
  name: string
  description: string
  /** End-of-turn passive trigger value. */
  passiveValue: number
  /** Value released when the orb is evoked. */
  evokeValue: number
  /** What the passive does, parsed from the description. */
  passiveKind: 'damage' | 'block' | 'energy' | 'other'
}

/** A potion usable during combat, with its damage/block parsed from text. */
export interface CombatPotion {
  id: string
  name: string
  description: string
  targetType: string
  /** Parsed from description (e.g. Fire Potion). null when not a damage potion. */
  parsedDamage: number | null
  /** Parsed from description (e.g. Block Potion). */
  parsedBlock: number | null
}

export interface CombatState {
  round: number
  turn: 'player' | 'enemy' | 'other'
  energy: number
  maxEnergy: number
  block: number
  hp: number
  maxHp: number
  hand: HandCard[]
  enemies: EnemyState[]
  playerStatus: PowerInstance[]
  /** Combat-usable potions in your belt. */
  potions: CombatPotion[]
  /** Defect orbs currently channeled (empty for other characters). */
  orbs: OrbInstance[]
  /**
   * Full deck reconstructed from hand + draw/discard/exhaust piles, tagged for
   * archetype detection. Present only when the mod emits pile contents; the
   * pipeline uses it to keep deck-aware advice working on the following
   * non-combat screens. Card ids may be unresolved (the pipeline resolves them).
   */
  deck?: CardInstance[]
  /** Game viewport size. Present when mod-provided positions are. */
  viewport?: { w: number; h: number }
}

export type Screen =
  | { kind: 'cardReward'; offers: CardInstance[]; canSkip: boolean }
  | { kind: 'relicReward'; offers: RelicInstance[]; canSkip: boolean }
  | { kind: 'event'; eventId: string; eventName: string; choices: EventChoice[] }
  | { kind: 'map' }
  | { kind: 'combat'; combat: CombatState }
  | { kind: 'rest'; options: RestOption[] }
  | { kind: 'upgradeSelect'; cards: CardInstance[] }
  | {
      kind: 'shop'
      cards: (CardInstance & { price: number })[]
      relics: (RelicInstance & { price: number })[]
      potions: (PotionInstance & { price: number })[]
    }
  | { kind: 'rewards' }
  | { kind: 'menu' }
  | { kind: 'unknown' }

export type ScreenKind = Screen['kind']

export interface NormalizedState {
  modVersion?: string
  run: RunState | null
  screen: Screen
  ts: number
}

export interface McpHealth {
  ok: boolean
  version?: string
  error?: string
  lastOkAt?: number
}

/** High-level presence status surfaced in the Hub app. */
export interface GameStatus {
  /** Slay the Spire 2 is running (game window detected or mod connected). */
  gameRunning: boolean
  /** The STS2MCP mod is responding. */
  mcpConnected: boolean
  modVersion?: string
}
