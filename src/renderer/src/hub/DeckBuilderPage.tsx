import React, { useMemo, useState } from 'react'
import type { CardTierEntry } from '../../../main/types/tierData'
import { useTierData } from './hooks'
import {
  ArtThumb,
  EmptyState,
  Pill,
  PrimaryButton,
  SearchBar,
  Select,
  TierBadge
} from './ui'
import { TIER_ORDER } from '../theme/tiers'
import { CharacterAvatar, charMeta } from './meta'
import { CostBadges } from './symbols'

const CLASSES = ['ironclad', 'silent', 'defect', 'regent', 'necrobinder', 'colorless']

function classLabel(c: string): string {
  return c === 'colorless' ? 'Colorless' : charMeta(c).label
}

export function DeckBuilderPage(): React.JSX.Element {
  const bundle = useTierData()
  const [character, setCharacter] = useState<string>('ironclad')
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState('all')
  const [type, setType] = useState('all')
  const [rarity, setRarity] = useState('all')
  const [cost, setCost] = useState('all')
  const [sort, setSort] = useState('rating')
  const [deck, setDeck] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const isX = (c: number | string | undefined): boolean =>
    c === 'X' || c === 'x' || (typeof c === 'number' && c < 0)
  const matchesCost = (c: number | string | undefined): boolean => {
    if (cost === 'all') return true
    if (cost === 'X') return isX(c)
    if (cost === '3+') return typeof c === 'number' && c >= 3
    if (isX(c)) return false
    return String(c) === cost
  }

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase()
    const isColorless = character === 'colorless'
    const out = Object.values(bundle.cards)
      .filter((c) =>
        isColorless ? c.colorless : c.character === character || c.colorless
      )
      .filter((c) => (tier === 'all' ? true : c.tier === tier))
      .filter((c) => (type === 'all' ? true : c.type === type))
      .filter((c) => (rarity === 'all' ? true : c.rarity === rarity))
      .filter((c) => matchesCost(c.cost))
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
    out.sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : b.blendedScore - a.blendedScore
    )
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, character, query, tier, type, rarity, cost, sort])

  const deckCards = useMemo(
    () =>
      Object.entries(deck)
        .map(([id, count]) => ({ card: bundle.cards[id], count }))
        .filter((d): d is { card: CardTierEntry; count: number } => !!d.card)
        .sort((a, b) => a.card.name.localeCompare(b.card.name)),
    [deck, bundle]
  )
  const totalCards = Object.values(deck).reduce((s, n) => s + n, 0)

  const add = (id: string): void =>
    setDeck((d) => ({ ...d, [id]: (d[id] ?? 0) + 1 }))
  const remove = (id: string): void =>
    setDeck((d) => {
      const next = { ...d }
      const n = (next[id] ?? 0) - 1
      if (n <= 0) delete next[id]
      else next[id] = n
      return next
    })

  const copyDeck = async (): Promise<void> => {
    if (deckCards.length === 0) return
    const title = name.trim() || `My ${classLabel(character)} deck`
    const lines = deckCards.map(({ card, count }) => `${count}x ${card.name}`)
    const text = `${title} (${totalCards} cards)\n${lines.join('\n')}`
    await window.overlay?.copyText(text)
    setStatus(`Copied “${title}” to clipboard.`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-surface-800 p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-zinc-50">Deck Builder</h1>
          <span className="text-xs text-zinc-500">{totalCards} cards in deck</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {CLASSES.map((c) => (
            <Pill key={c} active={character === c} onClick={() => setCharacter(c)}>
              <span className="flex items-center gap-1.5">
                {c !== 'colorless' && <CharacterAvatar id={c} size={16} />}
                {classLabel(c)}
              </span>
            </Pill>
          ))}
        </div>
        <SearchBar value={query} onChange={setQuery} placeholder="Search cards to add…" />
        <div className="flex flex-wrap items-center gap-3">
          <Select
            label="Tier"
            value={tier}
            onChange={setTier}
            options={[{ value: 'all', label: 'Any' }, ...TIER_ORDER.map((t) => ({ value: t, label: t }))]}
          />
          <Select
            label="Type"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'Any' },
              ...['Attack', 'Skill', 'Power'].map((t) => ({ value: t, label: t }))
            ]}
          />
          <Select
            label="Rarity"
            value={rarity}
            onChange={setRarity}
            options={[
              { value: 'all', label: 'Any' },
              ...['common', 'uncommon', 'rare', 'special'].map((r) => ({
                value: r,
                label: r.charAt(0).toUpperCase() + r.slice(1)
              }))
            ]}
          />
          <Select
            label="Cost"
            value={cost}
            onChange={setCost}
            options={[
              { value: 'all', label: 'Any' },
              { value: '0', label: '0' },
              { value: '1', label: '1' },
              { value: '2', label: '2' },
              { value: '3+', label: '3+' },
              { value: 'X', label: 'X' }
            ]}
          />
          <Select
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'rating', label: 'Rating' },
              { value: 'name', label: 'Name' }
            ]}
          />
          <span className="ml-auto text-[11px] text-zinc-500">{pool.length} cards</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Card pool */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {pool.length === 0 ? (
            <EmptyState title="No cards" hint="Try another class or search." />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {pool.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => add(c.id)}
                  title="Add to deck"
                  className="group relative aspect-[5/6] overflow-hidden rounded-xl text-left shadow-md shadow-black/40 ring-1 ring-white/5 transition-all hover:-translate-y-0.5 hover:ring-brand/50"
                >
                  <ArtThumb
                    src={c.imageUrl}
                    alt={c.name}
                    tier={c.tier}
                    className="absolute inset-0 h-full w-full !object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/50 to-transparent" />
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
                    <TierBadge tier={c.tier} solid />
                    <CostBadges cost={c.cost} starCost={c.starCost} />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-2.5">
                    <span className="truncate text-sm font-semibold text-white drop-shadow">
                      {c.name}
                    </span>
                  </div>
                  {deck[c.id] && (
                    <span className="absolute bottom-2 right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-surface-950">
                      ×{deck[c.id]}
                    </span>
                  )}
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-brand/0 text-3xl font-black text-white/0 transition-all group-hover:bg-brand/15 group-hover:text-white/90">
                    +
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Deck panel */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-surface-800 bg-surface-900">
          <div className="border-b border-surface-800 p-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`My ${classLabel(character)} deck`}
              className="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-brand/60"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {deckCards.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-zinc-500">
                Click cards on the left to add them to your deck.
              </p>
            ) : (
              <ul className="space-y-1">
                {deckCards.map(({ card, count }) => (
                  <li
                    key={card.id}
                    className="flex items-center gap-2 rounded-lg bg-surface-950 px-2 py-1.5"
                  >
                    <TierBadge tier={card.tier} className="h-5 min-w-[1.25rem] text-[11px]" />
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
                      {card.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => remove(card.id)}
                        className="flex h-5 w-5 items-center justify-center rounded bg-surface-800 text-zinc-300 hover:bg-surface-700"
                      >
                        −
                      </button>
                      <span className="w-5 text-center font-mono text-xs text-zinc-300">
                        {count}
                      </span>
                      <button
                        type="button"
                        onClick={() => add(card.id)}
                        className="flex h-5 w-5 items-center justify-center rounded bg-surface-800 text-zinc-300 hover:bg-surface-700"
                      >
                        +
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2 border-t border-surface-800 p-3">
            {status && (
              <p className="rounded-lg border border-brand/30 bg-brand/10 px-2.5 py-1.5 text-[11px] text-emerald-200">
                {status}
              </p>
            )}
            <div className="flex gap-2">
              <PrimaryButton
                disabled={totalCards === 0}
                onClick={() => void copyDeck()}
                className="flex-1 py-2"
              >
                Copy deck list
              </PrimaryButton>
              {totalCards > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDeck({})
                    setStatus(null)
                  }}
                  className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-zinc-100"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
