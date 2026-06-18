import React from 'react'
import type { MatchedBuildView } from '../../../main/types/recommendation'

/**
 * One-line "Current build" header shown above card-pick / shop advice so the
 * player can see which archetype the recommendations are tuned for.
 */
export function BuildBanner({
  build
}: {
  build?: MatchedBuildView | null
}): React.JSX.Element | null {
  if (!build) return null
  const tags = build.tags.slice(0, 4).join(' · ')
  return (
    <div className="flex items-baseline gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-500/80">
        Build
      </span>
      <span className="truncate text-xs font-medium text-emerald-300">
        {build.name}
      </span>
      {tags && (
        <span className="truncate text-[10px] text-emerald-400/60">({tags})</span>
      )}
    </div>
  )
}
