import type { TierBundle } from '../../../main/types/tierData'
import type { BuildEntry } from '../../../main/types/compendium'
import type { CustomTierList } from '../../../main/types/tierList'

/**
 * Derive a card override from a build so the live overlay prioritizes the
 * build's archetype. Key cards become S; any card sharing an archetype tag
 * becomes A. Reuses the existing active-tier-list apply path in the main
 * process (no new IPC needed).
 */
export function buildToOverride(
  bundle: TierBundle,
  build: BuildEntry
): CustomTierList {
  const tiers: Record<string, 'S' | 'A'> = {}
  const tagSet = new Set(build.archetypeTags)
  for (const card of Object.values(bundle.cards)) {
    if (card.tags?.some((t) => tagSet.has(t))) tiers[card.id] = 'A'
  }
  for (const id of build.keyCards ?? []) {
    if (bundle.cards[id]) tiers[id] = 'S'
  }
  return {
    id: `build_${build.id}`,
    name: `Build · ${build.name}`,
    kind: 'card',
    tiers,
    createdAt: 0,
    updatedAt: 0
  }
}

export function activeBuildId(activeListId: string | null): string | null {
  return activeListId && activeListId.startsWith('build_')
    ? activeListId.slice('build_'.length)
    : null
}
