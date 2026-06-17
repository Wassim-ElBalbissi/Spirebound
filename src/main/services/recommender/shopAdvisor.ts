import type { CardInstance, Character, Screen } from '../../types/gameState'
import type { TierBundle } from '../../types/tierData'
import type { ShopAdviceItemView } from '../../types/recommendation'
import type { BuildMatch } from './buildMatch'
import { rankCardOffers } from './cardPick'
import { rankRelicOffers } from './relicPick'

type ShopScreen = Extract<Screen, { kind: 'shop' }>

export interface ShopContext {
  character: Character
  deck: CardInstance[]
  ownedRelicIds: string[]
  archetypeTags: Set<string>
  matchedBuild?: BuildMatch | null
  act: number
  floor: number
  gold: number
}

export interface ShopAdviceResult {
  items: ShopAdviceItemView[]
  gold: number
}

/** Below this intrinsic quality, value-per-gold shouldn't float an item to the top. */
const QUALITY_FLOOR = 55
/** Save-up suggestions only for genuinely strong, nearly-affordable items. */
const SAVE_UP_QUALITY = 70
const SAVE_UP_GOLD_FACTOR = 1.5
/** Flat baseline for potions — no potion tier data, so this is low-fidelity. */
const POTION_BASELINE = 45

/**
 * Ranks everything on offer in a shop by value-per-gold, reusing the card and
 * relic scorers so shop advice inherits deck synergy and build-fit for free.
 *
 * Affordability is layered on top: affordable + quality items lead (sorted by
 * value-per-gold), then other affordable items, then "save up for" suggestions,
 * then the rest. The quality floor stops a cheap junk card from out-ranking a
 * build-defining relic just because it costs less.
 */
export function rankShop(
  shop: ShopScreen,
  ctx: ShopContext,
  bundle: TierBundle
): ShopAdviceResult {
  const items: ShopAdviceItemView[] = []

  const cardRanks = rankCardOffers(
    shop.cards,
    {
      character: ctx.character,
      deck: ctx.deck,
      act: ctx.act,
      floor: ctx.floor,
      matchedBuild: ctx.matchedBuild
    },
    bundle
  )
  for (const r of cardRanks) {
    if (r.offerIndex === null) continue // skip the synthetic Skip option
    const offer = shop.cards[r.offerIndex]
    if (!offer) continue
    items.push(toItem('card', offer.id, offer.name, offer.price, r.score, r.rationale, ctx.gold, r.buildId, r.buildName))
  }

  const relicRanks = rankRelicOffers(
    shop.relics,
    {
      character: ctx.character,
      ownedRelicIds: ctx.ownedRelicIds,
      archetypeTags: ctx.archetypeTags,
      act: ctx.act,
      matchedBuild: ctx.matchedBuild
    },
    bundle,
    false
  )
  for (const r of relicRanks) {
    if (r.offerIndex === null) continue
    const offer = shop.relics[r.offerIndex]
    if (!offer) continue
    items.push(toItem('relic', offer.id, offer.name, offer.price, r.score, r.rationale, ctx.gold, r.buildId, r.buildName))
  }

  for (const potion of shop.potions) {
    items.push(
      toItem(
        'potion',
        potion.id,
        potion.name,
        potion.price,
        POTION_BASELINE,
        ['Potion — situational; no tier data.'],
        ctx.gold
      )
    )
  }

  items.sort((a, b) => sortScore(b) - sortScore(a))
  return { items, gold: ctx.gold }
}

function toItem(
  kind: ShopAdviceItemView['kind'],
  id: string,
  name: string,
  price: number,
  intrinsicScore: number,
  baseRationale: string[],
  gold: number,
  buildId?: string,
  buildName?: string
): ShopAdviceItemView {
  const affordable = price <= gold
  const saveUp =
    !affordable &&
    intrinsicScore >= SAVE_UP_QUALITY &&
    price <= gold * SAVE_UP_GOLD_FACTOR
  const valuePerGold = intrinsicScore / Math.max(price, 1)

  const rationale = [...baseRationale]
  if (affordable) {
    rationale.push(`Affordable (${price}g).`)
  } else if (saveUp) {
    rationale.push(`Worth saving for — ${price}g (you have ${gold}g).`)
  } else {
    rationale.push(`Too expensive (${price}g vs ${gold}g).`)
  }

  return {
    kind,
    id,
    name,
    price,
    intrinsicScore,
    valuePerGold,
    affordable,
    saveUp,
    rationale,
    buildId,
    buildName
  }
}

/**
 * Bucket strictly dominates the tiebreak so a very cheap, low-quality item can
 * never out-rank a quality affordable item on value-per-gold alone:
 *   3 = affordable & quality  → tiebreak by value-per-gold
 *   2 = affordable but weak   → tiebreak by value-per-gold
 *   1 = worth saving for      → tiebreak by intrinsic quality
 *   0 = out of reach          → tiebreak by intrinsic quality
 */
function sortScore(item: ShopAdviceItemView): number {
  const bucket =
    item.affordable && item.intrinsicScore >= QUALITY_FLOOR
      ? 3
      : item.affordable
        ? 2
        : item.saveUp
          ? 1
          : 0
  const tiebreak =
    bucket >= 2 ? item.valuePerGold * 1000 : item.intrinsicScore
  return bucket * 1_000_000 + tiebreak
}
