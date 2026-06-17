import React from 'react'
import type { CardPickRankedView } from '../../../main/types/recommendation'

export interface CardPickAdviceProps {
  ranked: CardPickRankedView[]
  canSkip: boolean
}

export function CardPickAdvice({
  ranked,
  canSkip: _canSkip
}: CardPickAdviceProps): React.JSX.Element {
  const max = Math.max(...ranked.map((r) => r.score), 1)
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Card Reward
      </div>
      {ranked.map((row, i) => (
        <Row key={`${row.id}-${i}`} row={row} max={max} rank={i + 1} />
      ))}
    </div>
  )
}

function Row({
  row,
  max,
  rank
}: {
  row: CardPickRankedView
  max: number
  rank: number
}): React.JSX.Element {
  const pct = Math.max(2, Math.round((row.score / max) * 100))
  const isSkip = row.id === '__SKIP__'
  const isTop = rank === 1
  return (
    <div className="group rounded-md border border-zinc-700/40 bg-zinc-800/40 p-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className={`text-[10px] font-mono shrink-0 ${
              isTop ? 'text-emerald-400' : 'text-zinc-500'
            }`}
          >
            #{rank}
          </span>
          <span
            className={`truncate text-sm ${
              isSkip ? 'italic text-zinc-400' : 'font-medium'
            }`}
          >
            {row.name}
          </span>
        </div>
        <span className="font-mono text-xs text-zinc-400 shrink-0">
          {Math.round(row.score)}
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-zinc-700/40">
        <div
          className={`h-full rounded ${
            isTop ? 'bg-emerald-400/80' : isSkip ? 'bg-zinc-500/60' : 'bg-sky-400/70'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {row.rationale.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-zinc-400">
          {row.rationale.map((r, j) => (
            <li key={j} className="leading-tight">
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
