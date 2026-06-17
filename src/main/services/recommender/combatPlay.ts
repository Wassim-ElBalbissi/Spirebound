import type { CombatState, EnemyState, HandCard } from '../../types/gameState'
import type { TierBundle } from '../../types/tierData'
import type {
  CombatHandAnnotation,
  TierLetter
} from '../../types/recommendation'

export interface CombatPlayRanked {
  /** Hand index of the card to play. */
  index: number
  id: string
  name: string
  cost: number | 'X' | null
  score: number
  targetEntityId: string | null
  rationale: string[]
  imageUrl?: string
  tier?: TierLetter | null
  starCost?: number
}

export interface CombatPlayResult {
  ranked: CombatPlayRanked[]
  /** Expected incoming damage this turn (sum of enemy attack intents). */
  incomingDamage: number
  /** Block needed beyond current to fully mitigate incoming damage. */
  blockNeeded: number
  notes: string[]
  /** Per-card annotations indexed by hand slot, for the annotation window. */
  hand: CombatHandAnnotation[]
}

/**
 * Heuristic in-combat play scorer.
 *
 * Not a solver — picks the single highest-leverage card for the moment using
 * damage/block fit, lethal detection, vulnerable-target bias, and energy budget.
 */
export function rankCombatPlays(
  combat: CombatState,
  bundle?: TierBundle
): CombatPlayResult {
  if (combat.turn !== 'player') {
    return {
      ranked: [],
      incomingDamage: 0,
      blockNeeded: 0,
      notes: ['Enemy turn.'],
      hand: []
    }
  }
  if (combat.hand.length === 0) {
    return {
      ranked: [],
      incomingDamage: 0,
      blockNeeded: 0,
      notes: ['Empty hand.'],
      hand: []
    }
  }

  const incomingDamage = sumAttackIntents(combat.enemies)
  const blockNeeded = Math.max(0, incomingDamage - combat.block)
  const target = pickPriorityTarget(combat.enemies)

  const ranked: CombatPlayRanked[] = []
  for (const card of combat.hand) {
    if (!card.canPlay) continue

    const breakdown = scoreCard(card, combat, target, blockNeeded)
    // Every playable card surfaces, even at score 0 — users want the full
    // hand visible so they can override a heuristic that doesn't recognise
    // a utility card (e.g. Dualcast, Acrobatics).
    const entry = bundle?.cards[card.id]
    ranked.push({
      index: card.index,
      id: card.id,
      name: card.name,
      cost: card.cost,
      score: Math.max(0, breakdown.score),
      targetEntityId: card.type === 'Attack' ? target?.entityId ?? null : null,
      rationale: breakdown.rationale,
      imageUrl: entry?.imageUrl,
      tier: lookupTier(card.id, bundle),
      starCost: entry?.starCost
    })
  }

  ranked.sort((a, b) => b.score - a.score)

  const notes: string[] = []
  if (incomingDamage > 0) {
    notes.push(
      `Incoming: ${incomingDamage}, you have ${combat.block} block → need ${blockNeeded} more.`
    )
  } else if (incomingDamage === 0 && combat.enemies.some((e) => e.intent)) {
    notes.push('No attack intents this turn — go offensive.')
  }

  // Per-card annotations: rank by hand index for the per-card badges window.
  const rankByIndex = new Map<number, number>()
  ranked.forEach((r, i) => rankByIndex.set(r.index, i + 1))
  const hand: CombatHandAnnotation[] = combat.hand.map((card) => {
    const rank = rankByIndex.get(card.index) ?? 0
    const scoreRow = ranked.find((r) => r.index === card.index)
    return {
      handIndex: card.index,
      rank,
      tier: lookupTier(card.id, bundle),
      score: scoreRow?.score ?? 0,
      isLethal: (scoreRow?.rationale ?? []).includes('Lethal!'),
      name: card.name,
      cost: card.cost,
      pos: card.pos
    }
  })

  return { ranked, incomingDamage, blockNeeded, notes, hand }
}

function lookupTier(id: string, bundle: TierBundle | undefined): TierLetter | null {
  const entry = bundle?.cards[id]
  if (!entry) return null
  return entry.tier as TierLetter
}

interface CardScore {
  score: number
  rationale: string[]
}

