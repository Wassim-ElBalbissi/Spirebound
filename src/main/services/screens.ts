import type {
  RawBattle,
  RawCard,
  RawEnemy,
  RawGameState,
  RawIntent,
  RawOrb,
  RawPileCard,
  RawPlayer,
  RawPotion,
  RawPower,
  RawShop,
  RoomType
} from '../types/rawState'
import { canonicalCharacter } from '../types/rawState'
import { deriveArchetypeTags } from './tierData/deriveArchetypeTags'
import type {
  CardInstance,
  CombatPotion,
  CombatState,
  EnemyState,
  OrbInstance,
  EventChoice,
  HandCard,
  MapNode,
  NormalizedState,
  PotionInstance,
  PowerInstance,
  RelicInstance,
  RoomKind,
  Screen
} from '../types/gameState'

/**
 * Pure function: raw STS2MCP payload → normalized state used by the recommenders.
 *
 * Combat screens are mapped to {kind: "combat"} so the renderer suppresses
 * advice — this overlay deliberately does not coach in-combat play.
 *
 * Transient placeholders like `treasure` with only a `message` field map to
 * `unknown` and the poll loop will pick up the resolved payload on the next tick.
 */
export function normalize(raw: RawGameState, ts = Date.now()): NormalizedState {
  const screen = classifyScreen(raw)

  if (raw.state_type === 'menu' || !raw.run || !raw.player) {
    return { run: null, screen, ts }
  }

  const character = canonicalCharacter(raw.player.character)
  if (!character) {
    return { run: null, screen: { kind: 'unknown' }, ts }
  }

  return {
    run: {
      character,
      ascension: raw.run.ascension,
      act: raw.run.act,
      floor: raw.run.floor,
      hp: raw.player.hp,
      maxHp: raw.player.max_hp,
      gold: raw.player.gold,
      relics: raw.player.relics.map(toRelic),
      potions: raw.player.potions.map(toPotion),
      map: normalizeMap(raw),
      deckKnown: false
    },
    screen,
    ts
  }
}

export function classifyScreen(raw: RawGameState): Screen {
  switch (raw.state_type) {
    case 'card_reward':
      return raw.card_reward
        ? {
            kind: 'cardReward',
            offers: raw.card_reward.cards.map(toCard),
            canSkip: raw.card_reward.can_skip
          }
        : { kind: 'unknown' }

    case 'relic_select':
      return raw.relic_select
        ? {
            kind: 'relicReward',
            offers: raw.relic_select.relics.map(toRelic),
            canSkip: raw.relic_select.can_skip
          }
        : { kind: 'unknown' }

    case 'event':
      return raw.event
        ? {
            kind: 'event',
            eventId: raw.event.event_id,
            eventName: raw.event.event_name,
            choices: raw.event.options.map(toEventChoice)
          }
        : { kind: 'unknown' }

    case 'map':
      return { kind: 'map' }

    case 'monster':
    case 'elite':
    case 'boss':
    case 'hand_select': {
      const combat = buildCombatState(raw)
      if (!combat) return { kind: 'unknown' }
      return { kind: 'combat', combat }
    }

    case 'rest_site':
      return {
        kind: 'rest',
        options: (raw.rest_site?.options ?? []).map((o) => ({
          id: o.id,
          name: o.name,
          description: o.description,
          enabled: o.is_enabled
        }))
      }

    case 'card_select':
      // The Smith screen ("upgrade") hands us the full upgradeable deck.
      if (raw.card_select?.screen_type === 'upgrade' && raw.card_select.cards) {
        return {
          kind: 'upgradeSelect',
          cards: raw.card_select.cards.map(toCard)
        }
      }
      return { kind: 'unknown' }

    case 'shop':
    case 'fake_merchant': {
      const shop = raw.shop ?? raw.fake_merchant?.shop
      if (!shop || shop.error) return { kind: 'unknown' }
      return { kind: 'shop', ...normalizeShopStock(shop) }
    }

    case 'rewards':
      return { kind: 'rewards' }

    case 'menu':
      return { kind: 'menu' }

    case 'treasure':
      // Transient `{ "message": "Opening chest..." }` resolves to a relic offer
      // on the next tick. Surface that as the relic reward when present.
      if (raw.treasure?.relics?.length) {
        return {
          kind: 'relicReward',
          offers: raw.treasure.relics.map(toRelic),
          canSkip: true
        }
      }
      return { kind: 'unknown' }

    case 'unknown':
    case 'overlay':
    case 'bundle_select':
    case 'crystal_sphere':
    case 'game_over':
    default:
      return { kind: 'unknown' }
  }
}

