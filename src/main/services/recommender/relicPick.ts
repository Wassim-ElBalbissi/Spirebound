import type { Character, RelicInstance } from '../../types/gameState'
import type { RelicTierEntry, TierBundle } from '../../types/tierData'
import type { BuildMatch } from './buildMatch'

/** Cap on the build-fit bonus for a key relic of the matched build. */
const BUILD_BONUS_CAP = 10
const BUILD_BONUS_K = 10

export interface RelicPickRanked {
  offerIndex: number | null
  id: string
  name: string
  score: number
  rationale: string[]
  /** Set when this relic is a key relic of the matched build. */
  buildId?: string
  buildName?: string
}

export interface RelicPickContext {
  character: Character
  ownedRelicIds: string[]
  archetypeTags: Set<string>
  act: number
  /** The build the run resembles, if any — boosts its key relics. */
  matchedBuild?: BuildMatch | null
}

export function rankRelicOffers(
  offers: RelicInstance[],
  ctx: RelicPickContext,
  bundle: TierBundle,
  canSkip = false
): RelicPickRanked[] {
  const ranked: RelicPickRanked[] = offers.map((relic, idx) => {
    const entry = bundle.relics[relic.id]
    const base = entry ? entry.blendedScore : 50
    let score = base
    const rationale: string[] = entry
      ? [`${entry.tier}-tier (${Math.round(entry.blendedScore)}/100).`]
      : ['No tier data — neutral score.']

    const isKeyRelic =
      ctx.matchedBuild?.build.keyRelics?.includes(relic.id) ?? false
    if (isKeyRelic && ctx.matchedBuild) {
      const bonus = Math.min(BUILD_BONUS_CAP, ctx.matchedBuild.score * BUILD_BONUS_K)
      score += bonus
      rationale.push(`Key relic in your ${ctx.matchedBuild.build.name} build.`)
    }

    if (entry) {
      score += buildFit(entry, ctx.archetypeTags, rationale)
      score += earlyMult(entry, ctx.act, rationale)
      score -= antiSynergy(entry, ctx.ownedRelicIds, rationale)
    }

    return {
      offerIndex: idx,
      id: relic.id,
      name: relic.name,
      score,
      rationale,
      buildId: isKeyRelic ? ctx.matchedBuild?.build.id : undefined,
      buildName: isKeyRelic ? ctx.matchedBuild?.build.name : undefined
    }
  })

  if (canSkip) {
    ranked.push({
      offerIndex: null,
      id: '__SKIP__',
      name: 'Skip',
      score: 30,
      rationale: ['Baseline; almost always pick something.']
    })
  }

  return ranked.sort((a, b) => b.score - a.score)
}

function buildFit(
  entry: RelicTierEntry,
  archetypeTags: Set<string>,
  rationale: string[]
): number {
  const overlap = entry.tags.filter((t) => archetypeTags.has(t))
  if (overlap.length === 0) return 0
  rationale.push(`Fits your build (${overlap.join(', ')}).`)
  return 8 * overlap.length
}

function earlyMult(
  entry: RelicTierEntry,
  act: number,
  rationale: string[]
): number {
  if (act === 1 && entry.tags.includes('elite-farm')) {
    rationale.push('Scales hard from act-1 elites.')
    return 8
  }
  if (act === 3 && entry.tags.includes('burst')) {
    rationale.push('Act-3 burst value.')
    return 6
  }
  return 0
}

function antiSynergy(
  entry: RelicTierEntry,
  ownedRelicIds: string[],
  rationale: string[]
): number {
  if (entry.tags.includes('anti-potion') && ownedRelicIds.includes('WHITE_BEAST_STATUE')) {
    rationale.push('Conflicts with White Beast Statue.')
    return 12
  }
  return 0
}
