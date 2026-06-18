import type {
  CardInstance,
  NormalizedState,
  RelicInstance
} from '../../types/gameState'
import type { TierBundle } from '../../types/tierData'
import type { BuildEntry } from '../../types/compendium'
import type {
  CardPickRankedView,
  MatchedBuildView,
  ShopAdviceItemView,
  UpgradeRankedView
} from '../../types/recommendation'
import { rankCardOffers, CardPickRanked } from './cardPick'
import { rankHandSelect } from './cardChoiceAdvisor'
import { rankRelicOffers, RelicPickRanked } from './relicPick'
import { rankCombatPlays, CombatPlayResult } from './combatPlay'
import { rankEventChoices, EventChoiceRanked } from './eventAdvisor'
import { rankMapPath, MapPathResult } from './mapPath'
import { rankShop } from './shopAdvisor'
import {
  rankUpgrades,
  decideRestAction,
  parseHealAmount,
  RestAction
} from './restUpgrade'
import { detectBuild, BuildMatch } from './buildMatch'
import { deckTagCounts } from './synergy'

export type Recommendation =
  | {
      kind: 'cardPick'
      ranked: CardPickRanked[]
      canSkip: boolean
      build: MatchedBuildView | null
    }
  | {
      kind: 'relicPick'
      ranked: RelicPickRanked[]
      canSkip: boolean
      build: MatchedBuildView | null
    }
  | { kind: 'event'; eventName: string; choices: EventChoiceRanked[] }
  | { kind: 'combatPlay'; result: CombatPlayResult }
  | {
      kind: 'shopAdvice'
      items: ShopAdviceItemView[]
      gold: number
      build: MatchedBuildView | null
    }
  | { kind: 'mapPath'; result: MapPathResult }
  | {
      kind: 'cardSelect'
      title: string
      verb: string
      ranked: CardPickRankedView[]
      canSkip: boolean
    }
  | {
      kind: 'restUpgrade'
      action: RestAction
      cards: UpgradeRankedView[]
      build: MatchedBuildView | null
    }
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
          const archetypeTags = collectArchetypeTags(resolvedDeck, run.relics, bundle)
          const matchedBuild = detectBuild(
            run.character,
            resolvedDeck,
            run.relics.map((r) => r.id),
            builds,
            archetypeTags,
            deckTagCounts(resolvedDeck, bundle)
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
          return {
            kind: 'cardPick',
            ranked,
            canSkip: screen.canSkip,
            build: toBuildSummary(matchedBuild)
          }
        }
        case 'relicReward': {
          const resolvedDeck = deck ?? []
          const archetypeTags = collectArchetypeTags(resolvedDeck, run.relics, bundle)
          const matchedBuild = detectBuild(
            run.character,
            resolvedDeck,
            run.relics.map((r) => r.id),
            builds,
            archetypeTags,
            deckTagCounts(resolvedDeck, bundle)
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
          return {
            kind: 'relicPick',
            ranked,
            canSkip: screen.canSkip,
            build: toBuildSummary(matchedBuild)
          }
        }
        case 'event': {
          const ranked = rankEventChoices(screen.choices, {
            hp: run.hp,
            maxHp: run.maxHp,
            act: run.act,
            floor: run.floor,
            deckSize: deck?.length ?? 0,
            gold: run.gold
          })
          return {
            kind: 'event',
            eventName: screen.eventName,
            choices: ranked
          }
        }
        case 'shop': {
          const resolvedDeck = deck ?? []
          const archetypeTags = collectArchetypeTags(resolvedDeck, run.relics, bundle)
          const matchedBuild = detectBuild(
            run.character,
            resolvedDeck,
            run.relics.map((r) => r.id),
            builds,
            archetypeTags,
            deckTagCounts(resolvedDeck, bundle)
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
          return {
            kind: 'shopAdvice',
            items,
            gold,
            build: toBuildSummary(matchedBuild)
          }
        }
        case 'combat': {
          const result = rankCombatPlays(screen.combat, bundle, {
            applyIntentModifiers
          })
          return { kind: 'combatPlay', result }
        }
        case 'map': {
          if (!run.map) return { kind: 'none' }
          const result = rankMapPath(run.map, {
            hp: run.hp,
            maxHp: run.maxHp
          })
          return result ? { kind: 'mapPath', result } : { kind: 'none' }
        }
        case 'handSelect': {
          // In-combat "choose a card to Discard/Exhaust" (or a fetch). Ranked
          // against the live board so #1 is the card to pick.
          const ranked = rankHandSelect(
            screen.cards,
            screen.combat,
            screen.action,
            bundle
          )
          const verb =
            screen.action === 'exhaust'
              ? 'Exhaust'
              : screen.action === 'discard'
                ? 'Discard'
                : 'Pick'
          return {
            kind: 'cardSelect',
            title: screen.prompt || `${verb} a card`,
            verb,
            ranked,
            canSkip: screen.canSkip
          }
        }
        case 'cardSelect': {
          // Out-of-combat "choose a card" (Discovery potion, transform, etc.).
          // Ranked by deck-fit quality; removal flips to worst-first.
          const resolvedDeck = deck ?? []
          const archetypeTags = collectArchetypeTags(
            resolvedDeck,
            run.relics,
            bundle
          )
          const matchedBuild = detectBuild(
            run.character,
            resolvedDeck,
            run.relics.map((r) => r.id),
            builds,
            archetypeTags,
            deckTagCounts(resolvedDeck, bundle)
          )
          const scored = rankCardOffers(
            screen.cards,
            {
              character: run.character,
              deck: resolvedDeck,
              act: run.act,
              floor: run.floor,
              matchedBuild
            },
            bundle
          ).filter((r) => r.id !== '__SKIP__') // a forced pick from these candidates
          const ranked: CardPickRankedView[] =
            screen.mode === 'remove'
              ? [...scored].reverse().map((r) => ({
                  offerIndex: r.offerIndex,
                  id: r.id,
                  name: r.name,
                  score: r.score,
                  rationale: ['Lowest-value card — best to remove.'],
                  buildId: r.buildId,
                  buildName: r.buildName
                }))
              : scored
          return {
            kind: 'cardSelect',
            title: screen.prompt || (screen.mode === 'remove' ? 'Remove a card' : 'Add a card'),
            verb: screen.mode === 'remove' ? 'Remove' : 'Add',
            ranked,
            canSkip: screen.canSkip
          }
        }
        case 'rest': {
          const resolvedDeck = deck ?? []
          const archetypeTags = collectArchetypeTags(
            resolvedDeck,
            run.relics,
            bundle
          )
          const matchedBuild = detectBuild(
            run.character,
            resolvedDeck,
            run.relics.map((r) => r.id),
            builds,
            archetypeTags,
            deckTagCounts(resolvedDeck, bundle)
          )
          const cards = rankUpgrades(resolvedDeck, { matchedBuild }, bundle)
          const restOpt = screen.options.find(
            (o) => /heal|rest/i.test(o.id) || /rest/i.test(o.name)
          )
          const smithOpt = screen.options.find(
            (o) => /smith/i.test(o.id) || /smith|upgrade/i.test(o.name)
          )
          const action = decideRestAction({
            hp: run.hp,
            maxHp: run.maxHp,
            healAmount: parseHealAmount(screen.options, run.maxHp),
            // Options default to available when the mod doesn't enumerate them.
            canRest: restOpt ? restOpt.enabled : true,
            canSmith: smithOpt ? smithOpt.enabled : true,
            upgradeTargets: cards.length,
            deckKnown: run.deckKnown,
            dangerAhead: nextRoomIsDangerous(run.map)
          })
          return {
            kind: 'restUpgrade',
            action,
            cards,
            build: toBuildSummary(matchedBuild)
          }
        }
        case 'upgradeSelect': {
          // The Smith screen gives us the full upgradeable deck directly.
          const archetypeTags = collectArchetypeTags(
            screen.cards,
            run.relics,
            bundle
          )
          const matchedBuild = detectBuild(
            run.character,
            screen.cards,
            run.relics.map((r) => r.id),
            builds,
            archetypeTags,
            deckTagCounts(screen.cards, bundle)
          )
          const cards = rankUpgrades(screen.cards, { matchedBuild }, bundle)
          // On the Smith screen the choice is already made — just point at the
          // best upgrade.
          const action: RestAction = {
            recommended: 'smith',
            hp: run.hp,
            maxHp: run.maxHp,
            healAmount: Math.round(0.3 * run.maxHp),
            effectiveHeal: Math.min(
              Math.round(0.3 * run.maxHp),
              Math.max(0, run.maxHp - run.hp)
            ),
            reason: 'Upgrade your highest-priority card.',
            canRest: false,
            canSmith: cards.length > 0
          }
          return {
            kind: 'restUpgrade',
            action,
            cards,
            build: toBuildSummary(matchedBuild)
          }
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

/** True when any immediate next room on the map is an Elite or Boss. */
function nextRoomIsDangerous(
  map: NonNullable<NormalizedState['run']>['map']
): boolean {
  if (!map) return false
  return map.nextOptionIds.some((id) => {
    const node = map.nodes.find((n) => n.id === id)
    return node?.room === 'elite' || node?.room === 'boss'
  })
}

/** Compact, serializable view of the matched build for the overlay banner. */
function toBuildSummary(match: BuildMatch | null): MatchedBuildView | null {
  if (!match) return null
  return {
    id: match.build.id,
    name: match.build.name,
    tags: match.build.archetypeTags ?? [],
    confidence: match.score
  }
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
  for (const t of deckTagCounts(deck ?? [], bundle).keys()) tags.add(t)
  for (const r of relics) {
    const entry = bundle.relics[r.id]
    if (entry) for (const t of entry.tags) tags.add(t)
  }
  return tags
}