function toCard(c: {
  id: string
  name: string
  is_upgraded: boolean
  rarity?: string
  type?: string
  description?: string
}): CardInstance {
  return {
    id: c.id,
    name: c.name,
    upgraded: c.is_upgraded,
    rarity: c.rarity,
    type: c.type,
    description: c.description
  }
}

function toRelic(r: {
  id: string
  name: string
  description?: string
  counter?: number | null
}): RelicInstance {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    counter: r.counter
  }
}

function toPotion(p: {
  id: string
  name: string
  description?: string
}): PotionInstance {
  return { id: p.id, name: p.name, description: p.description }
}

/**
 * Normalize a STS2MCP shop into priced card / relic / potion lists.
 *
 * The mod ships a single flat `items` array discriminated by `category`
 * (card / relic / potion / card_removal) with per-category prefixed fields. We
 * skip out-of-stock rows (already purchased) and `card_removal` (no advice slot
 * yet). A legacy `cards`/`relics`/`potions` shape is folded in defensively.
 */
function normalizeShopStock(shop: RawShop): {
  cards: (CardInstance & { price: number })[]
  relics: (RelicInstance & { price: number })[]
  potions: (PotionInstance & { price: number })[]
} {
  const cards: (CardInstance & { price: number })[] = []
  const relics: (RelicInstance & { price: number })[] = []
  const potions: (PotionInstance & { price: number })[] = []

  for (const item of shop.items ?? []) {
    if (item.is_stocked === false) continue
    const price = item.price ?? 0
    if (item.category === 'card' && item.card_id) {
      cards.push({
        id: item.card_id,
        name: item.card_name ?? item.card_id,
        upgraded: false,
        rarity: item.card_rarity,
        type: item.card_type,
        description: item.card_description,
        price
      })
    } else if (item.category === 'relic' && item.relic_id) {
      relics.push({
        id: item.relic_id,
        name: item.relic_name ?? item.relic_id,
        description: item.relic_description,
        counter: null,
        price
      })
    } else if (item.category === 'potion' && item.potion_id) {
      potions.push({
        id: item.potion_id,
        name: item.potion_name ?? item.potion_id,
        description: item.potion_description,
        price
      })
    }
  }

  // Defensive fallback for any build that exposes separate arrays.
  for (const c of shop.cards ?? []) cards.push({ ...toCard(c), price: c.price })
  for (const r of shop.relics ?? []) relics.push({ ...toRelic(r), price: r.price })
  for (const p of shop.potions ?? []) potions.push({ ...toPotion(p), price: p.price })

  return { cards, relics, potions }
}

function toEventChoice(o: {
  index: number
  title: string
  description: string
  is_locked: boolean
  is_proceed: boolean
  was_chosen: boolean
}): EventChoice {
  return {
    index: o.index,
    title: o.title,
    description: o.description,
    isLocked: o.is_locked,
    isProceed: o.is_proceed,
    wasChosen: o.was_chosen
  }
}

const ROOM_KIND: Record<RoomType, RoomKind> = {
  Start: 'start',
  Monster: 'monster',
  Elite: 'elite',
  RestSite: 'rest',
  Shop: 'shop',
  Event: 'event',
  Treasure: 'treasure',
  Boss: 'boss',
  FakeMerchant: 'shop',
  CrystalSphere: 'event'
}

export function nodeId(col: number, row: number): string {
  return `${col},${row}`
}

