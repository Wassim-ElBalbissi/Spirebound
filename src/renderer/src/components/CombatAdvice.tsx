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
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Your hand · what to play
        </span>
        <ThreatBadge
          incoming={result.incomingDamage}
          blockNeeded={result.blockNeeded}
        />
      </div>

      {result.notes.map((n, i) => (
        <div key={i} className="text-sm leading-snug text-zinc-100">
          {n}
        </div>
      ))}

      <ThreatPanel threats={result.threats} />

      <PotionPanel potions={result.potions} />

      {!top && (
        <div className="text-sm italic text-zinc-300">No playable cards.</div>
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
                className={`w-4 shrink-0 text-center font-mono text-xs font-bold ${
                  isTop ? 'text-emerald-300' : 'text-zinc-400'
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
                  <span className="truncate text-sm font-semibold text-zinc-50">
                    {row.name}
                  </span>
                  {isTop && (
                    <span className="ml-auto shrink-0 rounded bg-emerald-500/20 px-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
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
                  <p className="mt-1 line-clamp-3 text-sm leading-snug text-zinc-100">
                    {row.rationale.join(' · ')}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-xs italic text-zinc-400">
        Heuristic only — treat as a starting suggestion.
      </div>
    </div>
  )
}

function ThreatPanel({
  threats
}: {
  threats: CombatPlayResultView['threats']
}): React.JSX.Element | null {
  const attackers = threats.filter((t) => t.adjusted !== null)
  if (attackers.length === 0) return null
  return (
    <div className="rounded-md border border-zinc-700/50 bg-zinc-900/50 p-2">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        Incoming by enemy
      </div>
      <div className="flex flex-col gap-1">
        {attackers.map((t, i) => (
          <div
            key={`${t.entityId}-${i}`}
            className="flex items-baseline justify-between gap-2 text-sm"
          >
            <span className="min-w-0 truncate text-zinc-200">{t.name}</span>
            <span className="shrink-0 font-mono">
              <span className="font-semibold text-rose-300">{t.adjusted}</span>
              {t.applied.length > 0 && (
                <span className="ml-1 text-xs text-zinc-300">
                  ({t.applied.join(', ')})
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PotionPanel({
  potions
}: {
  potions: CombatPlayResultView['potions']
}): React.JSX.Element | null {
  if (potions.length === 0) return null
  return (
    <div className="rounded-md border border-zinc-700/50 bg-zinc-900/50 p-2">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        Potions
      </div>
      <div className="flex flex-col gap-1.5">
        {potions.map((p, i) => (
          <div key={`${p.id}-${i}`} className="text-sm leading-snug">
            <span className="inline-flex items-baseline gap-1.5">
              <AdviceTag advice={p.advice} />
              <span
                className={`font-semibold ${
                  p.advice === 'use' ? 'text-emerald-200' : 'text-zinc-100'
                }`}
              >
                {p.name}
              </span>
            </span>
            <span className="text-zinc-200"> — {p.rationale.join(' ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdviceTag({
  advice
}: {
  advice: 'use' | 'consider' | 'hold'
}): React.JSX.Element {
  const style =
    advice === 'use'
      ? 'bg-emerald-500/25 text-emerald-200'
      : advice === 'consider'
        ? 'bg-sky-500/20 text-sky-200'
        : 'bg-zinc-600/30 text-zinc-300'
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${style}`}
    >
      {advice}
    </span>
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
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        No threats
      </span>
    )
  }
  const color =
    blockNeeded === 0
      ? 'text-emerald-300'
      : blockNeeded > 12
        ? 'text-rose-300'
        : 'text-amber-300'
  return (
    <span className={`shrink-0 text-xs font-semibold uppercase tracking-wide ${color}`}>
      Incoming {incoming}
      {blockNeeded > 0 ? ` · need ${blockNeeded} block` : ' · covered'}
    </span>
  )
}
