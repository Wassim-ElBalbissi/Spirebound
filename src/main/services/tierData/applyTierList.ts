import type { Tier, TierBundle } from '../../types/tierData'
import type { CustomTierList } from '../../types/tierList'

/**
 * Representative blended score for each tier. The recommender ranks by
 * `blendedScore`, so when a user re-tiers an entry we nudge its score to the
 * midpoint of that tier's band (see `scoreToTier` in spireArchive.ts).
 */
const TIER_SCORE: Record<Tier, number> = {
  S: 90,
  A: 75,
  B: 62,
  C: 48,
  D: 30,
  F: 10
}

/**
 * Return a new bundle with the custom tier list's assignments applied on top of
 * `base`. Only entries present in the list are changed; everything else is left
 * exactly as the official bundle had it. Non-destructive — `base` is untouched.
 */
export function applyTierList(
  base: TierBundle,
  list: CustomTierList | undefined | null
): TierBundle {
  if (!list || Object.keys(list.tiers).length === 0) return base

  const target = list.kind === 'card' ? 'cards' : 'relics'
  const next: TierBundle = {
    ...base,
    cards: { ...base.cards },
    relics: { ...base.relics }
  }

  for (const [id, tier] of Object.entries(list.tiers)) {
    const entry = next[target][id]
    if (!entry) continue
    next[target][id] = {
      ...entry,
      tier,
      blendedScore: TIER_SCORE[tier]
    }
  }
  return next
}
