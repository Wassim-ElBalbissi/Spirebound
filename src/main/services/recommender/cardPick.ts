import type {
  CardInstance,
  Character,
  RunState
} from '../../types/gameState'
import type { CardTierEntry, TierBundle } from '../../types/tierData'
import { synergyScore } from './synergy'
import type { BuildMatch } from './buildMatch'

/** Cap on the build-fit bonus so it nudges without overriding tier quality. */
const BUILD_BONUS_CAP = 12
/** Scales the matched-build confidence (0..1) into bonus points. */
const BUILD_BONUS_K = 12

export interface CardPickWeights {
  alpha: number
  beta: number
  gamma: number
  delta: number
  epsilon: number
}

export const DEFAULT_WEIGHTS: CardPickWeights = {
  alpha: 25,
  beta: 15,
  gamma: 10,
  delta: 5,
  epsilon: 10
}

export interface CardPickRanked {
  /**
   * For real card offers, the offer index in the original list.
   * For the synthetic Skip option this is null.
   */
  offerIndex: number | null
  id: string
  name: string
  score: number
  breakdown: {
    winRateComponent: number
    synergy: number
    dilution: number
    redundancy: number
    earlyPower: number
    upgradeAttract: number
    buildBonus: number
    base: number
  }
  rationale: string[]
  /** Set when this card is a key card of the matched build (for deep-linking). */
  buildId?: string
  buildName?: string
}

export interface CardPickContext {
  character: Character
  /** Current deck (or best estimate). If unknown, use empty array. */
  deck: CardInstance[]
  act: number
  floor: number
  weights?: Partial<CardPickWeights>
  /** The build the run resembles, if any — boosts its key cards. */
  matchedBuild?: BuildMatch | null
}

export function rankCardOffers(
  offers: CardInstance[],
  ctx: CardPickContext,
  bundle: TierBundle
): CardPickRanked[] {
  const w = { ...DEFAULT_WEIGHTS, ...ctx.weights }
  const deckSize = ctx.deck.length
  const sweet = sweetDeckSize(ctx.act)
  const deckTagCounts = countDeckTags(ctx.deck, bundle)

  const dominantTag = topTag(ctx.character, deckTagCounts)

  const ranked: CardPickRanked[] = offers.map((offer, idx) => {
    const entry = bundle.cards[offer.id]
    const base = entry ? entry.blendedScore : neutralBaseScore(offer)

    const wrComponent = base // already 0..100
    const tags = entry?.tags ?? []

    const synergy = w.alpha * synergyScore(ctx.character, tags, deckTagCounts)
    const dilution = w.beta * dilutionPenalty(deckSize, sweet)
    const redundancy =
      w.gamma * redundancyPenalty(offer.id, ctx.deck, tags)
    const earlyPower = w.delta * earlyPowerBoost(entry, ctx.floor)
    const upgradeAttract =
      w.epsilon * upgradeAttractBoost(tags, dominantTag)

    const isKeyCard =
      ctx.matchedBuild?.build.keyCards?.includes(offer.id) ?? false
    const buildBonus = isKeyCard
      ? Math.min(BUILD_BONUS_CAP, (ctx.matchedBuild?.score ?? 0) * BUILD_BONUS_K)
      : 0

    const score =
      wrComponent +
      synergy -
      dilution -
      redundancy +
      earlyPower +
      upgradeAttract +
      buildBonus

    const rationale = buildRationale({
      entry,
      synergy,
      dilution,
      redundancy,
      earlyPower,
      upgradeAttract,
      buildBonus,
      buildName: ctx.matchedBuild?.build.name,
      dominantTag,
      deckSize,
      sweet
    })

    return {
      offerIndex: idx,
      id: offer.id,
      name: offer.name,
      score,
      breakdown: {
        winRateComponent: wrComponent,
        synergy,
        dilution,
        redundancy,
        earlyPower,
        upgradeAttract,
        buildBonus,
        base
      },
      rationale,
      buildId: isKeyCard ? ctx.matchedBuild?.build.id : undefined,
      buildName: isKeyCard ? ctx.matchedBuild?.build.name : undefined
    }
  })

  // Synthetic Skip option — dominates when bloated.
  const skipScore = 30 + 5 * Math.max(0, deckSize - sweet)
  ranked.push({
    offerIndex: null,
    id: '__SKIP__',
    name: 'Skip',
    score: skipScore,
    breakdown: {
      winRateComponent: 30,
      synergy: 0,
      dilution: 0,
      redundancy: 0,
      earlyPower: 0,
      upgradeAttract: skipScore - 30,
      buildBonus: 0,
      base: 30
    },
    rationale:
      deckSize > sweet
        ? [
            `Deck is bloated (${deckSize} > ideal ~${sweet} this act). Skipping preserves draw quality.`
          ]
        : ['Skip is a safe baseline when offers are weak.']
  })

  return ranked.sort((a, b) => b.score - a.score)
}

