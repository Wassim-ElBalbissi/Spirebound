import type {
  CombatPotion,
  CombatState,
  EnemyState,
  HandCard,
  OrbInstance,
  PowerInstance
} from '../../types/gameState'
import type { TierBundle } from '../../types/tierData'
import type {
  CombatHandAnnotation,
  TierLetter
} from '../../types/recommendation'
import { stripConditionals } from '../screens'

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
  /** Defect orbs in play (empty for other characters). */
  orbs: OrbInstance[]
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
  // Defect orbs trigger at end of turn — Frost adds Block before the enemy
  // hits; Lightning/Dark chip damage. Count both toward this turn's math.
  const orbPassiveBlock = sumOrbPassive(combat.orbs, 'block')
  const orbPassiveDamage = sumOrbPassive(combat.orbs, 'damage')
  // Player powers that grant Block at end of turn (Plating, Metallicize, Plated
  // Armor) resolve before the enemy attacks — count them like orb passive block
  // so we don't over-report the threat. Relics that grant these (e.g. Gorget →
  // Plating) surface here as the power itself, so no relic lookup is needed.
  const powerBlock = endOfTurnBlockFromPowers(combat.playerStatus)
  // All block that lands before the enemy swings, regardless of card play.
  const passiveBlock = orbPassiveBlock + powerBlock
  // Player-side modifiers that bend our own damage/block math:
  //  • Strength (+/hit) and Vigor (+ to one Attack, per hit) raise card damage.
  //  • Weak (×0.75) cuts our attack damage; Frail (×0.75) cuts our card block.
  //  • Dexterity (+) raises Block from cards (not orbs/powers).
  // Strength/Dexterity can be negative (the "Down" debuffs); callers floor at 0.
  const attackMods: AttackMods = {
    strength: powerAmount(combat.playerStatus, 'strength'),
    weak: hasPower(combat.playerStatus, 'weak'),
    vigor: powerAmount(combat.playerStatus, 'vigor')
  }
  const playerDexterity = powerAmount(combat.playerStatus, 'dexterity')
  const playerFrail = hasPower(combat.playerStatus, 'frail')
  // Orb passive damage hits a random enemy — only reliable on the target when
  // there's a single enemy.
  const orbDamageToTarget = combat.enemies.length === 1 ? orbPassiveDamage : 0
  const blockNeeded = Math.max(0, incomingDamage - combat.block - passiveBlock)
  // Unplayable Status/Curse cards (e.g. Burn) hurt you at end of turn just for
  // being in hand — surface that as damage you'll take regardless of play.
  const selfDamage = combat.hand
    .filter(
      (c) =>
        (c.type === 'Status' || c.type === 'Curse') && c.parsedSelfDamage != null
    )
    .reduce((sum, c) => sum + (c.parsedSelfDamage ?? 0), 0)

  const target = pickPriorityTarget(combat.enemies)
  // Does the hand already solve the problem the potion would? Consider playing
  // *several* affordable attacks (e.g. 3 Strikes), not just one card — so a
  // potion isn't recommended for a kill your cards can already make.
  const handHasLethal =
    target !== null &&
    maxAffordableAttackDamage(combat.hand, combat.energy, target, attackMods) +
      orbDamageToTarget >=
      target.hp
  const maxCardBlock = maxAffordableBlock(
    combat.hand,
    combat.energy,
    playerDexterity,
    playerFrail
  )
  // If a single enemy is the only attacker and your cards can kill it this turn,
  // killing removes the incoming damage — so don't recommend blocking or a
  // defensive potion.
  const attackers = combat.enemies.filter(
    (e) => e.intent && e.intent.type.toLowerCase().startsWith('attack')
  )
  const soleAttacker = attackers.length === 1 ? attackers[0] : null
  const canKillThreat =
    soleAttacker != null &&
    maxAffordableAttackDamage(
      combat.hand,
      combat.energy,
      soleAttacker,
      attackMods
    ) +
      (combat.enemies.length === 1 ? orbPassiveDamage : 0) >=
      soleAttacker.hp
  const potions = combat.potions
    .map((p) =>
      buildPotionPlay(p, {
        target,
        blockNeeded,
        incomingDamage,
        block: combat.block + passiveBlock,
        hp: combat.hp,
        handHasLethal,
        maxCardBlock,
        canKillThreat
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
      potions,
      orbs: combat.orbs
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
      potions,
      orbs: combat.orbs
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
      const eff = effectiveDamage(c.parsedDamage, target, {
        ...attackMods,
        hits: c.parsedHits ?? 1
      })
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

  // A boss debuff that exhausts every card you play — each play permanently
  // loses that card for the fight.
  const exhaustsOnPlay = combat.playerStatus.some(
    (s) => /exhaust/i.test(s.name) || /exhaust/i.test(s.description ?? '')
  )

  // Position labels (1,2,3… left→right) so attacks can name a specific target
  // when enemies share a name.
  const labels = enemyLabels(combat.enemies)
  const targetLabel = target ? labels.get(target.entityId) ?? target.name : null

  // Damage you'd still take after blocking optimally with cards + orbs +
  // end-of-turn powers (Plating etc.).
  const unblocked = Math.max(
    0,
    incomingDamage - combat.block - passiveBlock - maxCardBlock
  )
  const survivalUrgent =
    !canKillThreat && unblocked > 0 && unblocked >= Math.ceil(combat.hp * 0.5)
  // A big hit you haven't covered yet (≥ half your HP if you do nothing) means
  // secure Block before developing — even if your cards *can* cover it. Broader
  // than survivalUrgent, which is the stricter case where even your best block
  // falls short. Lets defensive plays lead over do-nothing scaling Powers.
  const defendFirst =
    !canKillThreat &&
    blockNeeded > 0 &&
    blockNeeded >= Math.ceil(combat.hp * 0.5)

  const scoreCtx: ScoreContext = {
    hasAttacker,
    setup,
    orbDamageToTarget,
    exhaustsOnPlay,
    survivalUrgent,
    defendFirst,
    canKillThreat,
    targetLabel,
    attackMods,
    playerDexterity,
    playerFrail
  }

  const ranked: CombatPlayRanked[] = []
  for (const card of combat.hand) {
    if (!card.canPlay) continue

    const breakdown = scoreCard(card, combat, target, blockNeeded, scoreCtx)
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
    const haveBlock = combat.block + passiveBlock
    const srcs: string[] = []
    if (orbPassiveBlock > 0) srcs.push(`${orbPassiveBlock} from orbs`)
    if (powerBlock > 0) srcs.push(`${powerBlock} end-of-turn`)
    const passiveNote = srcs.length ? ` (incl. ${srcs.join(' + ')})` : ''
    notes.push(
      `Incoming ${incomingDamage}, you have ${haveBlock} block${passiveNote} → need ${blockNeeded} more.`
    )
  } else if (incomingDamage === 0 && combat.enemies.some((e) => e.intent)) {
    notes.push('No attack intents this turn — go offensive.')
  }
  if (canKillThreat && incomingDamage > 0) {
    notes.push('You can kill the attacker — attack instead of blocking.')
  }
  if (survivalUrgent) {
    notes.push(
      `Survival risk — ~${unblocked} damage you can't block. Defend or use a potion.`
    )
  } else if (defendFirst) {
    notes.push(
      `Big hit incoming (${blockNeeded} unblocked) — secure block before developing.`
    )
  }
  if (orbPassiveDamage > 0) {
    notes.push(`Orbs deal ~${orbPassiveDamage} damage at end of turn.`)
  }
  if (exhaustsOnPlay) {
    notes.push('Cards exhaust when played — only play what you can afford to lose.')
  }
  if (selfDamage > 0) {
    notes.push(
      `Cards in hand (e.g. Burn) deal ${selfDamage} self-damage at end of turn.`
    )
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
    potions,
    orbs: combat.orbs
  }
}

function sumOrbPassive(
  orbs: OrbInstance[],
  kind: OrbInstance['passiveKind']
): number {
  return orbs
    .filter((o) => o.passiveKind === kind)
    .reduce((sum, o) => sum + o.passiveValue, 0)
}

// Powers whose description reads "At the end of your turn, gain N Block"
// (Plating, Metallicize, Plated Armor). Captured generically by text so we
// don't have to enumerate every Block-granting power by id.
const END_OF_TURN_BLOCK_RE = /gain\s+(\d+)\s+block/i

/**
 * Block the player will gain at end of turn from active powers — Plating,
 * Metallicize, Plated Armor and the like. This lands before the enemy attacks,
 * so it offsets incoming damage exactly like orb passive block does.
 *
 * We require the power's text to mention "end of … turn" AND a Block gain, then
 * read the number from the description (falling back to the stack `amount`),
 * which tracks the live value as the power grows or decays.
 */
function endOfTurnBlockFromPowers(playerStatus: PowerInstance[]): number {
  let total = 0
  for (const p of playerStatus) {
    const desc = p.description ?? ''
    if (!/end of (?:your )?turn/i.test(desc) || !/block/i.test(desc)) continue
    const m = desc.match(END_OF_TURN_BLOCK_RE)
    total += m ? Number(m[1]) : p.amount ?? 0
  }
  return total
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
  /** You can kill the sole attacker — a block potion is unnecessary. */
  canKillThreat: boolean
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
      rationale.push(`Kills ${ctx.target.name} — your cards can't this turn.`)
    } else if (lethal) {
      rationale.push(`Hold — your cards can already kill ${ctx.target.name}.`)
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
    if (ctx.canKillThreat) {
      rationale.push('Kill the attacker instead — block not needed.')
    } else if (afterCards > 0) {
      coversIncoming = potion.parsedBlock >= afterCards
      const deadly = afterCards >= ctx.hp
      const big = afterCards >= Math.max(8, Math.round(ctx.hp * 0.25))
      if (deadly) {
        advice = 'use'
        rationale.push(`Survives ${afterCards} damage you can't block.`)
      } else if (big) {
        advice = 'use'
        rationale.push(`Blocks ${afterCards} your cards can't.`)
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

/**
 * Greedy energy-aware estimate of the total attack damage the hand can do to a
 * target — i.e. play as many high-value attacks as the energy allows. Lets the
 * engine see a kill that takes several cards (e.g. 3 Strikes), not just one.
 */
function maxAffordableAttackDamage(
  hand: HandCard[],
  energy: number,
  target: EnemyState,
  mods: AttackMods = {}
): number {
  // Vigor only fires on a single Attack, so we estimate each card's damage
  // *without* it, then add the best Vigor payoff among the cards we actually
  // play (Vigor is per-hit, so a multi-hit card extracts the most from it).
  const { vigor = 0, ...perHitMods } = mods
  const attacks = hand
    .filter((c) => c.canPlay && c.type === 'Attack' && c.parsedDamage !== null)
    .map((c) => {
      const hits = c.parsedHits ?? 1
      const base = effectiveDamage(c.parsedDamage as number, target, {
        ...perHitMods,
        hits
      })
      const withVigor = effectiveDamage(c.parsedDamage as number, target, {
        ...perHitMods,
        vigor,
        hits
      })
      return {
        dmg: base,
        vigorGain: withVigor - base,
        cost: typeof c.cost === 'number' ? c.cost : 1
      }
    })
    .sort((a, b) => b.dmg / Math.max(1, b.cost) - a.dmg / Math.max(1, a.cost))
  let remaining = energy
  let total = 0
  let bestVigorGain = 0
  for (const a of attacks) {
    if (a.cost <= remaining) {
      total += a.dmg
      remaining -= a.cost
      if (a.vigorGain > bestVigorGain) bestVigorGain = a.vigorGain
    }
  }
  return total + bestVigorGain
}

/** Label each enemy with a 1-based position when its name is shared. */
function enemyLabels(enemies: EnemyState[]): Map<string, string> {
  const counts = new Map<string, number>()
  for (const e of enemies) counts.set(e.name, (counts.get(e.name) ?? 0) + 1)
  const labels = new Map<string, string>()
  enemies.forEach((e, i) => {
    labels.set(
      e.entityId,
      (counts.get(e.name) ?? 0) > 1 ? `${e.name} #${i + 1}` : e.name
    )
  })
  return labels
}

/** Greedy energy-aware estimate of the block your hand can produce this turn. */
function maxAffordableBlock(
  hand: HandCard[],
  energy: number,
  dexterity = 0,
  frail = false
): number {
  const blockers = hand
    .filter((c) => c.canPlay && c.parsedBlock !== null)
    .map((c) => ({
      block: cardBlock(c.parsedBlock as number, dexterity, frail),
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

/** Combat-level context for scoring a single card. */
interface ScoreContext {
  hasAttacker: boolean
  setup: SetupContext
  /** Orb passive damage that will reliably hit the target (single enemy). */
  orbDamageToTarget: number
  /** A boss debuff exhausts every card you play. */
  exhaustsOnPlay: boolean
  /** Unblocked incoming damage is a serious threat to your HP. */
  survivalUrgent: boolean
  /** A big uncovered hit (≥ half HP) — lead with defense over scaling. */
  defendFirst: boolean
  /** A card can kill the sole attacker — blocking is unnecessary. */
  canKillThreat: boolean
  /** Display label of the priority target (with a position # for duplicates). */
  targetLabel: string | null
  /** Strength/Weak/Vigor applied to our card attack damage. */
  attackMods: AttackMods
  /** Player Dexterity — added to Block from cards (can be negative). */
  playerDexterity: number
  /** Player Frail — cuts Block from cards by 25%. */
  playerFrail: boolean
}

function scoreCard(
  card: HandCard,
  combat: CombatState,
  target: EnemyState | null,
  blockNeeded: number,
  ctx: ScoreContext
): CardScore {
  const rationale: string[] = []
  let score = 0
  const cost = typeof card.cost === 'number' ? card.cost : 1
  const energyShortfall = Math.max(0, cost - combat.energy)
  if (energyShortfall > 0) {
    return { score: 0, rationale: ['Not enough energy.'] }
  }

  // Block isn't urgent if you can simply kill the lone attacker this turn.
  const effBlockNeeded = ctx.canKillThreat ? 0 : blockNeeded

  // State-aware conditional riders ("If the enemy is Vulnerable, deal 4 more";
  // "If you have no Block, gain 8"). Only the riders whose condition currently
  // holds are credited, so a card is worth more exactly when its rider is live.
  const riders = conditionalRiders(card, combat, target)
  // Defect: Evoke releases the rightmost orb's stored value as damage/block.
  const evoke = evokeEffect(card, combat.orbs)

  // Generalized "does this card do anything right now?" gate. A card whose every
  // effect is nullified by the current state — an Evoke with no orbs, or a card
  // whose only effect is a condition that is currently false — is parked at 0 so
  // it is never suggested as a play (it still surfaces, greyed, in the list).
  const dead = deadCardReason(card, combat, riders, evoke)
  if (dead) return { score: 0, rationale: [dead] }

  for (const note of riders.rationale) rationale.push(note)

  let isLethal = false
  const attackBase = (card.parsedDamage ?? 0) + riders.damage
  if (card.type === 'Attack' && attackBase > 0 && target) {
    // Vigor lands on whichever Attack you play, so each attack is scored as if
    // it were the recipient (you'd spend it on the one you play).
    const dmg = effectiveDamage(attackBase, target, {
      ...ctx.attackMods,
      hits: card.parsedHits ?? 1
    })
    isLethal = dmg + ctx.orbDamageToTarget >= target.hp
    const effective = Math.min(dmg, target.hp)
    score += effective * 1.0
    rationale.push(`~${effective} damage to ${ctx.targetLabel ?? target.name}`)

    if (isLethal) {
      // Prefer cheaper kills so leftover energy goes to defense / setup.
      const cheapKillBonus = 40 + Math.max(0, 3 - cost) * 8
      score += cheapKillBonus
      rationale.push(
        ctx.orbDamageToTarget > 0 && dmg < target.hp ? 'Lethal! (with orb)' : 'Lethal!'
      )
    } else if (
      target.status.some((s) => s.name.toLowerCase().includes('vulnerable'))
    ) {
      rationale.push('Target is Vulnerable.')
    }
  }

  if (evoke.damage > 0) {
    score += evoke.damage
    rationale.push(`Evoke: ~${evoke.damage} orb damage.`)
    if (
      target &&
      combat.enemies.length === 1 &&
      evoke.damage + ctx.orbDamageToTarget >= target.hp
    ) {
      isLethal = true
      score += 30
      rationale.push('Lethal via orb evoke!')
    }
  }
  if (evoke.block > 0) {
    score += Math.min(evoke.block, effBlockNeeded) * 1.5
    rationale.push(`Evoke: +${evoke.block} block.`)
  }
  if (channelsOrb(card)) {
    score += 5
    rationale.push('Channels an orb — builds your engine.')
  }

  const blockBase = (card.parsedBlock ?? 0) + riders.block
  if (blockBase > 0) {
    // Dexterity raises card Block; Frail cuts it 25%.
    const block = cardBlock(blockBase, ctx.playerDexterity, ctx.playerFrail)
    score += Math.min(block, effBlockNeeded) * 1.5
    if (ctx.survivalUrgent) {
      score += 15
      rationale.push('Survival — block now.')
    } else if (ctx.defendFirst && effBlockNeeded > 0) {
      // A big hit is incoming — defensive plays should lead over chip/draw.
      score += 6
      rationale.push('Defend first — cover the hit before developing.')
    }
    if (block >= effBlockNeeded && effBlockNeeded > 0) {
      score += 12
      rationale.push(`Covers ${effBlockNeeded} incoming damage.`)
    } else if (block > effBlockNeeded + 6 && !ctx.survivalUrgent) {
      score -= 4
      rationale.push('Overblocks; mild waste.')
    } else if (effBlockNeeded === 0) {
      rationale.push(
        ctx.canKillThreat
          ? 'Kill the attacker instead — block not needed.'
          : 'No incoming damage — block not urgent.'
      )
    } else {
      rationale.push(`+${block} block (need ${effBlockNeeded}).`)
    }
  }

  // Setup bonuses don't matter when the card already kills the (only) target.
  const setupMatters = !isLethal || combat.enemies.length > 1
  // Vulnerable amplifies *our* damage, so it's an offensive setup — valuable
  // whether or not the enemy is attacking.
  if (setupMatters && /Apply\s+\d*\s*Vulnerable/i.test(card.description)) {
    score += 10
    rationale.push('Sets up bigger hits with Vulnerable.')
    const canFollowUp =
      target !== null &&
      !ctx.setup.targetVulnerable &&
      ctx.setup.bestAttackVsTarget > 0 &&
      ctx.setup.bestAttackVsTarget < target.hp &&
      combat.energy >= cost + ctx.setup.cheapestAttackCost
    if (canFollowUp) {
      score = Math.max(score, ctx.setup.bestAttackVsTarget + 6)
      rationale.push('Play before your attacks to amplify them.')
    }
  }
  // Weak / Strength-down only cut *incoming* damage, so they're worth nothing
  // when nothing is attacking this turn.
  const reducesEnemyOffense =
    /Apply\s+\d*\s*Weak/i.test(card.description) ||
    reducesEnemyStrength(card.description)
  if (setupMatters && reducesEnemyOffense) {
    if (ctx.hasAttacker) {
      score += 6
      rationale.push('Cuts the enemy attack this turn.')
    } else {
      rationale.push('No enemy is attacking — little value right now.')
    }
  }

  if (card.type === 'Power') {
    if (ctx.exhaustsOnPlay) {
      // Playing a Power under an exhaust debuff loses it for the whole fight.
      score -= 15
      rationale.push('Exhausts on play — you would lose this Power for the fight.')
    } else {
      const purelyDefensive =
        reducesEnemyOffense &&
        card.parsedDamage === null &&
        card.parsedBlock === null
      if (purelyDefensive && !ctx.hasAttacker) {
        rationale.push('Defensive power — hold it until the enemy attacks.')
      } else if (ctx.defendFirst && card.parsedBlock === null) {
        // A big hit is incoming and uncovered. A Power that adds no Block this
        // turn shouldn't lead — secure defense first; it does nothing now.
        rationale.push(
          'Defend first — big hit incoming; this scales but does nothing this turn.'
        )
      } else {
        score += 8
        rationale.push('Power — scales the rest of the fight.')
      }
    }
  }

  // Card draw is card advantage, and worth more when you're digging for an
  // answer you don't yet hold (block/lethal). Kept modest so it never outranks
  // the actual defense on a defend-first turn. Conditional draw (counted in
  // `riders`) is already described above, so only the unconditional part adds a
  // line here.
  const drawCount = (card.parsedDraw ?? 0) + riders.draw
  if (drawCount > 0) {
    const digging = ctx.survivalUrgent || ctx.defendFirst
    score += (digging ? 3 : 2) * drawCount
    if ((card.parsedDraw ?? 0) > 0) {
      rationale.push(
        `Draws ${card.parsedDraw}${digging ? ' — dig for an answer' : ' — card advantage'}.`
      )
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

  // Retain cards stay in hand — no need to dump one when it isn't useful now.
  if (
    (card.keywords ?? []).some((k) => /retain/i.test(k)) &&
    !isLethal &&
    !ctx.survivalUrgent
  ) {
    score -= 4
    rationale.push('Retains — you can hold it for a better turn.')
  }

  // Tiny tiebreaker so equal-ranked cards have stable order.
  score += card.upgraded ? 0.5 : 0

  // Utility cards (no parseable damage / block / power-tagged) still need
  // *some* score so they show up in the ranked list.
  if (
    score === 0 &&
    card.parsedDamage === null &&
    card.parsedBlock === null &&
    card.type !== 'Power' &&
    evoke.damage === 0 &&
    evoke.block === 0
  ) {
    score = 3 + (card.upgraded ? 0.5 : 0)
    rationale.push('Utility — no automatic score.')
  }

  return { score, rationale }
}

/**
 * Estimate the damage/block an Evoke card releases from the orbs. Defect's
 * Evoke uses the rightmost orb (or all orbs for "Evoke all"); some cards evoke
 * twice (e.g. Dualcast).
 */
function evokeEffect(
  card: HandCard,
  orbs: OrbInstance[]
): { damage: number; block: number } {
  if (orbs.length === 0) return { damage: 0, block: 0 }
  const isEvoke =
    (card.keywords ?? []).some((k) => /evoke/i.test(k)) || /evoke/i.test(card.description)
  if (!isEvoke) return { damage: 0, block: 0 }
  const multiplier = /(twice|two times|2 times)/i.test(card.description) ? 2 : 1
  const last = orbs[orbs.length - 1]
  const chosen = /all\s+orbs/i.test(card.description)
    ? orbs
    : last
      ? [last]
      : []
  let damage = 0
  let block = 0
  for (const o of chosen) {
    if (o.passiveKind === 'damage') damage += o.evokeValue
    else if (o.passiveKind === 'block') block += o.evokeValue
  }
  return { damage: damage * multiplier, block: block * multiplier }
}

/** Player-side modifiers that bend our outgoing card attack damage. */
interface AttackMods {
  /** Strength — added to every hit. */
  strength?: number
  /** Vigor — added to every hit of the one Attack it's spent on. */
  vigor?: number
  /** Weak on the player — scales our attack damage by 0.75. */
  weak?: boolean
  /** Hit count for multi-hit cards (Strength/Vigor apply per hit). */
  hits?: number
}

/**
 * Damage a card attack actually lands on `target`, mirroring the game's order:
 * per hit = (base + Strength + Vigor), ×0.75 if we're Weak, ×1.5 if the target
 * is Vulnerable (each step floored); times the hit count; minus the target's
 * Block (a single pool the multi-hit sequence drains).
 *
 * Potions ignore all of these, so their callers pass no mods.
 */
function effectiveDamage(
  base: number,
  target: EnemyState,
  mods: AttackMods = {}
): number {
  const { strength = 0, vigor = 0, weak = false, hits = 1 } = mods
  let perHit = base + strength + vigor
  if (weak) perHit = Math.floor(perHit * 0.75)
  if (target.status.some((s) => s.name.toLowerCase().includes('vulnerable'))) {
    perHit = Math.floor(perHit * 1.5)
  }
  const total = Math.max(0, perHit) * Math.max(1, hits)
  return Math.max(0, total - target.block)
}

/** Block a card grants after Dexterity (+) and Frail (×0.75), floored at 0. */
function cardBlock(base: number, dexterity: number, frail: boolean): number {
  let block = base + dexterity
  if (frail) block = Math.floor(block * 0.75)
  return Math.max(0, block)
}

/** True when the card channels an orb (keyword or "Channel N" text). */
function channelsOrb(card: HandCard): boolean {
  return (
    (card.keywords ?? []).some((k) => /channel/i.test(k)) ||
    /channel\s+\d/i.test(card.description)
  )
}

// Effect verbs we either score elsewhere or can't model — their presence in the
// *unconditional* text means the card still does something, so it isn't "dead".
const EFFECT_VERB_RE =
  /\b(deal|gain|draw|channel|apply|evoke|scry|discard|exhaust|add|heal|double|trigger|play|lose|reduce|remove|steal|poison)\b/i

/**
 * Explain why a card does nothing in the current state, or null if it has some
 * effect worth surfacing. Conservative on purpose: it only declares a card dead
 * when *every* effect it could have is provably nullified now — an Evoke with no
 * orbs, or a card whose sole content is conditional and no condition holds. Any
 * unrecognized unconditional verb means we keep the card live (better to show a
 * utility card we can't score than to wrongly tell the player to skip it).
 */
function deadCardReason(
  card: HandCard,
  combat: CombatState,
  riders: RiderResult,
  evoke: { damage: number; block: number }
): string | null {
  const desc = card.description ?? ''
  const isEvokeCard =
    (card.keywords ?? []).some((k) => /evoke/i.test(k)) || /evoke/i.test(desc)
  if (
    isEvokeCard &&
    combat.orbs.length === 0 &&
    card.parsedDamage === null &&
    card.parsedBlock === null
  ) {
    return 'No orbs to evoke — does nothing.'
  }

  const hasBaseEffect =
    card.parsedDamage !== null ||
    card.parsedBlock !== null ||
    (card.parsedDraw ?? 0) > 0 ||
    card.type === 'Power' ||
    evoke.damage > 0 ||
    evoke.block > 0 ||
    channelsOrb(card) ||
    // An unconditional verb we don't fully model (e.g. "Apply 2 Weak", "Scry 3").
    EFFECT_VERB_RE.test(stripConditionals(desc))
  const hasConditional = /\bIf\b/i.test(desc)
  const ridersInert = riders.damage === 0 && riders.block === 0 && riders.draw === 0
  if (!hasBaseEffect && hasConditional && ridersInert) {
    return 'Condition not met — does nothing now.'
  }
  return null
}

interface RiderResult {
  /** Extra attack damage from riders whose condition currently holds. */
  damage: number
  /** Extra Block from riders whose condition currently holds. */
  block: number
  /** Extra cards drawn from riders whose condition currently holds. */
  draw: number
  /** Human-readable notes for each credited rider. */
  rationale: string[]
}

// "If <condition>, <effect>" — capture the condition and the effect clause.
const RIDER_RE = /\bIf\b\s+([^,]+?),\s+([^.]+)/gi
const RIDER_DAMAGE_RE = /deal\s+(\d+)\s+(?:more\s+|additional\s+)?damage/i
const RIDER_BLOCK_RE = /gain\s+(\d+)\s+block/i
const RIDER_DRAW_RE = /draw\s+(?:(\d+)|a)\s+cards?/i

/**
 * Evaluate a card's conditional riders against the live combat state and credit
 * only the ones whose condition currently holds (or can't be disproven). This
 * is what makes a card "better value" exactly when its rider is live — e.g. a
 * "deal more vs Vulnerable" attack is worth more only against a Vulnerable
 * target. Conditions we can't read from a snapshot (e.g. "played fewer than N
 * cards this turn") are credited but flagged, rather than silently assumed.
 */
function conditionalRiders(
  card: HandCard,
  combat: CombatState,
  target: EnemyState | null
): RiderResult {
  const out: RiderResult = { damage: 0, block: 0, draw: 0, rationale: [] }
  const desc = card.description ?? ''
  RIDER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RIDER_RE.exec(desc)) !== null) {
    const cond = (m[1] ?? '').trim()
    const effect = m[2] ?? ''
    const verdict = evalCondition(cond, combat, target)
    if (verdict === false) continue
    const suffix = verdict === 'unknown' ? ` if ${cond}` : ''

    const dmg = effect.match(RIDER_DAMAGE_RE)
    if (dmg) {
      out.damage += Number(dmg[1])
      out.rationale.push(`+${dmg[1]} damage${suffix}`)
    }
    const blk = effect.match(RIDER_BLOCK_RE)
    if (blk) {
      out.block += Number(blk[1])
      out.rationale.push(`+${blk[1]} block${suffix}`)
    }
    const drw = effect.match(RIDER_DRAW_RE)
    if (drw) {
      const n = drw[1] ? Number(drw[1]) : 1
      out.draw += n
      out.rationale.push(`Draws ${n}${suffix}`)
    }
  }
  return out
}

/**
 * Resolve a rider's condition from state. Returns `true`/`false` when we can
 * read it, or `'unknown'` for conditions a single snapshot can't answer (most
 * notably "cards played this turn"), so the caller can still credit-but-flag.
 */
function evalCondition(
  cond: string,
  combat: CombatState,
  target: EnemyState | null
): boolean | 'unknown' {
  const c = cond.toLowerCase()
  const targetHas = (s: string): boolean =>
    target?.status.some((p) => p.name.toLowerCase().includes(s)) ?? false

  // Enemy debuffs that gate "deal more" riders.
  if (/vulnerab/.test(c)) return targetHas('vulnerab')
  if (/\bweak/.test(c)) return targetHas('weak')
  if (/\bpoison/.test(c)) return targetHas('poison')
  // Your own Block state.
  if (/no block/.test(c)) return combat.block === 0
  if (/have block|any block/.test(c)) return combat.block > 0
  // Defect orbs.
  if (/\borb/.test(c)) return combat.orbs.length > 0
  // Couldn't read it (e.g. "played fewer than 3 cards this turn").
  return 'unknown'
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
  // Disambiguate enemies that share a name (two Corpse Slugs) by board position
  // (#1, #2 … left→right) so the player can tell which one is attacking.
  const labels = enemyLabels(enemies)

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
      name: labels.get(e.entityId) ?? e.name,
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
