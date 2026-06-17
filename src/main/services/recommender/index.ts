import type {
  CardInstance,
  EventChoice,
  NormalizedState,
  RelicInstance
} from '../../types/gameState'
import type { TierBundle } from '../../types/tierData'
import type { BuildEntry } from '../../types/compendium'
import type { ShopAdviceItemView } from '../../types/recommendation'
import { rankCardOffers, CardPickRanked } from './cardPick'
import { rankRelicOffers, RelicPickRanked } from './relicPick'
import { rankCombatPlays, CombatPlayResult } from './combatPlay'
import { rankShop } from './shopAdvisor'
import { detectBuild } from './buildMatch'

export type Recommendation =
  | { kind: 'cardPick'; ranked: CardPickRanked[]; canSkip: boolean }
  | { kind: 'relicPick'; ranked: RelicPickRanked[]; canSkip: boolean }
  | { kind: 'event'; eventName: string; choices: EventChoice[] }
  | { kind: 'combatPlay'; result: CombatPlayResult }
  | { kind: 'shopAdvice'; items: ShopAdviceItemView[]; gold: number }
  | { kind: 'none' }

export interface Recommender {
  recommend(state: NormalizedState): Recommendation
  setBundle(bundle: TierBundle): void
  /** The deck fetched from the compendium endpoint, or null when unknown. */
  setDeck(deck: CardInstance[] | null): void
  /** Curated build guides used to bias card / relic picks. */
  setBuilds(builds: BuildEntry[]): void
  /** Whether to adjust enemy intent damage by Weak / Strength. */
  setApplyIntentModifiers(on: boolean): void
}

export function createRecommender(
  initialBundle: TierBundle,
  initialBuilds: BuildEntry[] = []
): Recommender {
  let bundle = initialBundle
  let builds = initialBuilds
  let deck: CardInstance[] | null = null
  let applyIntentModifiers = false

  return {
    setBundle(next: TierBundle): void {
      bundle = next
    },

    setDeck(next: CardInstance[] | null): void {
      deck = next
    },

    setBuilds(next: BuildEntry[]): void {
      builds = next
    },

    setApplyIntentModifiers(next: boolean): void {
      applyIntentModifiers = next
    },

    recommend(state: NormalizedState): Recommendation {
      const { run, screen } = state
      if (!run) return { kind: 'none' }

      switch (screen.kind) {
        case 'cardReward': {
          const resolvedDeck = deck ?? deriveDeckEstimate(run, screen.offers)
          const archetypeTags = collectArchetypeTags(deck, run.relics, bundle)
          const matchedBuild = detectBuild(
            run.character,
            resolvedDeck,
            run.relics.map((r) => r.id),
            builds,
            archetypeTags
          )
          const ranked = rankCardOffers(
            screen.offers,
            {
              character: run.character,
              deck: resolvedDeck,
              act: run.act,
              floor: run.floor,
              matchedBuild
            },
            bundle
          )
          return { kind: 'cardPick', ranked, canSkip: screen.canSkip }
        }
        case 'relicReward': {
          const archetypeTags = collectArchetypeTags(deck, run.relics, bundle)
          const matchedBuild = detectBuild(
            run.character,
            deck ?? [],
            run.relics.map((r) => r.id),
            builds,
            archetypeTags
          )
          const ranked = rankRelicOffers(
            screen.offers,
            {
              character: run.character,
              ownedRelicIds: run.relics.map((r) => r.id),
              archetypeTags,
              act: run.act,
              matchedBuild
            },
            bundle,
            screen.canSkip
          )
          return { kind: 'relicPick', ranked, canSkip: screen.canSkip }
        }
        case 'event': {
          return {
            kind: 'event',
            eventName: screen.eventName,
            choices: screen.choices
          }
        }
        case 'shop': {
          const resolvedDeck = deck ?? []
          const archetypeTags = collectArchetypeTags(deck, run.relics, bundle)
          const matchedBuild = detectBuild(
            run.character,
            resolvedDeck,
            run.relics.map((r) => r.id),
            builds,
            archetypeTags
          )
          const { items, gold } = rankShop(
            screen,
            {
              character: run.character,
              deck: resolvedDeck,
              ownedRelicIds: run.relics.map((r) => r.id),
              archetypeTags,
              matchedBuild,
              act: run.act,
              floor: run.floor,
              gold: run.gold
            },
            bundle
          )
          return { kind: 'shopAdvice', items, gold }
        }
        case 'combat': {
          const result = rankCombatPlays(screen.combat, bundle, {
            applyIntentModifiers
          })
          return { kind: 'combatPlay', result }
        }
        default:
          return { kind: 'none' }
      }
    }
  }
}

/**
 * Fallback for when the compendium deck fetch hasn't resolved (or failed):
 * we have no deck context, so synergy/dilution fall back to neutral. Once
 * `setDeck()` has populated the real deck this is never reached.
 */
function deriveDeckEstimate(
  _run: NonNullable<NormalizedState['run']>,
  _offers: CardInstance[]
): CardInstance[] {
  return []
}

/**
 * Archetype tags that define the current run — collected from both the deck
 * (when known) and owned relics. Used to bias relic picks toward the build.
 */
function collectArchetypeTags(
  deck: CardInstance[] | null,
  relics: RelicInstance[],
  bundle: TierBundle
): Set<string> {
  const tags = new Set<string>()
  for (const card of deck ?? []) {
    const entry = bundle.cards[card.id]
    if (entry) for (const t of entry.tags) tags.add(t)
  }
  for (const r of relics) {
    const entry = bundle.relics[r.id]
    if (entry) for (const t of entry.tags) tags.add(t)
  }
  return tags
}
