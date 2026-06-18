import React from 'react'
import type { CardPickRankedView } from '../../../main/types/recommendation'

export interface CardChoiceAdviceProps {
  title: string
  verb: string
  ranked: CardPickRankedView[]
}

/**
 * Compact "choose a card" advice — a Discovery potion or an in-combat
 * discard/exhaust. The overlay is click-through (no scroll), so we lead with the
 * recommended pick in full and collapse the rest to one-liners.
 */
export function CardChoiceAdvice({
  title,
  verb,
  ranked
}: CardChoiceAdviceProps): React.JSX.Element {
  const best = ranked[0]
  const rest = ranked.slice(1)
  return (
    <div className="flex flex-col gap-1.5 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </div>

      {best && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-900/10 p-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-[9px] uppercase tracking-wide text-emerald-400 shrink-0">
                {verb}
              </span>
              <span className="truncate text-sm font-semibold">{best.name}</span>
            </div>
            <span className="font-mono text-xs text-emerald-300/80 shrink-0">
              {Math.round(best.score)}
            </span>
          </div>
          {best.rationale.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[11px] text-emerald-200/70">
              {best.rationale.map((r, j) => (
                <li key={j} className="leading-tight">
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rest.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {rest.map((c, i) => (
            <div
              key={`${c.id}-${c.offerIndex ?? i}`}
              className="flex items-baseline gap-2 px-1"
              title={c.rationale.join(' · ')}
            >
              <span className="text-[10px] font-mono text-zinc-500 shrink-0 w-4">
                #{i + 2}
              </span>
              <span className="text-[11px] text-zinc-300 truncate min-w-0 flex-1">
                {c.name}
              </span>
              <span className="text-[10px] text-zinc-500 truncate min-w-0 flex-1">
                {c.rationale[0] ?? ''}
              </span>
              <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                {Math.round(c.score)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
