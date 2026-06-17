import React from 'react'
import type { CombatPlayResultView } from '../../../main/types/recommendation'
import type { Tier } from '../../../main/types/tierData'
import { ArtThumb, TierBadge } from '../hub/ui'
import { CostBadges } from '../hub/symbols'

export interface CombatAdviceProps {
  result: CombatPlayResultView
}

export function CombatAdvice({ result }: CombatAdviceProps): React.JSX.Element {
  const top = result.ranked[0]
  const max = Math.max(...result.ranked.map((r) => r.score), 1)
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Your hand · what to play
        </span>
        <ThreatBadge
          incoming={result.incomingDamage}
          blockNeeded={result.blockNeeded}
        />
      </div>

      {result.notes.map((n, i) => (
        <div key={i} className="text-[11px] leading-tight text-zinc-400">
          {n}
        </div>
      ))}

      {!top && (
        <div className="text-sm italic text-zinc-400">No playable cards.</div>
      )}

      <div className="flex flex-col gap-1.5">
        {result.ranked.map((row, i) => {
          const isTop = i === 0
          const pct = Math.max(3, Math.round((row.score / max) * 100))
          return (
            <div
              key={`${row.index}-${i}`}
              className={`flex items-center gap-2 rounded-lg p-1.5 ring-1 transition-colors ${
                isTop
                  ? 'bg-emerald-500/10 shadow-[0_0_14px_-3px] shadow-emerald-500/50 ring-emerald-400/70'
                  : 'bg-zinc-800/40 ring-white/5'
              }`}
            >
              <span
                className={`w-4 shrink-0 text-center font-mono text-[11px] font-bold ${
                  isTop ? 'text-emerald-300' : 'text-zinc-500'
                }`}
              >
                {i + 1}
              </span>
              <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-md ring-1 ring-black/30">
                <ArtThumb
                  src={row.imageUrl}
                  alt={row.name}
                  tier={(row.tier ?? undefined) as Tier | undefined}
                  className="absolute inset-0 h-full w-full !object-cover"
                />
                <span className="absolute left-0.5 top-0.5 scale-90">
                  <CostBadges cost={row.cost ?? undefined} starCost={row.starCost} />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {row.tier && (
                    <TierBadge
                      tier={row.tier as Tier}
                      solid
                      className="h-4 min-w-[1rem] px-1 text-[10px]"
                    />
                  )}
                  <span className="truncate text-sm font-semibold text-zinc-100">
                    {row.name}
                  </span>
                  {isTop && (
                    <span className="ml-auto shrink-0 rounded bg-emerald-500/20 px-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                      Play
                    </span>
                  )}
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded bg-zinc-700/40">
                  <div
                    className={`h-full rounded ${isTop ? 'bg-emerald-400/80' : 'bg-sky-400/70'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {isTop && row.rationale.length > 0 && (
                  <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-zinc-400">
                    {row.rationale.join(' · ')}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-[10px] italic text-zinc-500">
        Heuristic only — treat as a starting suggestion.
      </div>
    </div>
  )
}

function ThreatBadge({
  incoming,
  blockNeeded
}: {
  incoming: number
  blockNeeded: number
}): React.JSX.Element {
  if (incoming === 0) {
    return (
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        No threats
      </span>
    )
  }
  const color =
    blockNeeded === 0
      ? 'text-emerald-400'
      : blockNeeded > 12
        ? 'text-rose-400'
        : 'text-amber-400'
  return (
    <span className={`text-[10px] uppercase tracking-wider ${color}`}>
      Incoming {incoming}
      {blockNeeded > 0 ? ` · need ${blockNeeded} block` : ' · covered'}
    </span>
  )
}
