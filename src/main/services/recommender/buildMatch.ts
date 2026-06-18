import type { CardInstance, Character } from '../../types/gameState'
import type { BuildEntry } from '../../types/compendium'

export interface BuildMatch {
  build: BuildEntry
  /** 0..1 confidence that the run is committed to this build. */
  score: number
  /** Offered/owned card ids that are key cards of the build. */
  cardOverlap: Set<string>
  /** Owned relic ids that are key relics of the build. */
  relicOverlap: Set<string>
}

/**
 * Below this deck size the card-overlap signal is noise (the deck is still
 * mostly starters), so we lean on relics + archetype tags instead.
 */
const MIN_DECK_FOR_CARD_SIGNAL = 8
/** Confidence required to act on a match — higher when the deck is unknown. */
const THRESHOLD_WITH_DECK = 0.3
const THRESHOLD_WITHOUT_DECK = 0.45
/** If the runner-up is this close, the archetype is ambiguous — discount it. */
const AMBIGUITY_EPSILON = 0.05
/**
 * Orb-color tags that distinguish otherwise-identical orb builds (e.g. Defect's
 * lightning / frost / dark all share `orb-gen` + `focus`). When two such builds
 * tie, the deck's dominant color breaks the tie instead of discounting both.
 */
const ORB_COLOR_TAGS = ['lightning', 'frost', 'dark', 'plasma']

/**
 * Detect which curated build (if any) the current run most resembles, so card /
 * relic advice can nudge toward the cards that actually advance that plan.
 *
 * Confidence blends three signals — deck∩keyCards, relics∩keyRelics, and
 * deckTags∩archetypeTags — and only returns a match above a threshold. Early in
 * a run the deck signal is suppressed (everything "weakly matches" a starter
 * deck), and a near-tie between two builds discounts the winner.
 */
export function detectBuild(
  character: Character,
  deck: CardInstance[],
  ownedRelicIds: string[],
  builds: BuildEntry[],
  deckTags: Set<string>,
  /** Tag counts in the deck — used to break orb-color ties (lightning vs frost). */
  deckTagCounts?: Map<string, number>
): BuildMatch | null {
  const candidates = builds.filter((b) => b.character === character)
  if (candidates.length === 0) return null

  const deckIds = new Set(deck.map((c) => c.id))
  const relicIds = new Set(ownedRelicIds)
  const useCardSignal = deck.length >= MIN_DECK_FOR_CARD_SIGNAL

  const scored = candidates
    .map((build) => scoreBuild(build, deckIds, relicIds, deckTags, useCardSignal))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  const threshold = useCardSignal ? THRESHOLD_WITH_DECK : THRESHOLD_WITHOUT_DECK
  if (!best || best.score < threshold) return null

  const runnerUp = scored[1]
  if (runnerUp && best.score - runnerUp.score < AMBIGUITY_EPSILON) {
    // Two orb builds tied? The deck's dominant orb color decides — commit fully.
    const decided = breakOrbColorTie(best, runnerUp, deckTagCounts)
    if (decided) return decided
    // Otherwise genuinely ambiguous — keep the pick but soften the confidence.
    return { ...best, score: best.score * 0.75 }
  }
  return best
}

/**
 * When the two front-runners are orb builds distinguished only by color, pick
 * the one whose color the deck actually leans into. Returns null when the tie
 * isn't a color tie (no counts, same color, or equal counts).
 */
function breakOrbColorTie(
  a: BuildMatch,
  b: BuildMatch,
  counts?: Map<string, number>
): BuildMatch | null {
  if (!counts) return null
  const ca = orbColorOf(a.build)
  const cb = orbColorOf(b.build)
  if (!ca || !cb || ca === cb) return null
  const na = counts.get(ca) ?? 0
  const nb = counts.get(cb) ?? 0
  if (na === nb) return null
  return na > nb ? a : b
}

function orbColorOf(build: BuildEntry): string | null {
  const tags = build.archetypeTags ?? []
  return ORB_COLOR_TAGS.find((c) => tags.includes(c)) ?? null
}

function scoreBuild(
  build: BuildEntry,
  deckIds: Set<string>,
  relicIds: Set<string>,
  deckTags: Set<string>,
  useCardSignal: boolean
): BuildMatch {
  const keyCards = build.keyCards ?? []
  const keyRelics = build.keyRelics ?? []
  const archetypeTags = build.archetypeTags ?? []

  const cardOverlap = intersect(deckIds, keyCards)
  const relicOverlap = intersect(relicIds, keyRelics)
  const tagOverlap = intersect(deckTags, archetypeTags)

  const cardSignal = keyCards.length ? cardOverlap.size / keyCards.length : 0
  const relicSignal = keyRelics.length ? relicOverlap.size / keyRelics.length : 0
  const tagSignal = archetypeTags.length ? tagOverlap.size / archetypeTags.length : 0

  // Card commitment is the strongest signal when the deck is known; otherwise
  // redistribute its weight onto relics + tags.
  const score = useCardSignal
    ? 0.5 * cardSignal + 0.3 * relicSignal + 0.2 * tagSignal
    : 0.6 * relicSignal + 0.4 * tagSignal

  return { build, score, cardOverlap, relicOverlap }
}

function intersect(set: Set<string>, ids: string[]): Set<string> {
  const out = new Set<string>()
  for (const id of ids) if (set.has(id)) out.add(id)
  return out
}
