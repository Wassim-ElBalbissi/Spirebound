/**
 * Raw shape of the STS2MCP mod response from GET /api/v1/singleplayer.
 * Snake_case is preserved verbatim — these are the wire types.
 *
 * Source of truth: docs/raw-full.md in github.com/Gennadiyev/STS2MCP
 *                  and McpMod.StateBuilder.cs.
 */

export type RawStateType =
  | 'menu'
  | 'unknown'
  | 'monster'
  | 'elite'
  | 'boss'
  | 'hand_select'
  | 'rewards'
  | 'card_reward'
  | 'map'
  | 'event'
  | 'rest_site'
  | 'shop'
  | 'fake_merchant'
  | 'treasure'
  | 'card_select'
  | 'bundle_select'
  | 'relic_select'
  | 'crystal_sphere'
  | 'game_over'
  | 'overlay'

export interface RawKeyword {
  name: string
  description: string
}

export interface RawCardPos {
  x: number
  y: number
  w: number
  h: number
}

export interface RawCard {
  index: number
  id: string
  name: string
  type: 'Attack' | 'Skill' | 'Power' | 'Status' | 'Curse'
  cost: string
  star_cost: string | null
  description: string
  target_type: string
  can_play: boolean
  unplayable_reason: string | null
  is_upgraded: boolean
  rarity?: 'Starter' | 'Common' | 'Uncommon' | 'Rare' | 'Special' | 'Curse'
  keywords: RawKeyword[]
  /**
   * Pixel rect of the card on the game's viewport. Emitted by our STS2MCP
   * fork (0.4.0-overlay.1+) on combat hand cards. Absent on stock STS2MCP.
   */
  pos?: RawCardPos
}

/**
 * A card in a draw/discard/exhaust pile. The mod emits a lighter shape than
 * combat `hand` cards — notably **no `id`** and no per-card position — so most
 * fields are optional. Reconstructed-deck code resolves the id from the name.
 */
export interface RawPileCard {
  id?: string
  name: string
  cost?: string
  star_cost?: string | null
  description?: string
  type?: RawCard['type']
  is_upgraded?: boolean
  rarity?: RawCard['rarity']
  keywords?: RawKeyword[]
}

export interface RawRelic {
  id: string
  name: string
  description: string
  counter: number | null
  rarity?: 'Starter' | 'Common' | 'Uncommon' | 'Rare' | 'Boss' | 'Event' | 'Shop'
  keywords: RawKeyword[]
}

export interface RawPotion {
  id: string
  name: string
  description: string
  slot: number
  can_use_in_combat: boolean
  target_type: string
  keywords: RawKeyword[]
}

export interface RawRunInfo {
  act: number
  floor: number
  ascension: number
}

export interface RawRestOption {
  index: number
  id: string
  name: string
  description: string
  is_enabled: boolean
}

export interface RawRestSite {
  options?: RawRestOption[]
}

/** A Defect orb. `passive_val` triggers at end of turn; `evoke_val` on Evoke. */
export interface RawOrb {
  id: string
  name: string
  description: string
  passive_val?: number
  evoke_val?: number
  keywords?: RawKeyword[]
}

export interface RawPlayer {
  character: string
  hp: number
  max_hp: number
  block: number
  gold: number
  energy?: number
  max_energy?: number
  hand?: RawCard[]
  draw_pile_count?: number
  discard_pile_count?: number
  exhaust_pile_count?: number
  /** Full pile contents (Spirebound fork). Lighter shape than `hand` — no ids. */
  draw_pile?: RawPileCard[]
  discard_pile?: RawPileCard[]
  exhaust_pile?: RawPileCard[]
  /** Defect orbs currently channeled. */
  orbs?: RawOrb[]
  orb_slots?: number
  orb_empty_slots?: number
  status: RawPower[]
  relics: RawRelic[]
  potions: RawPotion[]
  max_potion_slots: number
  /**
   * Game viewport rendering rect (w × h). Emitted by the Spirebound STS2MCP
   * fork alongside per-card `pos` so we can scale viewport → display.
   */
  viewport?: { w: number; h: number }
}

export interface RawPower {
  id?: string
  name: string
  amount?: number
  type?: 'Buff' | 'Debuff'
  description?: string
  keywords?: RawKeyword[]
}

export type RawIntentType =
  | 'Attack'
  | 'AttackDebuff'
  | 'AttackDefend'
  | 'AttackBuff'
  | 'Debuff'
  | 'Defend'
  | 'DefendBuff'
  | 'DefendDebuff'
  | 'Buff'
  | 'Unknown'
  | string

export interface RawIntent {
  type: RawIntentType
  label?: string
  title?: string
  description?: string
}

export interface RawEnemy {
  entity_id: string
  combat_id?: number
  name: string
  hp: number
  max_hp: number
  block: number
  status?: RawPower[]
  intents?: RawIntent[]
}

export interface RawBattle {
  round?: number
  turn?: 'player' | 'enemy' | string
  is_play_phase?: boolean
  enemies?: RawEnemy[]
}

