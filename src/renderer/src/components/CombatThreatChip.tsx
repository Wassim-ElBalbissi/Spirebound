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
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>Combat</span>
        <Threat
          incoming={result.incomingDamage}
          blockNeeded={result.blockNeeded}
        />
      </div>
      {top ? (
        <div className="flex items-baseline gap-2 truncate">
          <span className="text-[10px] font-mono text-emerald-400">
            Play #1
          </span>
          <span className="truncate text-sm font-medium text-zinc-100">
            {top.name}
          </span>
        </div>
      ) : (
        <div className="text-xs italic text-zinc-400">No playable cards.</div>
      )}
      {result.notes[0] && (
        <div className="text-[10px] leading-tight text-zinc-400">
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
    return <span className="text-zinc-500">No threats</span>
  }
  const color =
    blockNeeded === 0
      ? 'text-emerald-400'
      : blockNeeded > 12
        ? 'text-rose-400'
        : 'text-amber-400'
  return (
    <span className={color}>
      Inc {incoming}
      {blockNeeded > 0 ? ` · need ${blockNeeded}` : ' · covered'}
    </span>
  )
}
