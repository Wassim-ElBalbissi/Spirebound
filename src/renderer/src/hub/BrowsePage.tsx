import React, { useMemo, useState } from 'react'
import type {
  CardTierEntry,
  RelicTierEntry,
  Tier,
  TierBundle
} from '../../../main/types/tierData'
import { TIER_ORDER } from '../theme/tiers'
import { ArtThumb, EmptyState, Pill, SearchBar, Select, TierBadge } from './ui'
import { CharacterAvatar, charMeta, rarityClass, typeClass } from './meta'
import { CostBadges, GameText } from './symbols'

type Kind = 'card' | 'relic'

interface BrowseRow {
  id: string
  name: string
  tier: Tier
  score: number
  rarity: string
  tags: string[]
  character?: string
  cardType?: string
  cost?: number | string
  starCost?: number
  target?: string
  upgrade?: Record<string, number | string | string[]>
  descriptionTemplate?: string
  vars?: Record<string, number | string>
  description?: string
  commentary?: string
  author?: string
  imageUrl?: string
}

function toRows(bundle: TierBundle, kind: Kind): BrowseRow[] {
  if (kind === 'card') {
    return Object.values(bundle.cards).map((c: CardTierEntry) => ({
      id: c.id,
      name: c.name,
      tier: c.tier,
      score: c.blendedScore,
      rarity: c.rarity,
      tags: c.tags,
      character: c.character,
      cardType: c.type,
      cost: c.cost,
      starCost: c.starCost,
      target: c.target,
      upgrade: c.upgrade,
      descriptionTemplate: c.descriptionTemplate,
      vars: c.vars,
      description: c.description,
      commentary: c.commentary,
      author: c.author,
      imageUrl: c.imageUrl
    }))
  }
  return Object.values(bundle.relics).map((r: RelicTierEntry) => ({
    id: r.id,
    name: r.name,
    tier: r.tier,
    score: r.blendedScore,
    rarity: r.rarity,
    tags: r.tags,
    character: r.character,
    description: r.description,
    commentary: r.commentary,
    author: r.author,
    imageUrl: r.imageUrl
  }))
}

export function BrowsePage({
  bundle,
  kind
}: {
  bundle: TierBundle
  kind: Kind
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [character, setCharacter] = useState<string | null>(null)
  const [tier, setTier] = useState<string>('all')
  const [cardType, setCardType] = useState<string>('all')
  const [rarity, setRarity] = useState<string>('all')
  const [sort, setSort] = useState<string>('rating')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = useMemo(() => toRows(bundle, kind), [bundle, kind])

  // Class filter for both cards and relics (some relics are class-specific).
  const CLASS_ORDER = ['ironclad', 'silent', 'defect', 'regent', 'necrobinder', 'neutral']
  const characters = useMemo(() => {
    const present = new Set(rows.map((r) => r.character).filter(Boolean) as string[])
    return CLASS_ORDER.filter((c) => present.has(c))
  }, [rows])
  const rarities = useMemo(
    () => Array.from(new Set(rows.map((r) => r.rarity))).sort(),
    [rows]
  )
  const types = useMemo(
    () =>
      kind === 'card'
        ? (Array.from(new Set(rows.map((r) => r.cardType).filter(Boolean))) as string[])
        : [],
    [rows, kind]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = rows
      .filter((r) => (character ? r.character === character : true))
      .filter((r) => (tier === 'all' ? true : r.tier === tier))
      .filter((r) => (rarity === 'all' ? true : r.rarity === rarity))
      .filter((r) => (cardType === 'all' ? true : r.cardType === cardType))
      .filter((r) =>
        q
          ? r.name.toLowerCase().includes(q) ||
            r.tags.some((t) => t.toLowerCase().includes(q))
          : true
      )
    out.sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : b.score - a.score
    )
    return out
  }, [rows, query, character, tier, rarity, cardType, sort])

  const selected =
    kind === 'card' ? filtered.find((r) => r.id === selectedId) ?? null : null
  const hasFilters =
    character !== null || tier !== 'all' || rarity !== 'all' || cardType !== 'all'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-surface-800 p-4">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder={`Search ${kind === 'card' ? 'cards' : 'relics'}…`}
        />

        {characters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill active={character === null} onClick={() => setCharacter(null)}>
              All classes
            </Pill>
            {characters.map((c) => (
              <Pill key={c} active={character === c} onClick={() => setCharacter(c)}>
                <span className="flex items-center gap-1.5">
                  <CharacterAvatar id={c} size={16} />
                  {charMeta(c).label}
                </span>
              </Pill>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Select
            label="Tier"
            value={tier}
            onChange={setTier}
            options={[
              { value: 'all', label: 'Any' },
              ...TIER_ORDER.map((t) => ({ value: t, label: t }))
            ]}
          />
          {kind === 'card' && types.length > 0 && (
            <Select
              label="Type"
              value={cardType}
              onChange={setCardType}
              options={[
                { value: 'all', label: 'Any' },
                ...types.map((t) => ({ value: t, label: t }))
              ]}
            />
          )}
          <Select
            label="Rarity"
            value={rarity}
            onChange={setRarity}
            options={[
              { value: 'all', label: 'Any' },
              ...rarities.map((r) => ({
                value: r,
                label: r.charAt(0).toUpperCase() + r.slice(1)
              }))
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
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setCharacter(null)
                setTier('all')
                setRarity('all')
                setCardType('all')
              }}
              className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              Clear
            </button>
          )}
          <span className="ml-auto text-[11px] text-zinc-500">
            {filtered.length} results
          </span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <EmptyState title="No matches" hint="Try a different search or filter." />
          ) : kind === 'relic' ? (
            <RelicGrid rows={filtered} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(164px,1fr))] gap-3">
              {filtered.map((r) => (
                <CardTile
                  key={r.id}
                  row={r}
                  selected={selectedId === r.id}
                  onClick={() => setSelectedId(r.id)}
                />
              ))}
            </div>
          )}
        </div>

        {selected && (
          <CardDetail row={selected} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  )
}

