import React from 'react'
import type { RecommendationView } from '../../../main/types/recommendation'

type ShopAdviceData = Extract<RecommendationView, { kind: 'shopAdvice' }>
type ShopItem = ShopAdviceData['items'][number]

export interface ShopAdviceProps {
  items: ShopItem[]
  gold: number
}

export function ShopAdvice({ items, gold }: ShopAdviceProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Shop
        </div>
        <div className="font-mono text-[11px] text-amber-400">{gold}g</div>
      </div>
      {items.length === 0 ? (
        <div className="text-xs italic text-zinc-500">Nothing on offer.</div>
      ) : (
        items.map((item, i) => (
          <ShopRow key={`${item.id}-${i}`} item={item} rank={i + 1} />
        ))
      )}
    </div>
  )
}

const KIND_LABEL: Record<ShopItem['kind'], string> = {
  card: 'Card',
  relic: 'Relic',
  potion: 'Potion'
}

function ShopRow({ item, rank }: { item: ShopItem; rank: number }): React.JSX.Element {
  const priceClass = item.affordable
    ? 'text-emerald-400'
    : item.saveUp
      ? 'text-amber-400'
      : 'text-rose-400'
  return (
    <div
      className={`rounded-md border border-zinc-700/40 bg-zinc-800/40 p-2 ${
        item.affordable ? '' : 'opacity-70'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="shrink-0 font-mono text-[10px] text-zinc-500">
            #{rank}
          </span>
          <span className="shrink-0 rounded bg-zinc-700/50 px-1 text-[9px] uppercase tracking-wide text-zinc-400">
            {KIND_LABEL[item.kind]}
          </span>
          <span className="truncate text-sm font-medium">{item.name}</span>
        </div>
        <span className={`shrink-0 font-mono text-xs ${priceClass}`}>
          {item.price}g
        </span>
      </div>
      {item.rationale.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-zinc-400">
          {item.rationale.map((r, j) => (
            <li key={j} className="leading-tight">
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
