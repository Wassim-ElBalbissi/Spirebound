import React, { useMemo } from 'react'
import type {
  CardTierEntry,
  RelicTierEntry,
  TierBundle
} from '../../../main/types/tierData'
import type { BuildEntry } from '../../../main/types/compendium'
import { useCompendium, useTierData } from './hooks'
import { ArtThumb, TierBadge } from './ui'
import { CharacterAvatar, charMeta } from './meta'
import { CostBadges } from './symbols'

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
  const cards = (build.keyCards ?? [])
    .map((id) => bundle.cards[id])
    .filter((c): c is CardTierEntry => !!c)
  const relics = (build.keyRelics ?? [])
    .map((id) => bundle.relics[id])
    .filter((r): r is RelicTierEntry => !!r)

  return (
    <div className="rounded-xl border border-surface-800 bg-surface-900 p-4">
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

      {build.howToPlay && (
        <p className="mt-3 text-xs leading-relaxed text-zinc-400">{build.howToPlay}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1">
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
    </div>
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
          Proven archetypes per character, rated — with their key cards and relics.
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
