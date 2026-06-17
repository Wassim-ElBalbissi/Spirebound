import React from 'react'
import type {
  AnnotationSlotRect,
  CombatHandAnnotation
} from '../../../main/types/recommendation'
import { TIER_BADGE } from '../theme/tiers'
import type { Tier } from '../../../main/types/tierData'

export interface HandBadgeProps {
  slot: AnnotationSlotRect
  annotation: CombatHandAnnotation
  scoreMax: number
}

export function HandBadge({
  slot,
  annotation,
  scoreMax
}: HandBadgeProps): React.JSX.Element {
  const isTop = annotation.rank === 1
  const isLethal = annotation.isLethal
  const tierClass = annotation.tier
    ? TIER_BADGE[annotation.tier as Tier] ?? TIER_BADGE.C
    : 'text-zinc-400 bg-zinc-700/30 border-zinc-600/60'

  // Sit the badge just above the card top.
  const badgeWidth = Math.max(64, Math.min(110, slot.width * 0.75))
  const badgeHeight = 28
  const left = slot.x - badgeWidth / 2
  const top = slot.y - badgeHeight - 6

  const pct = scoreMax > 0 ? Math.min(100, Math.round((annotation.score / scoreMax) * 100)) : 0

  return (
    <div
      className={`pointer-events-none absolute flex select-none flex-col items-stretch overflow-hidden rounded-md border shadow-lg backdrop-blur ${
        isLethal
          ? 'border-rose-400/80 bg-rose-900/40 ring-2 ring-rose-400/40'
          : isTop
            ? 'border-emerald-400/70 bg-zinc-900/80 ring-1 ring-emerald-400/40'
            : 'border-zinc-600/60 bg-zinc-900/70'
      }`}
      style={{
        left,
        top,
        width: badgeWidth,
        height: badgeHeight,
        fontSize: 11
      }}
    >
      <div className="flex items-center justify-between px-1.5 leading-tight">
        <span
          className={`font-mono text-[10px] ${
            isTop ? 'text-emerald-300' : 'text-zinc-400'
          }`}
        >
          #{annotation.rank || '·'}
        </span>
        <span
          className={`rounded border px-1 text-[10px] font-bold ${tierClass}`}
        >
          {annotation.tier ?? '—'}
        </span>
        <span className="font-mono text-[10px] text-zinc-300">
          {Math.round(annotation.score)}
        </span>
      </div>
      <div className="h-0.5 bg-zinc-800/60">
        <div
          className={`h-full ${
            isLethal
              ? 'bg-rose-400'
              : isTop
                ? 'bg-emerald-400'
                : 'bg-sky-400/70'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