function CardTile({
  row: r,
  selected,
  onClick
}: {
  row: BrowseRow
  selected: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative aspect-[5/6] overflow-hidden rounded-xl text-left shadow-md shadow-black/40 transition-all hover:-translate-y-0.5 ${
        selected ? 'ring-2 ring-brand' : 'ring-1 ring-white/5 hover:ring-white/20'
      }`}
    >
      <ArtThumb
        src={r.imageUrl}
        alt={r.name}
        tier={r.tier}
        className="absolute inset-0 h-full w-full !object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
        <TierBadge tier={r.tier} solid />
        <CostBadges cost={r.cost} starCost={r.starCost} />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-2.5">
        <span className="flex items-center gap-1.5">
          {r.character && r.character !== 'neutral' && (
            <CharacterAvatar id={r.character} size={18} />
          )}
          <span className="truncate text-sm font-semibold text-white drop-shadow">
            {r.name}
          </span>
        </span>
        <div className="flex flex-wrap gap-1">
          {r.cardType && (
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${typeClass(r.cardType)}`}
            >
              {r.cardType}
            </span>
          )}
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${rarityClass(r.rarity)}`}
          >
            {r.rarity}
          </span>
        </div>
      </div>
    </button>
  )
}

/** Relic archetype tags → the classes that want them most. */
const TAG_CLASSES: Record<string, string[]> = {
  strength: ['ironclad'],
  block: ['ironclad'],
  'block-scaling': ['ironclad'],
  exhaust: ['ironclad'],
  'self-damage': ['ironclad'],
  poison: ['silent'],
  shiv: ['silent'],
  discard: ['silent'],
  weak: ['silent'],
  'orb-gen': ['defect'],
  focus: ['defect'],
  frost: ['defect'],
  lightning: ['defect'],
  evoke: ['defect'],
  'star-gen': ['regent'],
  'star-spend': ['regent'],
  decree: ['regent'],
  minion: ['necrobinder'],
  sacrifice: ['necrobinder'],
  'corpse-gen': ['necrobinder'],
  'minion-buff': ['necrobinder']
}

/** Which classes a relic is best for: its own class, else inferred from tags. */
function relicBestFor(row: BrowseRow): string[] {
  if (row.character && row.character !== 'neutral') return [row.character]
  const set = new Set<string>()
  for (const t of row.tags) for (const c of TAG_CLASSES[t] ?? []) set.add(c)
  return [...set]
}

function RelicGrid({ rows }: { rows: BrowseRow[] }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex gap-3 rounded-xl bg-surface-900 p-3 ring-1 ring-white/5"
        >
          <div className="relative shrink-0">
            <ArtThumb
              src={r.imageUrl}
              alt={r.name}
              tier={r.tier}
              className="h-14 w-14 rounded-lg bg-surface-950 !object-cover"
            />
            <span className="absolute -left-1.5 -top-1.5">
              <TierBadge tier={r.tier} solid className="h-5 min-w-[1.25rem] text-[11px]" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-zinc-50">
                {r.name}
              </span>
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${rarityClass(r.rarity)}`}
              >
                {r.rarity}
              </span>
            </div>
            {r.description && (
              <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                <GameText text={r.description} />
              </p>
            )}
            {r.commentary && (
              <p className="mt-1.5 text-xs italic leading-relaxed text-zinc-400">
                {r.commentary}
              </p>
            )}
            <BestFor classes={relicBestFor(r)} />
          </div>
        </div>
      ))}
    </div>
  )
}