function scoreCard(
  card: HandCard,
  combat: CombatState,
  target: EnemyState | null,
  blockNeeded: number
): CardScore {
  const rationale: string[] = []
  let score = 0
  const cost = typeof card.cost === 'number' ? card.cost : 1
  const energyShortfall = Math.max(0, cost - combat.energy)
  if (energyShortfall > 0) {
    return { score: 0, rationale: ['Not enough energy.'] }
  }

  let isLethal = false
  if (card.type === 'Attack' && card.parsedDamage !== null && target) {
    const dmg = effectiveDamage(card.parsedDamage, target)
    isLethal = dmg >= target.hp
    const effective = Math.min(dmg, target.hp)
    score += effective * 1.0
    rationale.push(`~${effective} damage to ${target.name}`)

    if (isLethal) {
      // Prefer cheaper kills so leftover energy goes to defense / setup.
      const cheapKillBonus = 40 + Math.max(0, 3 - cost) * 8
      score += cheapKillBonus
      rationale.push('Lethal!')
    } else if (
      target.status.some((s) => s.name.toLowerCase().includes('vulnerable'))
    ) {
      rationale.push('Target is Vulnerable.')
    }
  }

  if (card.parsedBlock !== null) {
    const block = card.parsedBlock
    score += Math.min(block, blockNeeded) * 1.5
    if (block >= blockNeeded && blockNeeded > 0) {
      score += 12
      rationale.push(`Covers ${blockNeeded} incoming damage.`)
    } else if (block > blockNeeded + 6) {
      score -= 4
      rationale.push('Overblocks; mild waste.')
    } else if (blockNeeded === 0) {
      // Don't penalize — just note. Defend still ranks last when no threats,
      // but stays visible in the hand list.
      rationale.push('No incoming damage — block not urgent.')
    } else {
      rationale.push(`+${block} block (need ${blockNeeded}).`)
    }
  }

  // Setup bonuses don't matter when the card already kills the (only) target.
  const setupMatters = !isLethal || combat.enemies.length > 1
  if (setupMatters && /Apply\s+\d*\s*Vulnerable/i.test(card.description)) {
    score += 10
    rationale.push('Sets up bigger hits with Vulnerable.')
  }
  if (setupMatters && /Apply\s+\d*\s*Weak/i.test(card.description)) {
    score += 6
    rationale.push('Weak reduces enemy damage.')
  }

  if (card.type === 'Power') {
    score += 8
    rationale.push('Power — scales the rest of the fight.')
  }

  if (cost === 0) {
    score += 2
    rationale.push('Free play.')
  }

  // Tiny tiebreaker so equal-ranked cards have stable order.
  score += card.upgraded ? 0.5 : 0

  // Utility cards (no parseable damage / block / power-tagged) still need
  // *some* score so they show up in the ranked list. Without this, cards
  // like Dualcast or Acrobatics would always sit at 0 and look like bugs.
  if (
    score === 0 &&
    card.parsedDamage === null &&
    card.parsedBlock === null &&
    card.type !== 'Power'
  ) {
    score = 3 + (card.upgraded ? 0.5 : 0)
    rationale.push('Utility — no automatic score.')
  }

  return { score, rationale }
}

function effectiveDamage(base: number, target: EnemyState): number {
  let dmg = base
  if (target.status.some((s) => s.name.toLowerCase().includes('vulnerable'))) {
    dmg = Math.floor(dmg * 1.5)
  }
  return Math.max(0, dmg - target.block)
}

function sumAttackIntents(enemies: EnemyState[]): number {
  let sum = 0
  for (const e of enemies) {
    if (!e.intent) continue
    if (!e.intent.type.toLowerCase().startsWith('attack')) continue
    const dmg = parseIntentDamage(e.intent.label)
    if (dmg) sum += dmg
  }
  return sum
}

const INTENT_LABEL_RE = /^(\d+)(?:×(\d+))?$/i

function parseIntentDamage(label: string | undefined): number | null {
  if (!label) return null
  const m = label.match(INTENT_LABEL_RE)
  if (!m) return null
  const base = Number(m[1])
  const hits = m[2] ? Number(m[2]) : 1
  return base * hits
}

function pickPriorityTarget(enemies: EnemyState[]): EnemyState | null {
  if (enemies.length === 0) return null
  // Lowest HP among living enemies, tiebreak by smallest block.
  return [...enemies]
    .filter((e) => e.hp > 0)
    .sort((a, b) => a.hp - b.hp || a.block - b.block)[0] ?? null
}
