import type { Character, RelicInstance } from '../../types/gameState'
import type { RelicTierEntry, TierBundle } from '../../types/tierData'

export interface RelicPickRanked {
  offerIndex: number | null
  id: string
  name: string
  score: number
  rationale: string[]
}

export interface RelicPickContext {
  character: Character
  ownedRelicIds: string[]
  archetypeTags: Set<string>
  act: number
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
      rationale
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