function buildCombatState(raw: RawGameState): CombatState | null {
  const battle: RawBattle | undefined = raw.battle
  const player = raw.player
  if (!battle || !player) return null

  return {
    round: battle.round ?? 0,
    turn: normalizeTurn(battle.turn),
    energy: player.energy ?? 0,
    maxEnergy: player.max_energy ?? 0,
    block: player.block,
    hp: player.hp,
    maxHp: player.max_hp,
    hand: (player.hand ?? []).map(toHandCard),
    enemies: (battle.enemies ?? []).map(toEnemyState),
    playerStatus: (player.status ?? []).map(toPower),
    potions: (player.potions ?? [])
      .filter((p) => p.can_use_in_combat)
      .map(toCombatPotion),
    orbs: (player.orbs ?? []).map(toOrb),
    deck: buildCombatDeck(player),
    viewport: player.viewport
  }
}

/**
 * Reconstruct the full deck from the combat piles (hand + draw + discard +
 * exhaust) so deck-aware advice survives outside combat even when the
 * compendium endpoint is unavailable. Pile cards carry no id, so each card is
 * tagged from its description here (the pipeline resolves ids against the
 * bundle later). Returns an empty array when the mod emits no pile contents.
 */
export function buildCombatDeck(player: RawPlayer): CardInstance[] {
  const all: (RawCard | RawPileCard)[] = [
    ...(player.hand ?? []),
    ...(player.draw_pile ?? []),
    ...(player.discard_pile ?? []),
    ...(player.exhaust_pile ?? [])
  ]
  return all.map(toDeckCard)
}

function toDeckCard(c: RawCard | RawPileCard): CardInstance {
  const description = c.description ?? ''
  const keywords = (c.keywords ?? []).map((k) => k.name)
  return {
    // Hand cards carry a real id; pile cards don't — keep the name as a
    // placeholder id so the pipeline can resolve it against the bundle.
    id: c.id && c.id.length > 0 ? c.id : c.name,
    name: c.name,
    upgraded: c.is_upgraded ?? false,
    type: c.type,
    description,
    tags: deriveArchetypeTags({ description, keywords, type: c.type })
  }
}

function toOrb(o: RawOrb): OrbInstance {
  return {
    id: o.id,
    name: o.name,
    description: o.description,
    passiveValue: o.passive_val ?? 0,
    evokeValue: o.evoke_val ?? 0,
    passiveKind: classifyOrbPassive(o.description)
  }
}

function classifyOrbPassive(description: string): OrbInstance['passiveKind'] {
  // Only look at the passive portion (before the "Evoke:" sentence).
  const passive = description.split(/evoke/i)[0] ?? description
  if (/\d+\s*block/i.test(passive)) return 'block'
  if (/\d+\s*damage/i.test(passive)) return 'damage'
  if (/energy/i.test(passive)) return 'energy'
  return 'other'
}

function toCombatPotion(p: RawPotion): CombatPotion {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    targetType: p.target_type,
    parsedDamage: parseDamage(p.description),
    parsedBlock: parseBlock(p.description)
  }
}

function normalizeTurn(turn: string | undefined): 'player' | 'enemy' | 'other' {
  if (turn === 'player') return 'player'
  if (turn === 'enemy') return 'enemy'
  return 'other'
}

function toHandCard(card: RawCard): HandCard {
  // Base numbers are parsed from the *unconditional* text only; conditional
  // riders ("If X, deal/gain/draw …") are evaluated against live state by the
  // combat scorer, so stripping them here prevents double-counting.
  const base = stripConditionals(card.description)
  return {
    index: card.index,
    id: card.id,
    name: card.name,
    type: card.type,
    cost: parseCost(card.cost),
    description: card.description,
    upgraded: card.is_upgraded,
    canPlay: card.can_play,
    unplayableReason: card.unplayable_reason,
    parsedDamage: parseDamage(base),
    parsedHits: parseHits(base),
    parsedDraw: parseDraw(base) ?? undefined,
    parsedBlock: parseBlock(base),
    parsedSelfDamage: parseSelfDamage(card.description),
    keywords: (card.keywords ?? []).map((k) => k.name),
    pos: card.pos
  }
}