export function sweetDeckSize(act: number): number {
  return 15 + 2 * act
}

function neutralBaseScore(offer: CardInstance): number {
  // Without a tier-data entry, give upgraded cards a slight edge and
  // strikes/defends almost nothing — those don't appear in real card rewards
  // anyway, but the math should not crash on unknown ids.
  return offer.upgraded ? 50 : 40
}

function countDeckTags(
  deck: CardInstance[],
  bundle: TierBundle
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const card of deck) {
    const entry = bundle.cards[card.id]
    if (!entry) continue
    for (const tag of entry.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return counts
}

function topTag(
  character: Character,
  deckTagCounts: Map<string, number>
): string | null {
  let best: { tag: string; w: number } | null = null
  for (const [tag, n] of deckTagCounts) {
    const score = n
    if (!best || score > best.w) best = { tag, w: score }
  }
  return best?.tag ?? null
}

function dilutionPenalty(deckSize: number, sweet: number): number {
  return Math.max(0, deckSize - sweet) / 10
}

function redundancyPenalty(
  candidateId: string,
  deck: CardInstance[],
  candidateTags: string[]
): number {
  // Don't penalize stacking archetypes.
  const STACKING_TAGS = new Set(['poison', 'strength', 'focus', 'shiv'])
  if (candidateTags.some((t) => STACKING_TAGS.has(t))) return 0
  const dupes = deck.filter((c) => c.id === candidateId).length
  return 0.1 * dupes
}

function earlyPowerBoost(
  entry: CardTierEntry | undefined,
  floor: number
): number {
  if (!entry) return 0
  if (entry.rarity !== 'common') return 0
  const isEarlyPower =
    entry.tags.includes('strength') ||
    entry.tags.includes('vulnerable') ||
    entry.blendedScore >= 70
  if (!isEarlyPower) return 0
  return (Math.max(0, 50 - floor) / 50) * (entry.blendedScore / 100)
}

function upgradeAttractBoost(
  candidateTags: string[],
  dominantTag: string | null
): number {
  if (!dominantTag) return 0
  return candidateTags.includes(dominantTag) ? 1 : 0
}

function buildRationale(p: {
  entry: CardTierEntry | undefined
  synergy: number
  dilution: number
  redundancy: number
  earlyPower: number
  upgradeAttract: number
  buildBonus: number
  buildName?: string
  dominantTag: string | null
  deckSize: number
  sweet: number
}): string[] {
  const out: string[] = []
  if (p.entry) {
    out.push(`${p.entry.tier}-tier (${Math.round(p.entry.blendedScore)}/100).`)
  } else {
    out.push('No tier data — using neutral base score.')
  }
  if (p.buildBonus > 0 && p.buildName) {
    out.push(`Key card in your ${p.buildName} build.`)
  }
  if (p.synergy > 4) out.push(`Strong synergy with current deck.`)
  if (p.upgradeAttract > 0 && p.dominantTag) {
    out.push(`Fits your ${p.dominantTag} build.`)
  }
  if (p.dilution > 1) out.push(`Deck is bloated (${p.deckSize} > ~${p.sweet}).`)
  if (p.redundancy > 0) out.push(`You already own this card.`)
  if (p.earlyPower > 1) out.push(`Strong early-game power.`)
  return out
}

export function rankPickedOffer(
  ranked: CardPickRanked[]
): CardPickRanked | undefined {
  return ranked[0]
}
