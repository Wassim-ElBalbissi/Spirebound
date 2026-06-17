import React, { useMemo, useState } from 'react'
import type { Compendium, EventEntry } from '../../../main/types/compendium'
import { ArtThumb, EmptyState, Pill, SearchBar, Tag } from './ui'
import { rarityClass } from './meta'
import { GameText } from './symbols'

export function PotionsPage({ data }: { data: Compendium }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState<string | null>(null)

  const rarities = useMemo(
    () => Array.from(new Set(data.potions.map((p) => p.rarity))),
    [data.potions]
  )
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.potions
      .filter((p) => (rarity ? p.rarity === rarity : true))
      .filter((p) =>
        q
          ? p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q)
          : true
      )
  }, [data.potions, query, rarity])

  if (data.potions.length === 0) {
    return <EmptyState title="No potions yet" />
  }
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-3 border-b border-surface-800 p-4">
        <SearchBar value={query} onChange={setQuery} placeholder="Search potions…" />
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill active={rarity === null} onClick={() => setRarity(null)}>
            All
          </Pill>
          {rarities.map((r) => (
            <Pill key={r} active={rarity === r} onClick={() => setRarity(r)}>
              <span className="capitalize">{r}</span>
            </Pill>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500">{rows.length} potions</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {rows.map((p) => (
            <div
              key={p.id}
              className="flex gap-3 rounded-xl border border-surface-800 bg-surface-900 p-3"
            >
              <ArtThumb
                src={p.imageUrl}
                alt={p.name}
                className="h-14 w-14 shrink-0 rounded-lg bg-surface-950 ring-1 ring-surface-800"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-zinc-50">
                    {p.name}
                  </span>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${rarityClass(p.rarity)}`}
                  >
                    {p.rarity}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                  <GameText text={p.description} />
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function EventsPage({ data }: { data: Compendium }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.events.filter((e) =>
      q
        ? e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
        : true
    )
  }, [data.events, query])

  const selected = data.events.find((e) => e.id === selectedId) ?? null

  if (data.events.length === 0) {
    return <EmptyState title="No events yet" />
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-surface-800 p-4">
        <SearchBar value={query} onChange={setQuery} placeholder="Search events…" />
        <p className="mt-2 text-[11px] text-zinc-500">{rows.length} events</p>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {rows.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelectedId(e.id)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  selectedId === e.id
                    ? 'border-brand/60 bg-surface-800'
                    : 'border-surface-800 bg-surface-900 hover:border-surface-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-zinc-50">
                    {e.name}
                  </span>
                  {e.acts.length > 0 && <Tag>Act {e.acts.join(', ')}</Tag>}
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                  {e.description}
                </p>
              </button>
            ))}
          </div>
        </div>
        {selected && (
          <EventDetail event={selected} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  )
}

function EventDetail({
  event,
  onClose
}: {
  event: EventEntry
  onClose: () => void
}): React.JSX.Element {
  return (
    <aside className="flex w-96 shrink-0 flex-col gap-3 overflow-y-auto border-l border-surface-800 bg-surface-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-50">{event.name}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-500 hover:bg-surface-800 hover:text-zinc-200"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      {event.acts.length > 0 && <Tag>Act {event.acts.join(', ')}</Tag>}
      <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">
        {event.description}
      </p>
    </aside>
  )
}