function parseCost(cost: string): number | 'X' | null {
  if (cost === 'X') return 'X'
  const n = Number(cost)
  if (Number.isFinite(n)) return n
  return null
}

const DAMAGE_RE = /Deal\s+(\d+)\s+damage/i
const BLOCK_RE = /Gain\s+(\d+)\s+Block/i
// Multi-hit, within the same clause as the damage: "Deal 5 damage 3 times" or
// "Deal 5 damage to ALL enemies twice". `[^.]*?` keeps us inside the sentence.
const HITS_RE = /Deal\s+\d+\s+damage[^.]*?\b(\d+)\s+times/i
const TWICE_RE = /Deal\s+\d+\s+damage[^.]*?\btwice\b/i
// Card draw: "Draw 1 card", "Draw 3 cards", or "Draw a card".
const DRAW_RE = /Draw\s+(?:(\d+)|a)\s+cards?/i
// Self-harm: "Lose 6 HP", "lose 3 Health", or "take 2 damage" (e.g. Burn).
const SELF_DAMAGE_RE = /(?:Lose|Take)\s+(\d+)\s+(?:HP|Health|damage)/i

function parseDamage(description: string): number | null {
  const m = description.match(DAMAGE_RE)
  return m ? Number(m[1]) : null
}

function parseHits(description: string): number {
  const m = description.match(HITS_RE)
  if (m) return Number(m[1])
  if (TWICE_RE.test(description)) return 2
  return 1
}

function parseDraw(description: string): number | null {
  const m = description.match(DRAW_RE)
  if (!m) return null
  return m[1] ? Number(m[1]) : 1
}

// A conditional clause: "If <condition>, <effect>" up to the sentence end.
// Stripped before base parsing so a conditional effect isn't read as guaranteed.
const CONDITIONAL_CLAUSE_RE = /\bIf\b[^.]*?,\s*[^.]*?(?=\.|$)/gi

/** Remove "If …, …" clauses so base parsers only see unconditional effects. */
export function stripConditionals(description: string): string {
  return description.replace(CONDITIONAL_CLAUSE_RE, ' ')
}

function parseBlock(description: string): number | null {
  const m = description.match(BLOCK_RE)
  return m ? Number(m[1]) : null
}

function parseSelfDamage(description: string): number | null {
  const m = description.match(SELF_DAMAGE_RE)
  return m ? Number(m[1]) : null
}

function toEnemyState(e: RawEnemy): EnemyState {
  const intent = (e.intents ?? [])[0] ?? null
  return {
    entityId: e.entity_id,
    name: e.name,
    hp: e.hp,
    maxHp: e.max_hp,
    block: e.block,
    status: (e.status ?? []).map(toPower),
    intent: intent ? toIntent(intent) : null
  }
}

function toIntent(i: RawIntent): EnemyState['intent'] {
  return {
    type: i.type,
    label: i.label,
    title: i.title,
    description: i.description
  }
}

function toPower(p: RawPower): PowerInstance {
  return {
    name: p.name,
    amount: p.amount,
    type: p.type,
    description: p.description
  }
}

function normalizeMap(raw: RawGameState): NormalizedState['run'] extends infer R
  ? R extends { map: infer M }
    ? M
    : never
  : never {
  if (!raw.map) return null as never
  const m = raw.map

  const nodes: MapNode[] = m.nodes.map((n) => ({
    id: nodeId(n.col, n.row),
    col: n.col,
    row: n.row,
    room: ROOM_KIND[n.type],
    children: (n.children ?? []).map(([c, r]) => nodeId(c, r))
  }))

  return {
    nodes,
    currentNodeId: m.current_position
      ? nodeId(m.current_position.col, m.current_position.row)
      : null,
    nextOptionIds: m.next_options.map((o) => nodeId(o.col, o.row)),
    bossId: m.boss.id,
    bossName: m.boss.name
  } as never
}
