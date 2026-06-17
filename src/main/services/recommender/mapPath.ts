import type { MapNode, RoomKind, RunState } from '../../types/gameState'

export interface MapPath {
  /** Node ids in order from currentNode (inclusive) to the boss. */
  nodeIds: string[]
  rooms: RoomKind[]
  score: number
  counts: Record<RoomKind, number>
  rationale: string[]
}

export interface MapPathContext {
  hpFraction: number
  gold: number
  act: number
}

const MAX_PATHS_EXPLORED = 5000

export function rankPaths(run: RunState): MapPath[] {
  if (!run.map) return []
  return rankPathsFor(
    run.map.nodes,
    run.map.currentNodeId ?? findStartId(run.map.nodes),
    run.map.bossId,
    {
      hpFraction: run.hp / Math.max(1, run.maxHp),
      gold: run.gold,
      act: run.act
    }
  )
}

export function rankPathsFor(
  nodes: MapNode[],
  startId: string | null,
  bossId: string,
  ctx: MapPathContext
): MapPath[] {
  if (!startId) return []
  const nodeById = new Map<string, MapNode>()
  for (const n of nodes) nodeById.set(n.id, n)
  if (!nodeById.has(startId)) return []

  const paths: string[][] = []
  const path: string[] = []
  let explored = 0

  function dfs(currentId: string): void {
    if (paths.length >= MAX_PATHS_EXPLORED) return
    const node = nodeById.get(currentId)
    if (!node) return
    path.push(currentId)

    const isBossNode = node.room === 'boss'
    if (isBossNode || node.children.length === 0) {
      if (isBossNode) paths.push([...path])
      explored++
      path.pop()
      return
    }
    for (const childId of node.children) {
      dfs(childId)
    }
    path.pop()
  }

  dfs(startId)

  const scored = paths.map((p) => scorePath(p, nodeById, ctx))
  return scored.sort((a, b) => b.score - a.score).slice(0, 3)
}

const W_ELITE_BY_ACT: Record<number, number> = { 1: 6, 2: 3, 3: 1 }
const W_REST = 4
const W_MONST = 2
const W_SHOP = 3
const W_EVENT = 1.5
const W_TREASURE = 2

function scorePath(
  ids: string[],
  nodeById: Map<string, MapNode>,
  ctx: MapPathContext
): MapPath {
  const rooms: RoomKind[] = ids.map((id) => nodeById.get(id)!.room)

  const counts = countRooms(rooms)
  const wElite = W_ELITE_BY_ACT[ctx.act] ?? 1
  const lowHpBoost = 1 - ctx.hpFraction
  const restMult = Math.max(0.2, lowHpBoost)
  const monstMult = Math.max(0.2, 1 - ctx.hpFraction * 0.8)

  let score = 0
  const rationale: string[] = []

  if (counts.elite > 0) {
    const c = wElite * counts.elite
    score += c
    if (ctx.act === 1) rationale.push(`+${c.toFixed(1)} elite (act 1 relic farm)`)
    else rationale.push(`+${c.toFixed(1)} elite`)
  }
  if (counts.rest > 0) {
    const c = W_REST * counts.rest * restMult
    score += c
    rationale.push(`+${c.toFixed(1)} rest (HP ${(ctx.hpFraction * 100) | 0}%)`)
  }
  if (counts.monster > 0) {
    const c = W_MONST * counts.monster * monstMult
    score -= c
    rationale.push(`-${c.toFixed(1)} monster`)
  }
  if (counts.shop > 0) {
    const factor = Math.min(1, ctx.gold / 150)
    const c = W_SHOP * factor * counts.shop
    if (c > 0) {
      score += c
      rationale.push(`+${c.toFixed(1)} shop (${ctx.gold}g)`)
    }
  }
  if (counts.event > 0) {
    const c = W_EVENT * counts.event
    score += c
    rationale.push(`+${c.toFixed(1)} event`)
  }
  if (counts.treasure > 0) {
    const c = W_TREASURE * counts.treasure
    score += c
    rationale.push(`+${c.toFixed(1)} treasure`)
  }

  return { nodeIds: ids, rooms, score, counts, rationale }
}

function countRooms(rooms: RoomKind[]): Record<RoomKind, number> {
  const counts: Record<RoomKind, number> = {
    monster: 0,
    elite: 0,
    event: 0,
    rest: 0,
    shop: 0,
    treasure: 0,
    boss: 0,
    start: 0,
    unknown: 0
  }
  for (const r of rooms) counts[r] = (counts[r] ?? 0) + 1
  return counts
}

function findStartId(nodes: MapNode[]): string | null {
  const start = nodes.find((n) => n.room === 'start')
  return start?.id ?? null
}
