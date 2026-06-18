import React from 'react'
import type {
  EventChoiceRankedView,
  RecommendationView,
  RelicPickRankedView
} from '../../../main/types/recommendation'

export interface RelicEventAdviceProps {
  recommendation:
    | Extract<RecommendationView, { kind: 'relicPick' }>
    | Extract<RecommendationView, { kind: 'event' }>
}

export function RelicEventAdvice({
  recommendation
}: RelicEventAdviceProps): React.JSX.Element {
  if (recommendation.kind === 'relicPick') {
    return <RelicPickList ranked={recommendation.ranked} />
  }
  return (
    <EventChoiceList
      eventName={recommendation.eventName}
      choices={recommendation.choices}
    />
  )
}

function RelicPickList({
  ranked
}: {
  ranked: RelicPickRankedView[]
}): React.JSX.Element {
  const max = Math.max(...ranked.map((r) => r.score), 1)
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Relic Reward
      </div>
      {ranked.map((row, i) => {
        const pct = Math.max(2, Math.round((row.score / max) * 100))
        const isTop = i === 0
        const isSkip = row.id === '__SKIP__'
        return (
          <div
            key={`${row.id}-${i}`}
            className="rounded-md border border-zinc-700/40 bg-zinc-800/40 p-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2 min-w-0">
                <span
                  className={`text-[10px] font-mono shrink-0 ${
                    isTop ? 'text-emerald-400' : 'text-zinc-500'
                  }`}
                >
                  #{i + 1}
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
                  isTop ? 'bg-emerald-400/80' : 'bg-sky-400/70'
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
      })}
    </div>
  )
}

function EventChoiceList({
  eventName,
  choices
}: {
  eventName: string
  choices: EventChoiceRankedView[]
}): React.JSX.Element {
  // The advisor already sorts best-first (locked options sink to the bottom).
  // The overlay is click-through, so the panel can't scroll — keep it short by
  // showing the winner in full and the rest as compact one-liners.
  const live = choices.filter((c) => !c.isLocked)
  const best = live[0]
  const rest = choices.filter((c) => c !== best)
  const rankOf = (c: EventChoiceRankedView): number => live.indexOf(c) + 1

  return (
    <div className="flex flex-col gap-1.5 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Event · {eventName}
      </div>

      {best && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-900/10 p-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-[10px] font-mono text-emerald-400 shrink-0">
                #1
              </span>
              <span className="truncate text-sm font-semibold">{best.title}</span>
              <span className="text-[9px] uppercase tracking-wide text-emerald-400 shrink-0">
                Best
              </span>
            </div>
            <span className="font-mono text-xs text-emerald-300/80 shrink-0">
              {Math.round(best.score)}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-300 leading-tight">
            {best.description}
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
          {rest.map((c) => (
            <div
              key={c.index}
              className={`flex items-baseline gap-2 px-1 ${
                c.isLocked ? 'opacity-40' : ''
              } ${c.wasChosen ? 'line-through opacity-60' : ''}`}
              title={c.description}
            >
              <span className="text-[10px] font-mono text-zinc-500 shrink-0 w-4">
                {c.isLocked ? '—' : `#${rankOf(c)}`}
              </span>
              <span className="text-[11px] text-zinc-300 shrink-0 max-w-[40%] truncate">
                {c.title}
              </span>
              <span className="text-[10px] text-zinc-500 truncate min-w-0 flex-1">
                {c.description}
              </span>
              {c.isLocked ? (
                <span className="text-[9px] uppercase text-rose-400/80 shrink-0">
                  Locked
                </span>
              ) : (
                <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                  {Math.round(c.score)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="text-[9px] text-zinc-600 italic">
        Heuristic — HP, deck size &amp; build.
      </div>
    </div>
  )
}
