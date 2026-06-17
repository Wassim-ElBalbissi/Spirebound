import type {
  CardInstance,
  EventChoice,
  NormalizedState,
  RelicInstance
} from '../../types/gameState'
import type { TierBundle } from '../../types/tierData'
import { rankCardOffers, CardPickRanked } from './cardPick'
import { rankRelicOffers, RelicPickRanked } from './relicPick'
import { rankPaths, MapPath } from './mapPath'
import { rankCombatPlays, CombatPlayResult } from './combatPlay'

export type Recommendation =
  | { kind: 'cardPick'; ranked: CardPickRanked[]; canSkip: boolean }
  | { kind: 'relicPick'; ranked: RelicPickRanked[]; canSkip: boolean }
  | {
      kind: 'mapPath'
      paths: MapPath[]
    }
  | { kind: 'event'; eventName: string; choices: EventChoice[] }
  | { kind: 'combatPlay'; result: CombatPlayResult }
  | { kind: 'none' }

export interface Recommender {
  recommend(state: NormalizedState): Recommendation
  setBundle(bundle: TierBundle): void
}

export function createRecommender(initialBundle: TierBundle): Recommender {
  let bundle = initialBundle

  return {
    setBundle(next: TierBundle): void {
      bundle = next
    },

    recommend(state: NormalizedState): Recommendation {
      const { run, screen } = state
      if (!run) return { kind: 'none' }

      switch (screen.kind) {
        case 'cardReward': {
          const ranked = rankCardOffers(
            screen.offers,
            {
              character: run.character,
              deck: deriveDeckEstimate(run, screen.offers),
              act: run.act,
              floor: run.floor
            },
            bundle
          )
          return { kind: 'cardPick', ranked, canSkip: screen.canSkip }
        }
        case 'relicReward': {
          const ranked = rankRelicOffers(
            screen.offers,
            {
              character: run.character,
              ownedRelicIds: run.relics.map((r) => r.id),
              archetypeTags: collectDeckTags(run.relics, bundle),
              act: run.act
            },
            bundle,
            screen.canSkip
          )
          return { kind: 'relicPick', ranked, canSkip: screen.canSkip }
        }
        case 'map': {
          const paths = rankPaths(run)
          return { kind: 'mapPath', paths }
        }
        case 'event': {
          return {
            kind: 'event',
            eventName: screen.eventName,
            choices: screen.choices
          }
        }
        case 'combat': {
          const result = rankCombatPlays(screen.combat, bundle)
          return { kind: 'combatPlay', result }
        }
        default:
          return { kind: 'none' }
      }
    }
  }
}

/**
 * The mod's run-state endpoint exposes the full deck only during combat.
 * Outside of combat we don't have it — that's an open question in the plan.
 * For now: estimate using just the offers as candidates (deck = []).
 * Milestone 5 will use the /api/v1/compendium current_run block to fill this in.
 */
function deriveDeckEstimate(
  _run: NonNullable<NormalizedState['run']>,
  _offers: CardInstance[]
): CardInstance[] {
  return []
}

function collectDeckTags(
  relics: RelicInstance[],
  bundle: TierBundle
): Set<string> {
  const tags = new Set<string>()
  for (const r of relics) {
    const entry = bundle.relics[r.id]
    if (entry) for (const t of entry.tags) tags.add(t)
  }
  return tags
}
