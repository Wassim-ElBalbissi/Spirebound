import type {
  CombatPotion,
  CombatState,
  EnemyState,
  HandCard,
  PowerInstance
} from '../../types/gameState'
import type { TierBundle } from '../../types/tierData'
import type {
  CombatHandAnnotation,
  TierLetter
} from '../../types/recommendation'

export interface CombatPlayOptions {
  /**
   * When true, adjust each enemy's intent damage by its Weak (×0.75) and
   * Strength (+N per hit). Off by default: the STS2MCP intent label is believed
   * to already show the final post-modifier number, so re-applying would
   * double-count. Verify against a real Weak/Strength fixture before enabling.
   */
  applyIntentModifiers?: boolean
}

/** Per-enemy incoming-damage breakdown for the threat panel. */
export interface EnemyThreat {
  entityId: string
  name: string
  intentType: string | null
  /** Damage parsed from the intent label (the mod's displayed number). */
  rawIntent: number | null
  /** After Weak/Strength; equals rawIntent when modifiers are off. */
  adjusted: number | null
  /** Modifiers applied, e.g. ['+3 Strength/hit', 'Weak −25%']. */
  applied: string[]
}

/** A combat potion surfaced as an option, with its situational value. */
export interface PotionPlay {
  id: string
  name: string
  description: string
  /** A damage potion that would kill the priority target. */
  lethal: boolean
  /** A block potion that fully covers the incoming damage. */
  coversIncoming: boolean
  /** Whether to play it now, weigh it, or save it. */
  advice: 'use' | 'consider' | 'hold'
  rationale: string[]
}

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
  /** Expected incoming damage this turn (sum of per-enemy adjusted intents). */
  incomingDamage: number
  /** Block needed beyond current to fully mitigate incoming damage. */
  blockNeeded: number
  notes: string[]
  /** Per-card annotations indexed by hand slot, for the annotation window. */
  hand: CombatHandAnnotation[]
  /** Per-enemy incoming-damage breakdown for the threat panel. */
  threats: EnemyThreat[]
  /** End-of-turn HP loss from unplayable Status/Curse cards held (e.g. Burn). */
  selfDamage: number
  /** Combat potions available, with their situational value this turn. */
  potions: PotionPlay[]
}

/**
 * Heuristic in-combat play scorer.
 *
 * Not a solver — picks the single highest-leverage card for the moment using
 * damage/block fit, lethal detection, vulnerable-target bias, and energy budget.
 */