function BestFor({ classes }: { classes: string[] }): React.JSX.Element {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/5 pt-2 text-[11px]">
      <span className="text-zinc-500">Best for:</span>
      {classes.length === 0 ? (
        <span className="text-zinc-300">Any class</span>
      ) : (
        classes.map((c) => (
          <span key={c} className="flex items-center gap-1 text-zinc-300">
            <CharacterAvatar id={c} size={14} />
            {charMeta(c).label}
          </span>
        ))
      )}
    </div>
  )
}

function fmtUpgrade(v: number | string): string {
  return typeof v === 'number' && v > 0 ? `+${v}` : String(v)
}

/** Which words of B (upgraded) are part of the longest common subsequence with A. */
function lcsMatched(a: string[], b: string[]): boolean[] {
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1]!.toLowerCase()
    const row = dp[i]!
    const prev = dp[i - 1]!
    for (let j = 1; j <= m; j++) {
      row[j] =
        ai === b[j - 1]!.toLowerCase()
          ? prev[j - 1]! + 1
          : Math.max(prev[j]!, row[j - 1]!)
    }
  }
  const matched = new Array<boolean>(m).fill(false)
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (a[i - 1]!.toLowerCase() === b[j - 1]!.toLowerCase()) {
      matched[j - 1] = true
      i--
      j--
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i--
    else j--
  }
  return matched
}

