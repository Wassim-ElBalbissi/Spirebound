import type { RoomKind, RunState } from '../../types/gameState'

type MapData = NonNullable<RunState['map']>

/** Direction of a step relative to the node you step from (you always climb). */
export type StepDir = 'left' | 'up' | 'right'

export interface MapStep {
  id: string
  room: RoomKind
  col: number
  row: number
  /** Where this node sits relative to the previous one — disambiguates which
   * same-type node to pick (e.g. the upper-left Treasure vs the upper-right). */
  dir: StepDir
}

export interface MapPathResult {
  /** Ordered nodes from the immediate next move up to the top of the map. */
  steps: MapStep[]
  /** Room kind / id of the immediate next move (steps[0]), or null. */
  nextRoom: RoomKind | null
  nextId: string | null
  rationale: string[]
}

export interface MapPathContext {
  hp: number
  maxHp: number
}

/**
 * Suggest the most valuable legal route up the act map.
 *
 * The map is a DAG (rows strictly increase as you climb), so each node's best
 * achievable value is `value(node) + max(best(child))`. We score node *types*
 * with Slay-the-Spire heuristics — favour Rests when hurt, value Elites only
 * when healthy (relic vs HP risk), grab Treasure/Merchant — then walk the
 * argmax children from the current position to reconstruct the optimal path.
 *
 * You can only move along edges from your current node, so the first step is
 * always one of the current node's children (the "next options").
 */
export function rankMapPath(
  map: MapData,
  ctx: MapPathContext
): MapPathResult | null {
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  if (byId.size === 0) return null

  const hpFrac = ctx.maxHp > 0 ? ctx.hp / ctx.maxHp : 1

  const memo = new Map<string, number>()
  const best = (id: string): number => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    const node = byId.get(id)
    if (!node) return 0
    // Seed before recursing so a malformed cyclic graph can't loop forever.
    memo.set(id, 0)
    let bestChild = 0
    for (const childId of node.children) {
      const v = best(childId)
      if (v > bestChild) bestChild = v
    }
    const total = nodeValue(node.room, hpFrac) + bestChild
    memo.set(id, total)
    return total
  }

  // First legal steps: the current node's children, or the entry options at the
  // start of an act (before stepping onto the first node).
  const current = map.currentNodeId ? byId.get(map.currentNodeId) : undefined
  const firstCandidates = (
    current ? current.children : map.nextOptionIds
  ).filter((id) => byId.has(id))
  if (firstCandidates.length === 0) return null

  const steps: MapStep[] = []
  const guard = new Set<string>()
  let cursor: string | undefined = pickBest(firstCandidates, best)
  // Step 0's direction is relative to the node you're standing on.
  let prevCol = current?.col
  while (cursor && byId.has(cursor) && !guard.has(cursor)) {
    guard.add(cursor)
    const node = byId.get(cursor)!
    const dir: StepDir =
      prevCol === undefined || node.col === prevCol
        ? 'up'
        : node.col < prevCol
          ? 'left'
          : 'right'
    steps.push({ id: node.id, room: node.room, col: node.col, row: node.row, dir })
    prevCol = node.col
    const children = node.children.filter((id) => byId.has(id))
    if (children.length === 0) break
    cursor = pickBest(children, best)
  }

  return {
    steps,
    nextRoom: steps[0]?.room ?? null,
    nextId: steps[0]?.id ?? null,
    rationale: buildRationale(steps, hpFrac, ctx)
  }
}

function pickBest(ids: string[], best: (id: string) => number): string | undefined {
  let bestId: string | undefined
  let bestVal = -Infinity
  for (const id of ids) {
    const v = best(id)
    if (v > bestVal) {
      bestVal = v
      bestId = id
    }
  }
  return bestId
}

/** Heuristic worth of stepping onto a room, given current HP fraction. */
function nodeValue(room: RoomKind, hpFrac: number): number {
  switch (room) {
    case 'rest':
      // Heal/upgrade — far more valuable when hurt.
      return 5 + (hpFrac < 0.5 ? 4 : hpFrac < 0.75 ? 1 : 0)
    case 'treasure':
      return 6 // free relic
    case 'shop':
      return 4 // spend gold, remove a card
    case 'elite':
      // Relic reward vs HP risk: great when healthy, bad when low.
      if (hpFrac < 0.3) return -6
      if (hpFrac < 0.5) return -1
      return 5
    case 'event':
      return 3 // "?" — usually upside (relics, upgrades, options)
    case 'monster':
      return 1.5 // routine card reward + gold
    case 'boss':
    case 'start':
      return 0
    default:
      return 1
  }
}

function buildRationale(
  steps: MapStep[],
  hpFrac: number,
  ctx: MapPathContext
): string[] {
  const out: string[] = []
  const counts: Partial<Record<RoomKind, number>> = {}
  for (const s of steps) counts[s.room] = (counts[s.room] ?? 0) + 1

  if (steps[0]?.room === 'rest' && hpFrac < 0.5) {
    out.push(`Low HP (${ctx.hp}/${ctx.maxHp}) — rest first to recover.`)
  }

  const parts: string[] = []
  if (counts.rest) parts.push(`${counts.rest} Rest`)
  if (counts.treasure) parts.push(`${counts.treasure} Treasure`)
  if (counts.shop) parts.push(`${counts.shop} Merchant`)
  if (counts.event) parts.push(`${counts.event} Unknown`)
  if (counts.elite) parts.push(`${counts.elite} Elite`)
  if (parts.length) out.push(`Route hits ${parts.join(', ')}.`)

  if (!counts.elite && hpFrac < 0.5) {
    out.push("Avoids Elites while you're low on HP.")
  }
  if (!counts.shop) {
    out.push('No Merchant on this route — plan gold spending elsewhere.')
  }
  return out
}