export function rankCombatPlays(
  combat: CombatState,
  bundle?: TierBundle,
  opts: CombatPlayOptions = {}
): CombatPlayResult {
  const applyMods = opts.applyIntentModifiers ?? false
  const { threats, incomingDamage } = computeThreats(combat.enemies, applyMods)
  const blockNeeded = Math.max(0, incomingDamage - combat.block)
  // Unplayable Status/Curse cards (e.g. Burn) hurt you at end of turn just for
  // being in hand — surface that as damage you'll take regardless of play.
  const selfDamage = combat.hand
    .filter(
      (c) =>
        (c.type === 'Status' || c.type === 'Curse') && c.parsedSelfDamage != null
    )
    .reduce((sum, c) => sum + (c.parsedSelfDamage ?? 0), 0)

  const target = pickPriorityTarget(combat.enemies)
  // Does the hand already solve the problem the potion would? If a card kills,
  // or your cards already block enough, the potion should be saved.
  const handHasLethal =
    target !== null &&
    combat.hand.some(
      (c) =>
        c.canPlay &&
        c.type === 'Attack' &&
        c.parsedDamage !== null &&
        affordableCost(c, combat.energy) &&
        effectiveDamage(c.parsedDamage, target) >= target.hp
    )
  const maxCardBlock = maxAffordableBlock(combat.hand, combat.energy)
  const potions = combat.potions
    .map((p) =>
      buildPotionPlay(p, {
        target,
        blockNeeded,
        incomingDamage,
        block: combat.block,
        hp: combat.hp,
        handHasLethal,
        maxCardBlock
      })
    )
    .sort((a, b) => adviceRank(a.advice) - adviceRank(b.advice))

  if (combat.turn !== 'player') {
    return {
      ranked: [],
      incomingDamage,
      blockNeeded,
      notes: ['Enemy turn.'],
      hand: [],
      threats,
      selfDamage,
      potions
    }
  }
  if (combat.hand.length === 0) {
    return {
      ranked: [],
      incomingDamage,
      blockNeeded,
      notes: ['Empty hand.'],
      hand: [],
      threats,
      selfDamage,
      potions
    }
  }

  // Anti-attack effects (Weak, Strength-down) only have value when something is
  // actually attacking this turn.
  const hasAttacker = combat.enemies.some(
    (e) => e.intent && e.intent.type.toLowerCase().startsWith('attack')
  )

  // Follow-up attack potential vs the priority target — lets a Vulnerable setup
  // sequence ahead of the attacks it amplifies.
  const targetVulnerable =
    target?.status.some((s) => s.name.toLowerCase().includes('vulnerable')) ??
    false
  let bestAttackVsTarget = 0
  let cheapestAttackCost = Infinity
  if (target) {
    for (const c of combat.hand) {
      if (!c.canPlay || c.type !== 'Attack' || c.parsedDamage === null) continue
      const eff = effectiveDamage(c.parsedDamage, target)
      if (eff > bestAttackVsTarget) bestAttackVsTarget = eff
      const cc = typeof c.cost === 'number' ? c.cost : 1
      if (cc < cheapestAttackCost) cheapestAttackCost = cc
    }
  }
  const setup: SetupContext = {
    bestAttackVsTarget,
    cheapestAttackCost,
    targetVulnerable
  }

  const ranked: CombatPlayRanked[] = []
  for (const card of combat.hand) {
    if (!card.canPlay) continue

    const breakdown = scoreCard(card, combat, target, blockNeeded, hasAttacker, setup)
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
  if (selfDamage > 0) {
    notes.push(
      `Cards in hand (e.g. Burn) deal ${selfDamage} self-damage at end of turn.`
    )
  }
  const usePotion = potions.find((p) => p.advice === 'use')
  if (usePotion) {
    notes.push(`Potion — ${usePotion.name}: ${usePotion.rationale[0]}`)
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

  return {
    ranked,
    incomingDamage,
    blockNeeded,
    notes,
    hand,
    threats,
    selfDamage,
    potions
  }
}

interface PotionContext {
  target: EnemyState | null
  blockNeeded: number
  incomingDamage: number
  block: number
  hp: number
  /** A card in hand can already kill the priority target this turn. */
  handHasLethal: boolean
  /** Block your cards can realistically produce this turn (energy-aware). */
  maxCardBlock: number
}

/**
 * Turn a combat potion into an actionable call: USE it now, CONSIDER it, or
 * HOLD it. Potions are limited, so we only say "use" when it solves a problem
 * your cards can't this turn — a kill no card achieves, or survival your cards
 * can't block.
 */
function buildPotionPlay(potion: CombatPotion, ctx: PotionContext): PotionPlay {
  const rationale: string[] = []
  let lethal = false
  let coversIncoming = false
  let advice: PotionPlay['advice'] = 'hold'

  if (potion.parsedDamage !== null && ctx.target) {
    const dmg = effectiveDamage(potion.parsedDamage, ctx.target)
    lethal = dmg >= ctx.target.hp
    if (lethal && !ctx.handHasLethal) {
      advice = 'use'
      rationale.push(`Use now — kills ${ctx.target.name}; no card does.`)
    } else if (lethal) {
      rationale.push(`Save it — a card already kills ${ctx.target.name}.`)
    } else {
      advice = 'consider'
      rationale.push(`~${dmg} burst to ${ctx.target.name} (not lethal).`)
    }
  }

  if (potion.parsedBlock !== null) {
    const afterCards = Math.max(
      0,
      ctx.incomingDamage - ctx.block - ctx.maxCardBlock
    )
    if (afterCards > 0) {
      coversIncoming = potion.parsedBlock >= afterCards
      const deadly = afterCards >= ctx.hp
      const big = afterCards >= Math.max(8, Math.round(ctx.hp * 0.25))
      if (deadly) {
        advice = 'use'
        rationale.push(`Use now — survive ${afterCards} you can't block.`)
      } else if (big) {
        advice = 'use'
        rationale.push(`Use now — blocks ${afterCards} your cards can't.`)
      } else if (advice !== 'use') {
        advice = 'consider'
        rationale.push(`Covers ${afterCards} of leftover damage.`)
      }
    } else if (ctx.blockNeeded > 0) {
      rationale.push('Your cards can block this — save it.')
    } else {
      rationale.push(`+${potion.parsedBlock} Block (no threat).`)
    }
  }

  if (potion.parsedDamage === null && potion.parsedBlock === null) {
    advice = 'consider'
    rationale.push(potion.description)
  }

  return {
    id: potion.id,
    name: potion.name,
    description: potion.description,
    lethal,
    coversIncoming,
    advice,
    rationale
  }
}

function adviceRank(advice: PotionPlay['advice']): number {
  return advice === 'use' ? 0 : advice === 'consider' ? 1 : 2
}

function affordableCost(card: HandCard, energy: number): boolean {
  return typeof card.cost === 'number' ? card.cost <= energy : energy > 0
}

/** Greedy energy-aware estimate of the block your hand can produce this turn. */
function maxAffordableBlock(hand: HandCard[], energy: number): number {
  const blockers = hand
    .filter((c) => c.canPlay && c.parsedBlock !== null)
    .map((c) => ({
      block: c.parsedBlock as number,
      cost: typeof c.cost === 'number' ? c.cost : 1
    }))
    .sort(
      (a, b) => b.block / Math.max(1, b.cost) - a.block / Math.max(1, a.cost)
    )
  let remaining = energy
  let total = 0
  for (const b of blockers) {
    if (b.cost <= remaining) {
      total += b.block
      remaining -= b.cost
    }
  }
  return total
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

/** Cross-hand context so a setup card can sequence ahead of its payoff. */
interface SetupContext {
  /** Best effective (pre-Vulnerable) damage a hand attack can do to the target. */
  bestAttackVsTarget: number
  /** Cheapest attack cost in hand — used to check we can set up AND swing. */
  cheapestAttackCost: number
  /** Target already has Vulnerable, so re-applying is wasteful. */
  targetVulnerable: boolean
}

function scoreCard(
  card: HandCard,
  combat: CombatState,
  target: EnemyState | null,
  blockNeeded: number,
  hasAttacker: boolean,
  setup: SetupContext
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
  // Vulnerable amplifies *our* damage, so it's an offensive setup — valuable
  // whether or not the enemy is attacking.
  if (setupMatters && /Apply\s+\d*\s*Vulnerable/i.test(card.description)) {
    score += 10
    rationale.push('Sets up bigger hits with Vulnerable.')
    // If you can still swing this turn and the target survives your best raw
    // hit, play Vulnerable FIRST — rank it just above the attacks it boosts.
    const canFollowUp =
      target !== null &&
      !setup.targetVulnerable &&
      setup.bestAttackVsTarget > 0 &&
      setup.bestAttackVsTarget < target.hp &&
      combat.energy >= cost + setup.cheapestAttackCost
    if (canFollowUp) {
      score = Math.max(score, setup.bestAttackVsTarget + 6)
      rationale.push('Play before your attacks to amplify them.')
    }
  }
  // Weak / Strength-down only cut *incoming* damage, so they're worth nothing
  // when nothing is attacking this turn.
  const reducesEnemyOffense =
    /Apply\s+\d*\s*Weak/i.test(card.description) ||
    reducesEnemyStrength(card.description)
  if (setupMatters && reducesEnemyOffense) {
    if (hasAttacker) {
      score += 6
      rationale.push('Cuts the enemy attack this turn.')
    } else {
      rationale.push('No enemy is attacking — little value right now.')
    }
  }

  if (card.type === 'Power') {
    // A purely defensive power (only weakens the enemy attack) is dead weight
    // when nothing is attacking; a scaling power is still worth playing safely.
    const purelyDefensive =
      reducesEnemyOffense &&
      card.parsedDamage === null &&
      card.parsedBlock === null
    if (purelyDefensive && !hasAttacker) {
      rationale.push('Defensive power — hold it until the enemy attacks.')
    } else {
      score += 8
      rationale.push('Power — scales the rest of the fight.')
    }
  }

  if (cost === 0) {
    score += 2
    rationale.push('Free play.')
  }

  // Playing this costs you HP (e.g. Hemokinesis, Offering, Bloodletting) —
  // weigh that against its payoff.
  if (card.parsedSelfDamage != null && card.parsedSelfDamage > 0) {
    score -= card.parsedSelfDamage
    rationale.push(`Costs ${card.parsedSelfDamage} HP to play.`)
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

/**
 * True when a card reduces an enemy's Strength (a defensive debuff), without
 * matching the player *gaining* Strength. Phrasings vary: "-2 Strength",
 * "Apply -2 Strength", "loses 2 Strength", "Reduce ... Strength".
 */
function reducesEnemyStrength(description: string): boolean {
  return (
    /-\s*\d+\s+Strength/i.test(description) ||
    /Apply\s+-\d+\s*Strength/i.test(description) ||
    /\blose[s]?\s+\d+\s+Strength/i.test(description) ||
    /\breduce[s]?\b[^.]*\bStrength\b/i.test(description)
  )
}

/**
 * Build the per-enemy threat breakdown and the aggregate incoming damage.
 *
 * With `applyMods` off (the default) `adjusted` equals the raw parsed intent —
 * we trust the mod's label as the final number. With it on, enemy Strength is
 * added per hit and Weak scales the total by 0.75.
 */
function computeThreats(
  enemies: EnemyState[],
  applyMods: boolean
): { threats: EnemyThreat[]; incomingDamage: number } {
  const threats: EnemyThreat[] = []
  let incomingDamage = 0

  for (const e of enemies) {
    const intent = e.intent
    const isAttack = intent
      ? intent.type.toLowerCase().startsWith('attack')
      : false
    const parsed = isAttack ? parseIntentHits(intent?.label) : null
    const rawIntent = parsed ? parsed.base * parsed.hits : null

    let adjusted = rawIntent
    const applied: string[] = []
    if (applyMods && parsed) {
      const strength = powerAmount(e.status, 'strength')
      const perHit = Math.max(0, parsed.base + strength)
      let dmg = perHit * parsed.hits
      if (strength !== 0) {
        applied.push(`${strength > 0 ? '+' : ''}${strength} Strength/hit`)
      }
      if (hasPower(e.status, 'weak')) {
        dmg = Math.floor(dmg * 0.75)
        applied.push('Weak −25%')
      }
      adjusted = dmg
    }

    if (adjusted !== null) incomingDamage += adjusted
    threats.push({
      entityId: e.entityId,
      name: e.name,
      intentType: intent?.type ?? null,
      rawIntent,
      adjusted,
      applied
    })
  }

  return { threats, incomingDamage }
}

// Multi-hit intents render as "<damage><sep><hits>", where the separator may be
// an ASCII 'x'/'X', the Unicode '×' (U+00D7), or '*', optionally spaced —
// e.g. "3x4", "7×3", "5 x 2". Single hits are just a number, e.g. "12".
const INTENT_MULTI_RE = /(\d+)\s*[×x*]\s*(\d+)/i
const INTENT_NUM_RE = /(\d+)/

function parseIntentHits(
  label: string | undefined
): { base: number; hits: number } | null {
  if (!label) return null
  const multi = label.match(INTENT_MULTI_RE)
  if (multi) return { base: Number(multi[1]), hits: Number(multi[2]) }
  const single = label.match(INTENT_NUM_RE)
  if (single) return { base: Number(single[1]), hits: 1 }
  return null
}

function powerAmount(status: PowerInstance[], nameSubstr: string): number {
  const p = status.find((s) => s.name.toLowerCase().includes(nameSubstr))
  return p?.amount ?? 0
}

function hasPower(status: PowerInstance[], nameSubstr: string): boolean {
  return status.some((s) => s.name.toLowerCase().includes(nameSubstr))
}

function pickPriorityTarget(enemies: EnemyState[]): EnemyState | null {
  if (enemies.length === 0) return null
  // Lowest HP among living enemies, tiebreak by smallest block.
  return [...enemies]
    .filter((e) => e.hp > 0)
    .sort((a, b) => a.hp - b.hp || a.block - b.block)[0] ?? null
}
