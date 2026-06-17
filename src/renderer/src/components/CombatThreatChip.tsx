import React from 'react'
import type { CombatPlayResultView } from '../../../main/types/recommendation'

export interface CombatThreatChipProps {
  result: CombatPlayResultView
}

export function CombatThreatChip({
  result
}: CombatThreatChipProps): React.JSX.Element {
  const top = result.ranked[0]
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 p-2">
      <div className="flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        <span>Combat</span>
        <Threat
          incoming={result.incomingDamage}
          blockNeeded={result.blockNeeded}
        />
      </div>
      {top ? (
        <div className="flex items-baseline gap-2 truncate">
          <span className="shrink-0 text-xs font-mono font-semibold text-emerald-300">
            Play #1
          </span>
          <span className="truncate text-sm font-semibold text-zinc-50">
            {top.name}
          </span>
        </div>
      ) : (
        <div className="text-sm italic text-zinc-300">No playable cards.</div>
      )}
      {result.notes[0] && (
        <div className="text-xs leading-snug text-zinc-200">
          {result.notes[0]}
        </div>
      )}
    </div>
  )
}

function Threat({
  incoming,
  blockNeeded
}: {
  incoming: number
  blockNeeded: number
}): React.JSX.Element {
  if (incoming === 0) {
    return <span className="shrink-0 text-zinc-400">No threats</span>
  }
  const color =
    blockNeeded === 0
      ? 'text-emerald-300'
      : blockNeeded > 12
        ? 'text-rose-300'
        : 'text-amber-300'
  return (
    <span className={`shrink-0 ${color}`}>
      Inc {incoming}
      {blockNeeded > 0 ? ` · need ${blockNeeded}` : ' · covered'}
    </span>
  )
}
