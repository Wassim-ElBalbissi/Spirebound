import type {
  RawBattle,
  RawCard,
  RawEnemy,
  RawGameState,
  RawIntent,
  RawPower,
  RoomType
} from '../types/rawState'
import { canonicalCharacter } from '../types/rawState'
import type {
  CardInstance,
  CombatState,
  EnemyState,
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
      return { kind: 'rest' }

    case 'shop':
    case 'fake_merchant': {
      const shop = raw.shop ?? raw.fake_merchant?.shop
      if (!shop || shop.error) return { kind: 'unknown' }
      return {
        kind: 'shop',
        cards: (shop.cards ?? []).map((c) => ({
          ...toCard(c),
          price: c.price
        })),
        relics: (shop.relics ?? []).map((r) => ({
          ...toRelic(r),
          price: r.price
        })),
        potions: (shop.potions ?? []).map((p) => ({
          ...toPotion(p),
          price: p.price
        }))
      }
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
    case 'card_select':
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
    viewport: player.viewport
  }
}

function normalizeTurn(turn: string | undefined): 'player' | 'enemy' | 'other' {
  if (turn === 'player') return 'player'
  if (turn === 'enemy') return 'enemy'
  return 'other'
}

function toHandCard(card: RawCard): HandCard {
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
    parsedDamage: parseDamage(card.description),
    parsedBlock: parseBlock(card.description),
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

function parseDamage(description: string): number | null {
  const m = description.match(DAMAGE_RE)
  return m ? Number(m[1]) : null
}

function parseBlock(description: string): number | null {
  const m = description.match(BLOCK_RE)
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
    type: p.type
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
