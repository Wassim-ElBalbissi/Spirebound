import React, { useEffect, useMemo, useState } from 'react'
import type {
  CardTierEntry,
  RelicTierEntry,
  TierBundle
} from '../../../main/types/tierData'
import type { BuildEntry } from '../../../main/types/compendium'
import { useCompendium, useTierData } from './hooks'
import { ArtThumb, TierBadge } from './ui'
import { CharacterAvatar, charMeta, rarityClass, typeClass } from './meta'
import { CostBadges, GameText } from './symbols'

/** Difficulty pill colors. */
const DIFFICULTY_STYLE: Record<string, string> = {
  Easy: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  Medium: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  Hard: 'bg-rose-500/15 text-rose-300 ring-rose-500/30'
}

function DifficultyChip({ value }: { value: string }): React.JSX.Element {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
        DIFFICULTY_STYLE[value] ?? 'bg-surface-800 text-zinc-300 ring-white/10'
      }`}
      title={`${value} to pilot`}
    >
      {value}
    </span>
  )
}

/** Prettify a bundle id (e.g. DEADLY_POISON -> Deadly Poison) for fallbacks. */
function prettifyId(id: string): string {
  return id
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function MiniCard({
  imageUrl,
  name,
  cost,
  starCost
}: {
  imageUrl?: string
  name: string
  cost?: number | string
  starCost?: number
}): React.JSX.Element {
  return (
    <div className="w-[72px] shrink-0" title={name}>
      <div className="relative aspect-[5/6] overflow-hidden rounded-md ring-1 ring-white/5">
        <ArtThumb
          src={imageUrl}
          alt={name}
          className="absolute inset-0 h-full w-full !object-cover"
        />
        {(cost !== undefined || starCost) && (
          <span className="absolute right-0.5 top-0.5 scale-[0.7] origin-top-right">
            <CostBadges cost={cost} starCost={starCost} />
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-center text-[10px] text-zinc-400">{name}</p>
    </div>
  )
}

export function BuildCard({
  build,
  bundle
}: {
  build: BuildEntry
  bundle: TierBundle
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const cards = (build.keyCards ?? [])
    .map((id) => bundle.cards[id])
    .filter((c): c is CardTierEntry => !!c)
  const relics = (build.keyRelics ?? [])
    .map((id) => bundle.relics[id])
    .filter((r): r is RelicTierEntry => !!r)

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="group cursor-pointer rounded-xl border border-surface-800 bg-surface-900 p-4 text-left transition-colors hover:border-brand/40 hover:bg-surface-800/60 focus:outline-none focus-visible:border-brand/60"
      >
        <div className="flex items-start gap-3">
          <TierBadge tier={build.tier} solid className="h-7 min-w-[1.75rem] text-sm" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-zinc-50">
              {build.name}
            </h3>
            <p className="mt-0.5 text-sm text-zinc-400">{build.summary}</p>
          </div>
          <Rating value={build.rating} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1">
          {build.difficulty && <DifficultyChip value={build.difficulty} />}
          {build.archetypeTags.map((t) => (
            <span
              key={t}
              className="rounded bg-surface-950 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400"
            >
              {t}
            </span>
          ))}
        </div>

        {cards.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Key cards
            </p>
            <div className="flex flex-wrap gap-2">
              {cards.map((c) => (
                <MiniCard
                  key={c.id}
                  imageUrl={c.imageUrl}
                  name={c.name}
                  cost={c.cost}
                  starCost={c.starCost}
                />
              ))}
            </div>
          </div>
        )}

        {relics.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Key relics
            </p>
            <div className="flex flex-wrap gap-2">
              {relics.map((r) => (
                <div key={r.id} className="flex items-center gap-1.5" title={r.name}>
                  <ArtThumb
                    src={r.imageUrl}
                    alt={r.name}
                    className="h-9 w-9 rounded-md bg-surface-950 ring-1 ring-white/5 !object-cover"
                  />
                  <span className="text-xs text-zinc-300">{r.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-3 flex items-center gap-1 text-xs font-medium text-brand opacity-80 transition-opacity group-hover:opacity-100">
          View full guide
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </p>
      </div>

      {open && (
        <BuildDetail build={build} bundle={bundle} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function Rating({ value }: { value: number }): React.JSX.Element {
  return (
    <div className="shrink-0 text-right">
      <div className="text-lg font-extrabold leading-none text-zinc-50">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">rating</div>
    </div>
  )
}

/** A key card rendered with its full rules text for the detail view. */
function DetailCard({
  id,
  card
}: {
  id: string
  card?: CardTierEntry
}): React.JSX.Element {
  const name = card?.name ?? prettifyId(id)
  return (
    <div className="flex gap-3 rounded-lg bg-surface-950 p-2.5 ring-1 ring-white/5">
      <div className="relative h-[84px] w-[70px] shrink-0 overflow-hidden rounded-md ring-1 ring-white/10">
        <ArtThumb
          src={card?.imageUrl}
          alt={name}
          tier={card?.tier}
          className="absolute inset-0 h-full w-full !object-cover"
        />
        {card && (card.cost !== undefined || card.starCost) && (
          <span className="absolute right-0.5 top-0.5 scale-[0.72] origin-top-right">
            <CostBadges cost={card.cost} starCost={card.starCost} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-zinc-100">{name}</span>
          {card?.type && (
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${typeClass(card.type)}`}
            >
              {card.type}
            </span>
          )}
          {card && (
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${rarityClass(card.rarity)}`}
            >
              {card.rarity}
            </span>
          )}
        </div>
        {card?.description ? (
          <p className="mt-1 text-xs leading-relaxed text-zinc-300">
            <GameText text={card.description} />
          </p>
        ) : (
          <p className="mt-1 text-xs italic text-zinc-500">
            Card details load with the tier data.
          </p>
        )}
      </div>
    </div>
  )
}

function DetailRelic({
  id,
  relic
}: {
  id: string
  relic?: RelicTierEntry
}): React.JSX.Element {
  const name = relic?.name ?? prettifyId(id)
  return (
    <div className="flex gap-3 rounded-lg bg-surface-950 p-2.5 ring-1 ring-white/5">
      <ArtThumb
        src={relic?.imageUrl}
        alt={name}
        tier={relic?.tier}
        className="h-11 w-11 shrink-0 rounded-md bg-surface-900 ring-1 ring-white/10 !object-cover"
      />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-semibold text-zinc-100">{name}</span>
        {relic?.description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-300">
            <GameText text={relic.description} />
          </p>
        ) : (
          <p className="mt-0.5 text-xs italic text-zinc-500">
            Relic details load with the tier data.
          </p>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
      {children}
    </h3>
  )
}

const PHASES: { key: 'early' | 'mid' | 'late'; label: string }[] = [
  { key: 'early', label: 'Early · Act 1' },
  { key: 'mid', label: 'Mid · Act 2' },
  { key: 'late', label: 'Late · Bosses' }
]

export function BuildDetail({
  build,
  bundle,
  onClose
}: {
  build: BuildEntry
  bundle: TierBundle
  onClose: () => void
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const meta = charMeta(build.character)
  const keyCardIds = build.keyCards ?? []
  const keyRelicIds = build.keyRelics ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${build.name} build guide`}
        onMouseDown={(e) => e.stopPropagation()}
        className={`relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-surface-900 shadow-2xl shadow-black/60 ring-1 ${meta.ring}`}
      >
        {/* Header banner */}
        <div className="relative h-40 shrink-0">
          <ArtThumb
            src={meta.imageUrl}
            alt={meta.label}
            className="absolute inset-0 h-full w-full !object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/60 to-surface-900/10" />
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
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
            <TierBadge tier={build.tier} solid className="h-8 min-w-[2rem] text-base" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CharacterAvatar id={build.character} size={20} />
                <span className={`text-xs font-semibold ${meta.text}`}>
                  {meta.label}
                </span>
                {build.difficulty && <DifficultyChip value={build.difficulty} />}
              </div>
              <h2 className="mt-0.5 truncate text-2xl font-extrabold text-white drop-shadow">
                {build.name}
              </h2>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-2xl font-extrabold leading-none text-white drop-shadow">
                {build.rating}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-300">
                rating
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <p className="text-sm leading-relaxed text-zinc-300">{build.summary}</p>

          <div className="flex flex-wrap gap-1.5">
            {build.archetypeTags.map((t) => (
              <span
                key={t}
                className="rounded bg-surface-950 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400 ring-1 ring-white/5"
              >
                {t}
              </span>
            ))}
          </div>

          {build.winCondition && (
            <div className="rounded-xl bg-brand/10 p-4 ring-1 ring-brand/25">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Win condition
              </p>
              <p className="text-sm leading-relaxed text-zinc-100">
                <GameText text={build.winCondition} />
              </p>
            </div>
          )}

          {build.howToPlay && (
            <div>
              <SectionTitle>How to play</SectionTitle>
              <p className="text-sm leading-relaxed text-zinc-300">
                <GameText text={build.howToPlay} />
              </p>
            </div>
          )}

          {build.gamePlan &&
            PHASES.some((p) => build.gamePlan?.[p.key]) && (
              <div>
                <SectionTitle>Game plan</SectionTitle>
                <div className="space-y-2.5">
                  {PHASES.map((p) =>
                    build.gamePlan?.[p.key] ? (
                      <div
                        key={p.key}
                        className="flex flex-col gap-1.5 rounded-lg bg-surface-950 p-3 ring-1 ring-white/5 sm:flex-row sm:gap-3"
                      >
                        <span className="shrink-0 self-start rounded bg-surface-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                          {p.label}
                        </span>
                        <p className="text-sm leading-relaxed text-zinc-300">
                          <GameText text={build.gamePlan[p.key]!} />
                        </p>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}

          {build.priorities && build.priorities.length > 0 && (
            <div>
              <SectionTitle>Pickup priority</SectionTitle>
              <ol className="space-y-1.5">
                {build.priorities.map((p, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-zinc-300">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/20 text-[11px] font-bold text-emerald-300">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">
                      <GameText text={p} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {keyCardIds.length > 0 && (
            <div>
              <SectionTitle>Key cards</SectionTitle>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {keyCardIds.map((id) => (
                  <DetailCard key={id} id={id} card={bundle.cards[id]} />
                ))}
              </div>
            </div>
          )}

          {keyRelicIds.length > 0 && (
            <div>
              <SectionTitle>Key relics</SectionTitle>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {keyRelicIds.map((id) => (
                  <DetailRelic key={id} id={id} relic={bundle.relics[id]} />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {build.tips && build.tips.length > 0 && (
              <div>
                <SectionTitle>Tips</SectionTitle>
                <ul className="space-y-1.5">
                  {build.tips.map((t, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-zinc-300">
                      <span className="mt-0.5 shrink-0 text-emerald-400">✓</span>
                      <span>
                        <GameText text={t} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {build.pitfalls && build.pitfalls.length > 0 && (
              <div>
                <SectionTitle>Pitfalls</SectionTitle>
                <ul className="space-y-1.5">
                  {build.pitfalls.map((t, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-zinc-300">
                      <span className="mt-0.5 shrink-0 text-rose-400">✕</span>
                      <span>
                        <GameText text={t} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {build.sources && build.sources.length > 0 && (
            <div className="border-t border-surface-800 pt-4">
              <SectionTitle>Sources &amp; further reading</SectionTitle>
              <p className="mb-2 text-xs leading-relaxed text-zinc-500">
                Curated by Spirebound from the in-app card &amp; relic data, informed by
                community strategy. Not lifted from a single external guide.
              </p>
              <div className="flex flex-wrap gap-2">
                {build.sources.map((s) =>
                  s.url ? (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => void window.overlay?.openExternal(s.url!)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-surface-950 px-2.5 py-1.5 text-xs text-zinc-300 ring-1 ring-white/10 transition-colors hover:text-zinc-100 hover:ring-brand/40"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M10 14L21 3M21 3h-6M21 3v6" />
                        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                      </svg>
                      {s.label}
                    </button>
                  ) : (
                    <span
                      key={s.label}
                      className="inline-flex items-center rounded-lg bg-surface-950 px-2.5 py-1.5 text-xs text-zinc-400 ring-1 ring-white/10"
                    >
                      {s.label}
                    </span>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function BuildsPage(): React.JSX.Element {
  const { builds } = useCompendium()
  const bundle = useTierData()

  const byChar = useMemo(() => {
    const map = new Map<string, BuildEntry[]>()
    for (const b of builds) {
      const arr = map.get(b.character) ?? []
      arr.push(b)
      map.set(b.character, arr)
    }
    for (const arr of map.values()) arr.sort((a, b) => b.rating - a.rating)
    return map
  }, [builds])

  return (
    <div className="h-full overflow-y-auto p-6">
      <header className="mb-5">
        <h1 className="text-lg font-semibold text-zinc-50">Builds</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Proven archetypes per character, rated — click any build for a full
          how-to-play guide with key cards, relics, a game plan, and sources.
        </p>
      </header>

      {builds.length === 0 ? (
        <p className="text-sm text-zinc-500">No builds available.</p>
      ) : (
        <div className="space-y-6">
          {[...byChar.entries()].map(([char, list]) => (
            <section key={char}>
              <div className="mb-2 flex items-center gap-2">
                <CharacterAvatar id={char} size={24} />
                <h2 className="text-sm font-semibold text-zinc-200">
                  {charMeta(char).label}
                </h2>
                <span className="text-xs text-zinc-600">
                  {list.length} build{list.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {list.map((b) => (
                  <BuildCard key={b.id} build={b} bundle={bundle} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
