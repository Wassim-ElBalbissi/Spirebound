import React from 'react'
import type {
  MatchedBuildView,
  RecommendationView,
  RestActionView
} from '../../../main/types/recommendation'
import { BuildBanner } from './BuildBanner'

type RestData = Extract<RecommendationView, { kind: 'restUpgrade' }>
type UpgradeRow = RestData['cards'][number]

export interface RestAdviceProps {
  action: RestActionView
  cards: UpgradeRow[]
  build?: MatchedBuildView | null
}

export function RestAdvice({
  action,
  cards,
  build
}: RestAdviceProps): React.JSX.Element {
  const restPicked = action.recommended === 'rest'
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Campfire
      </div>

      {/* Headline: Rest vs Smith, decided on HP. */}
      <div
        className={`rounded-md border p-2 ${
          restPicked
            ? 'border-emerald-400/60 bg-emerald-500/10'
            : 'border-sky-400/50 bg-sky-500/10'
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              restPicked
                ? 'bg-emerald-500/25 text-emerald-200'
                : 'bg-sky-500/25 text-sky-200'
            }`}
          >
            {restPicked ? 'Rest' : 'Smith'}
          </span>
          <span className="text-sm font-semibold text-zinc-100">
            {restPicked
              ? `Heal to ${Math.min(action.maxHp, action.hp + action.effectiveHeal)}/${action.maxHp}`
              : 'Upgrade a card'}
          </span>
          <span className="ml-auto font-mono text-[11px] text-zinc-400">
            {action.hp}/{action.maxHp} HP
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-zinc-300">
          {action.reason}
        </p>
      </div>

      <BuildBanner build={build} />

      {/* Upgrade priority — primary when smithing, secondary (dimmed) otherwise. */}
      <div className={restPicked ? 'opacity-60' : ''}>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {restPicked ? 'If you smith instead' : 'Upgrade priority'}
        </div>
        {cards.length === 0 ? (
          <div className="text-xs italic text-zinc-400">
            Choose <span className="text-amber-300">Smith</span> to see which card
            to upgrade.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {cards.map((c, i) => (
              <Row
                key={`${c.id}-${i}`}
                card={c}
                rank={i + 1}
                top={i === 0 && !restPicked}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({
  card,
  rank,
  top
}: {
  card: UpgradeRow
  rank: number
  top: boolean
}): React.JSX.Element {
  return (
    <div
      className={`rounded-md border p-2 ${
        top
          ? 'border-emerald-400/50 bg-emerald-500/10'
          : 'border-zinc-700/40 bg-zinc-800/40'
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={`shrink-0 font-mono text-[10px] ${
            top ? 'text-emerald-300' : 'text-zinc-500'
          }`}
        >
          #{rank}
        </span>
        {card.tier && (
          <span className="shrink-0 rounded bg-zinc-700/50 px-1 text-[9px] font-bold uppercase text-zinc-300">
            {card.tier}
          </span>
        )}
        <span className="truncate text-sm font-semibold text-zinc-100">
          {card.name}
        </span>
        {card.copies > 1 && (
          <span className="shrink-0 text-[10px] text-zinc-500">×{card.copies}</span>
        )}
        {top && (
          <span className="ml-auto shrink-0 rounded bg-emerald-500/20 px-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
            Upgrade
          </span>
        )}
      </div>
      {card.rationale.length > 0 && (
        <p className="mt-1 text-[11px] leading-snug text-zinc-400">
          {card.rationale.join(' ')}
        </p>
      )}
    </div>
  )
}
