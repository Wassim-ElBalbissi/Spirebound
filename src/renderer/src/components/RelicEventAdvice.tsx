import React from 'react'
import type {
  RecommendationView,
  RelicPickRankedView
} from '../../../main/types/recommendation'
import type { EventChoice } from '../../../main/types/gameState'

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
  choices: EventChoice[]
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Event · {eventName}
      </div>
      {choices.map((c, i) => (
        <div
          key={`${c.index}-${i}`}
          className={`rounded-md border p-2 ${
            c.isLocked
              ? 'border-zinc-700/30 bg-zinc-800/20 opacity-50'
              : c.wasChosen
                ? 'border-zinc-700/40 bg-zinc-800/40 opacity-70'
                : 'border-zinc-700/40 bg-zinc-800/40'
          }`}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-mono text-zinc-500">
              #{c.index + 1}
            </span>
            <span className="text-sm font-medium">{c.title}</span>
            {c.isLocked && (
              <span className="ml-auto text-[10px] uppercase text-rose-400">
                Locked
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-400 leading-tight">
            {c.description}
          </div>
        </div>
      ))}
      <div className="text-[10px] text-zinc-500 italic">
        Event tier data not yet bundled — pick based on your build.
      </div>
    </div>
  )
}