export type RoomType =
  | 'Start'
  | 'Monster'
  | 'Elite'
  | 'RestSite'
  | 'Shop'
  | 'Event'
  | 'Treasure'
  | 'Boss'
  | 'FakeMerchant'
  | 'CrystalSphere'

export interface RawMapNode {
  col: number
  row: number
  type: RoomType
  children?: [number, number][]
}

export interface RawNextOption {
  index: number
  col: number
  row: number
  type: RoomType
  leads_to?: RawMapNode[]
}

export interface RawMapState {
  current_position: { col: number; row: number; type: RoomType }
  visited?: RawMapNode[]
  next_options: RawNextOption[]
  nodes: RawMapNode[]
  boss: { col: number; row: number; id: string; name: string }
  bosses?: { col: number; row: number; id: string; name: string }[]
}

export interface RawCardReward {
  cards: RawCard[]
  can_skip: boolean
}

export interface RawEventOption {
  index: number
  title: string
  description: string
  is_locked: boolean
  is_proceed: boolean
  was_chosen: boolean
  relic_name?: string
  relic_description?: string
  keywords: RawKeyword[]
}

export interface RawEventState {
  event_id: string
  event_name: string
  is_ancient?: boolean
  in_dialogue?: boolean
  body?: string
  options: RawEventOption[]
}

/**
 * A "choose a card" sub-screen (e.g. Smith at a rest site). `screen_type`
 * discriminates the action; for `"upgrade"` the `cards` are the full set of
 * upgradeable deck cards.
 */
export interface RawCardSelect {
  screen_type?: string
  prompt?: string
  cards?: RawCard[]
  can_skip?: boolean
}

/**
 * In-combat "choose a card from your hand" sub-screen (`hand_select`): discard,
 * exhaust, put-on-top, etc. The full `battle`/`player` payload rides alongside
 * it, so the pick can be judged against the live combat. `prompt` names the
 * action ("Choose a card to Discard."); `cards` are the eligible candidates.
 */
export interface RawHandSelect {
  mode?: string
  prompt?: string
  cards?: RawCard[]
}

export interface RawRelicSelect {
  prompt: string
  relics: (RawRelic & { index: number })[]
  can_skip: boolean
}

/**
 * A single purchasable in the STS2MCP shop. The mod emits one flat `items`
 * array discriminated by `category`; the id/name/description fields are prefixed
 * per category (card_*, relic_*, potion_*). `card_removal` rows have no payload
 * beyond price.
 */
export interface RawShopItem {
  index: number
  category: 'card' | 'relic' | 'potion' | 'card_removal' | string
  price: number
  is_stocked?: boolean
  can_afford?: boolean
  on_sale?: boolean
  card_id?: string
  card_name?: string
  card_type?: 'Attack' | 'Skill' | 'Power' | 'Status' | 'Curse' | string
  card_cost?: string
  card_star_cost?: string | null
  card_rarity?: string
  card_description?: string
  relic_id?: string
  relic_name?: string
  relic_description?: string
  potion_id?: string
  potion_name?: string
  potion_description?: string
  keywords?: RawKeyword[]
}

export interface RawShop {
  /** STS2MCP's flat stock list, discriminated by `category`. */
  items?: RawShopItem[]
  can_proceed?: boolean
  /** Legacy / alternate shape kept as a defensive fallback. */
  cards?: (RawCard & { price: number })[]
  relics?: (RawRelic & { price: number; index: number })[]
  potions?: (RawPotion & { price: number; index: number })[]
  error?: string
}

export interface RawTreasure {
  relics?: (RawRelic & { index: number })[]
  message?: string
}

export interface RawRewardItem {
  type: 'Gold' | 'Card' | 'Relic' | 'Potion' | 'Key' | 'Stolen'
  description: string
  amount?: number
  index: number
}

export interface RawRewards {
  rewards: RawRewardItem[]
}

export interface RawGameState {
  state_type: RawStateType
  run?: RawRunInfo
  player?: RawPlayer
  card_reward?: RawCardReward
  map?: RawMapState
  event?: RawEventState
  relic_select?: RawRelicSelect
  shop?: RawShop
  fake_merchant?: { shop?: RawShop }
  treasure?: RawTreasure
  rewards?: RawRewards
  rest_site?: RawRestSite
  battle?: RawBattle
  hand_select?: RawHandSelect
  card_select?: RawCardSelect
  bundle_select?: unknown
  crystal_sphere?: unknown
  game_over?: unknown
  overlay?: unknown
}

/**
 * Maps an STS2MCP `player.character` display name to our canonical id.
 * The mod returns display names like "The Ironclad"; the character_id field
 * is only present in menu/lobby contexts. We canonicalize on the display name.
 */
export function canonicalCharacter(
  displayName: string | undefined
): 'ironclad' | 'silent' | 'defect' | 'regent' | 'necrobinder' | null {
  if (!displayName) return null
  const n = displayName.toLowerCase().replace(/^the\s+/, '').trim()
  switch (n) {
    case 'ironclad':
      return 'ironclad'
    case 'silent':
      return 'silent'
    case 'defect':
      return 'defect'
    case 'regent':
      return 'regent'
    case 'necrobinder':
      return 'necrobinder'
    default:
      return null
  }
}