function renderTemplate(
  tmpl: string,
  vars: Record<string, number | string>
): string {
  return tmpl.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`
  )
}

/** Match an upgrade key to a var name (handles the "power_" prefix). */
function matchVarKey(
  vars: Record<string, number | string>,
  key: string
): string | null {
  if (key in vars) return key
  if (`power_${key}` in vars) return `power_${key}`
  const found = Object.keys(vars).find((v) => v === key || v.endsWith(`_${key}`))
  return found ?? null
}

interface UpgradeView {
  upgradedDesc?: string
  gainedKeywords: string[]
  fallback: [string, number | string][]
}

/** Resolve an upgrade into a clear upgraded sentence + keyword gains. */
function computeUpgrade(row: BrowseRow): UpgradeView | null {
  const up = row.upgrade
  if (!up || Object.keys(up).length === 0) return null
  const entries = Object.entries(up)
  const gainedKeywords: string[] = []
  const fallback: [string, number | string][] = []
  let upgradedDesc: string | undefined

  const descEntry = entries.find(([k]) => k.toLowerCase() === 'description')
  if (descEntry) upgradedDesc = String(descEntry[1])

  for (const [k, v] of entries) {
    if (k.toLowerCase().includes('keyword')) {
      const arr = Array.isArray(v) ? v : [String(v)]
      gainedKeywords.push(...arr.map(String))
    }
  }

  if (!upgradedDesc && row.descriptionTemplate && row.vars) {
    const newVars: Record<string, number | string> = { ...row.vars }
    let applied = false
    for (const [k, v] of entries) {
      if (typeof v !== 'number') continue
      const vk = matchVarKey(newVars, k)
      if (vk) {
        newVars[vk] = (Number(newVars[vk]) || 0) + v
        applied = true
      } else fallback.push([k, v])
    }
    if (applied) upgradedDesc = renderTemplate(row.descriptionTemplate, newVars)
  } else if (!upgradedDesc) {
    for (const [k, v] of entries) {
      const kl = k.toLowerCase()
      if (kl === 'description' || kl.includes('keyword')) continue
      if (typeof v === 'number' || typeof v === 'string') fallback.push([k, v])
    }
  }

  return { upgradedDesc, gainedKeywords, fallback }
}

/** Upgraded description with the words that changed vs the base highlighted. */
function UpgradeDiff({
  base,
  upgraded
}: {
  base?: string
  upgraded: string
}): React.JSX.Element {
  if (!base) {
    return (
      <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">
        <GameText text={upgraded} />
      </p>
    )
  }
  const a = base.trim().split(/\s+/)
  const b = upgraded.trim().split(/\s+/)
  const matched = lcsMatched(a, b)
  const runs: { changed: boolean; words: string[] }[] = []
  b.forEach((w, idx) => {
    const changed = !matched[idx]
    const cur = runs[runs.length - 1]
    if (cur && cur.changed === changed) cur.words.push(w)
    else runs.push({ changed, words: [w] })
  })
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">
      {runs.map((r, i) => (
        <React.Fragment key={i}>
          {i > 0 ? ' ' : ''}
          {r.changed ? (
            <span className="rounded bg-emerald-500/25 px-0.5 font-semibold text-emerald-200">
              <GameText text={r.words.join(' ')} />
            </span>
          ) : (
            <GameText text={r.words.join(' ')} />
          )}
        </React.Fragment>
      ))}
    </p>
  )
}

function CardDetail({
  row,
  onClose
}: {
  row: BrowseRow
  onClose: () => void
}): React.JSX.Element {
  const up = computeUpgrade(row)
  const showChar = !!row.character && row.character !== 'neutral'
  return (
    <aside className="absolute bottom-4 right-4 top-4 z-20 flex w-80 flex-col overflow-y-auto rounded-2xl bg-surface-900/70 shadow-2xl shadow-black/60 ring-1 ring-white/10 backdrop-blur-2xl">
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-t-2xl">
        <ArtThumb
          src={row.imageUrl}
          alt={row.name}
          tier={row.tier}
          className="absolute inset-0 h-full w-full !object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-900/90 via-surface-900/30 to-transparent" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-surface-950/80 p-1.5 text-zinc-200 ring-1 ring-surface-700 hover:text-white"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 pr-12">
          <TierBadge tier={row.tier} solid />
          <CostBadges cost={row.cost} starCost={row.starCost} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-4">
          {showChar && <CharacterAvatar id={row.character} size={26} />}
          <h2 className="text-xl font-bold text-white drop-shadow">{row.name}</h2>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-bold ${charMeta(row.character).text}`}>
            {charMeta(row.character).label}
          </span>
          <span className="text-xs text-zinc-600">·</span>
          {row.cardType && (
            <span className={`rounded border px-2 py-0.5 text-xs font-medium ${typeClass(row.cardType)}`}>
              {row.cardType}
            </span>
          )}
          <span className={`rounded border px-2 py-0.5 text-xs font-medium capitalize ${rarityClass(row.rarity)}`}>
            {row.rarity}
          </span>
        </div>

        {row.target && row.target.toLowerCase() !== 'none' && (
          <p className="text-xs text-zinc-500">
            Target: <span className="text-zinc-300">{row.target}</span>
          </p>
        )}

        {row.description && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">
            <GameText text={row.description} />
          </p>
        )}

        {up && (
          <div className="rounded-lg bg-emerald-500/10 p-3 ring-1 ring-emerald-500/25">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              Upgraded {row.name}
            </div>
            {up.upgradedDesc && (
              <UpgradeDiff base={row.description} upgraded={up.upgradedDesc} />
            )}
            {up.gainedKeywords.length > 0 && (
              <p className={`text-sm leading-relaxed text-zinc-200 ${up.upgradedDesc ? 'mt-2' : ''}`}>
                <span className="text-zinc-400">
                  Gains keyword{up.gainedKeywords.length > 1 ? 's' : ''}:{' '}
                </span>
                {up.gainedKeywords.map((kw, i) => (
                  <React.Fragment key={kw}>
                    {i > 0 ? ', ' : ''}
                    <span className="font-semibold">
                      <GameText text={kw} />
                    </span>
                  </React.Fragment>
                ))}
              </p>
            )}
            {up.fallback.length > 0 && (
              <p className={`text-sm leading-relaxed text-zinc-200 ${up.upgradedDesc || up.gainedKeywords.length ? 'mt-2' : ''}`}>
                {up.fallback.map(([k, v], i) => (
                  <span key={k}>
                    {i > 0 && <span className="text-zinc-600">, </span>}
                    <span className="capitalize text-zinc-400">{k.replace(/_/g, ' ')}</span>{' '}
                    <span className="font-bold text-emerald-300">{fmtUpgrade(v)}</span>
                  </span>
                ))}
              </p>
            )}
          </div>
        )}

        {row.commentary && (
          <div className="rounded-lg border border-surface-800 bg-surface-950 p-3">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-brand">
              Commentary{row.author ? ` · ${row.author}` : ''}
            </p>
            <p className="text-sm leading-relaxed text-zinc-200">{row.commentary}</p>
          </div>
        )}
      </div>
    </aside>
  )
}
