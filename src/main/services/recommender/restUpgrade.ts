import type { CardInstance } from '../../types/gameState'
import type { CardTierEntry, TierBundle } from '../../types/tierData'
import type {
  TierLetter,
  UpgradeRankedView
} from '../../types/recommendation'
import type { BuildMatch } from './buildMatch'

export interface UpgradeContext {
  /** The build the run resembles, if any — its key cards rank first. */
  matchedBuild?: BuildMatch | null
}

/** The headline call at a rest site: heal, or bank a permanent upgrade. */
export interface RestAction {
  recommended: 'rest' | 'smith'
  hp: number
  maxHp: number
  /** Heal the Rest option grants (30% max HP by default). */
  healAmount: number
  /** HP you'd actually recover — capped by how much you're missing. */
  effectiveHeal: number
  reason: string
  /** Resting is offered and useful. */
  canRest: boolean
  /** Smithing is offered and there's something worth upgrading. */
  canSmith: boolean
}

export interface RestDecisionInput {
  hp: number
  maxHp: number
  healAmount: number
  /** Rest/heal option is present and enabled. */
  canRest: boolean
  /** Smith option is present and enabled. */
  canSmith: boolean
  /** Number of upgradeable cards we can see (0 when the deck is known-empty). */
  upgradeTargets: number
  /** False when the deck hasn't resolved — don't infer "nothing to upgrade". */
  deckKnown: boolean
  /** The immediate next room is an Elite or Boss. */
  dangerAhead: boolean
}

/**
 * Decide whether to Rest (heal) or Smith (upgrade) at a campfire, primarily on
 * HP. Low HP — or a tough fight ahead while not full — favours healing; a
 * healthy bar favours banking a permanent upgrade. Availability of each option
 * (and whether anything is left to upgrade) gates the choice.
 */
export function decideRestAction(input: RestDecisionInput): RestAction {
  const { hp, maxHp, healAmount, dangerAhead } = input
  const hpPct = maxHp > 0 ? hp / maxHp : 1
  const pct = Math.round(hpPct * 100)
  const missing = Math.max(0, maxHp - hp)
  const effectiveHeal = Math.min(healAmount, missing)
  // Smithing is only worthwhile if it's offered AND (the deck is unknown, so we
  // can't rule it out, OR we can see something to upgrade).
  const smithUseful = input.canSmith && (!input.deckKnown || input.upgradeTargets > 0)

  let recommended: 'rest' | 'smith'
  let reason: string

  if (input.canRest && !smithUseful) {
    recommended = 'rest'
    reason =
      input.deckKnown && input.upgradeTargets === 0
        ? 'Nothing left to upgrade — take the heal.'
        : 'Smithing unavailable — rest up.'
  } else if (smithUseful && !input.canRest) {
    recommended = 'smith'
    reason = 'Resting unavailable — bank a permanent upgrade.'
  } else if (hpPct <= 0.3) {
    recommended = 'rest'
    reason = `Critically low (${hp}/${maxHp}) — heal ${effectiveHeal} before you move on.`
  } else if (hpPct <= 0.5 || (dangerAhead && hpPct < 0.7)) {
    recommended = 'rest'
    reason = dangerAhead
      ? `Tough fight ahead at ${pct}% HP — heal ${effectiveHeal} first.`
      : `Low at ${pct}% HP — heal ${effectiveHeal} before risking more.`
  } else if (hpPct >= 0.9) {
    recommended = 'smith'
    reason = `Near full — the heal would be wasted. Bank an upgrade instead.`
  } else {
    recommended = 'smith'
    reason = `Healthy at ${pct}% HP — bank a permanent upgrade.`
  }

  return {
    recommended,
    hp,
    maxHp,
    healAmount,
    effectiveHeal,
    reason,
    canRest: input.canRest,
    canSmith: smithUseful
  }
}

/** Heal granted by a Rest option: parse "(24)" / "30%", else 30% of max HP. */
export function parseHealAmount(
  options: { id: string; name: string; description: string }[],
  maxHp: number
): number {
  const heal = options.find(
    (o) => /heal|rest/i.test(o.id) || /rest/i.test(o.name)
  )
  const desc = heal?.description ?? ''
  const paren = desc.match(/\((\d+)\)/)
  if (paren) return Number(paren[1])
  const pct = desc.match(/(\d+)\s*%/)
  if (pct) return Math.round((Number(pct[1]) / 100) * maxHp)
  return Math.round(0.3 * maxHp)
}

/**
 * Rank the deck's upgradeable cards by how worthwhile it is to smith them at a
 * rest site. Priority blends tier quality, how much the card gains on upgrade,
 * whether it defines the matched build, and card type — while pushing basic
 * Strikes/Defends to the bottom.
 */
export function rankUpgrades(
  deck: CardInstance[],
  ctx: UpgradeContext,
  bundle: TierBundle
): UpgradeRankedView[] {
  // Only un-upgraded cards can be smithed; collapse duplicates to one row.
  const byId = new Map<string, { card: CardInstance; copies: number }>()
  for (const c of deck) {
    if (c.upgraded) continue
    const existing = byId.get(c.id)
    if (existing) existing.copies += 1
    else byId.set(c.id, { card: c, copies: 1 })
  }

  const keyCards = new Set(ctx.matchedBuild?.build.keyCards ?? [])
  const buildName = ctx.matchedBuild?.build.name

  const ranked: UpgradeRankedView[] = [...byId.values()].map(
    ({ card, copies }) => {
      const entry = bundle.cards[card.id]
      const rationale: string[] = []
      let score = entry ? entry.blendedScore : 45
      if (entry) rationale.push(`${entry.tier}-tier card.`)

      const buildKey = keyCards.has(card.id)
      if (buildKey && buildName) {
        score += 25
        rationale.push(`Key card in your ${buildName} build.`)
      }

      const impact = upgradeImpact(entry)
      if (impact >= 4) {
        score += impact
        rationale.push('Big upgrade payoff.')
      }

      if (entry?.type === 'Power') {
        score += 8
        rationale.push('Power — upgrading it pays off all fight.')
      }

      if (isBasic(card)) {
        score -= 25
        rationale.push('Basic card — low upgrade value.')
      }

      if (copies > 1) {
        score += 2
        rationale.push(`You run ${copies} copies.`)
      }

      return {
        id: card.id,
        name: card.name,
        score,
        rationale,
        buildKey,
        copies,
        tier: (entry?.tier as TierLetter | undefined) ?? null,
        imageUrl: entry?.imageUrl
      }
    }
  )

  return ranked.sort((a, b) => b.score - a.score).slice(0, 6)
}

/** Rough magnitude of what a card gains on upgrade, from its `upgrade` deltas. */
function upgradeImpact(entry: CardTierEntry | undefined): number {
  if (!entry?.upgrade) return 0
  let impact = 0
  for (const v of Object.values(entry.upgrade)) {
    if (typeof v === 'number') impact += Math.abs(v)
    else impact += 2 // a keyword/effect change (Innate, cost ↓, added Retain…)
  }
  return Math.min(impact, 12)
}

function isBasic(card: CardInstance): boolean {
  return (
    /^STRIKE|^DEFEND/i.test(card.id) || /^(strike|defend)$/i.test(card.name)
  )
}
