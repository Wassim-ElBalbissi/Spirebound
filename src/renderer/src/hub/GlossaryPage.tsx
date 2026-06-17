import React, { useMemo, useState } from 'react'
import type { Compendium, GlossaryEntry } from '../../../main/types/compendium'
import { EmptyState, Pill, SearchBar } from './ui'

const KIND_COLOR: Record<GlossaryEntry['kind'], string> = {
  Buff: 'text-emerald-300',
  Debuff: 'text-rose-300',
  Keyword: 'text-sky-300',
  Enchantment: 'text-violet-300'
}
const KIND_CHIP: Record<GlossaryEntry['kind'], string> = {
  Buff: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  Debuff: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  Keyword: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  Enchantment: 'bg-violet-500/15 text-violet-300 ring-violet-500/30'
}
const KINDS: GlossaryEntry['kind'][] = ['Keyword', 'Buff', 'Debuff', 'Enchantment']

export function GlossaryPage({
  data
}: {
  data: Compendium
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<string>('all')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.glossary
      .filter((g) => (kind === 'all' ? true : g.kind === kind))
      .filter((g) =>
        q
          ? g.name.toLowerCase().includes(q) ||
            g.description.toLowerCase().includes(q)
          : true
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [data.glossary, query, kind])

  if (data.glossary.length === 0) {
    return <EmptyState title="No glossary data" />
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-surface-800 p-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-50">Keywords & Effects</h1>
          <p className="mt-1 text-sm text-zinc-500">
            What powers, statuses and card keywords do. These are highlighted in
            card, relic and potion text — hover any term to see its meaning.
          </p>
        </div>
        <SearchBar value={query} onChange={setQuery} placeholder="Search keywords & effects…" />
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill active={kind === 'all'} onClick={() => setKind('all')}>
            All
          </Pill>
          {KINDS.map((k) => (
            <Pill key={k} active={kind === k} onClick={() => setKind(k)}>
              {k}
            </Pill>
          ))}
          <span className="ml-auto text-[11px] text-zinc-500">{rows.length} terms</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
          {rows.map((g) => (
            <div
              key={g.id}
              className="rounded-xl bg-surface-900 p-3 ring-1 ring-white/5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold ${KIND_COLOR[g.kind]}`}>
                  {g.name}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${KIND_CHIP[g.kind]}`}
                >
                  {g.kind}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                {g.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
