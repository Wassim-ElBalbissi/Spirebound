import React, { useRef, useState } from 'react'
import type { CharacterEntry, Compendium } from '../../../main/types/compendium'
import { ArtThumb, Tag } from './ui'
import { charMeta } from './meta'
import { BuildCard } from './BuildsPage'
import { useTierData } from './hooks'

/** Click-drag horizontal panning, with click suppression after a real drag. */
function useDragScroll(): {
  ref: React.RefObject<HTMLDivElement | null>
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onWheel: (e: React.WheelEvent) => void
  guardClick: (e: React.MouseEvent) => void
} {
  const ref = useRef<HTMLDivElement>(null)
  const st = useRef({ down: false, startX: 0, left: 0, moved: false })
  return {
    ref,
    onPointerDown: (e) => {
      const el = ref.current
      if (!el) return
      st.current = { down: true, startX: e.clientX, left: el.scrollLeft, moved: false }
    },
    onPointerMove: (e) => {
      const el = ref.current
      const s = st.current
      if (!el || !s.down) return
      if (e.buttons === 0) {
        s.down = false
        return
      }
      const dx = e.clientX - s.startX
      if (Math.abs(dx) > 5) s.moved = true
      el.scrollLeft = s.left - dx
    },
    onPointerUp: () => {
      st.current.down = false
    },
    onWheel: (e) => {
      const el = ref.current
      if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY
    },
    guardClick: (e) => {
      if (st.current.moved) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
  }
}

export function CharactersPage({
  data
}: {
  data: Compendium
}): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const drag = useDragScroll()

  if (data.characters.length === 0) {
    return (
      <div className="p-6 text-sm text-zinc-500">No characters yet.</div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-6 pt-6">
        <h1 className="text-lg font-semibold text-zinc-50">Characters</h1>
      </div>
      <div
        ref={drag.ref}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onWheel={drag.onWheel}
        onClickCapture={drag.guardClick}
        className="min-h-0 flex-1 cursor-grab select-none overflow-x-auto overflow-y-hidden py-6 pl-6 active:cursor-grabbing"
      >
        <div className="flex h-full gap-4">
          {data.characters.map((c) =>
            selectedId === c.id ? (
              <ExpandedPanel
                key={c.id}
                character={c}
                builds={data.builds.filter((b) => b.character === c.id)}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <Column
                key={c.id}
                character={c}
                buildCount={data.builds.filter((b) => b.character === c.id).length}
                onClick={() => setSelectedId(c.id)}
              />
            )
          )}
          {/* trailing padding so the last card isn't flush to the edge */}
          <div aria-hidden className="w-2 shrink-0" />
        </div>
      </div>
    </div>
  )
}

function Column({
  character,
  buildCount,
  onClick
}: {
  character: CharacterEntry
  buildCount: number
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative h-full w-60 shrink-0 overflow-hidden rounded-2xl text-left shadow-lg shadow-black/40 ring-1 transition-shadow hover:shadow-black/60 ${charMeta(character.id).ring}`}
    >
      <ArtThumb
        src={character.imageUrl}
        alt={character.name}
        className="absolute inset-0 h-full w-full !object-cover transition-transform duration-300 group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        <h2 className="text-2xl font-extrabold text-white drop-shadow">
          {character.name}
        </h2>
        <p className="mt-1 line-clamp-2 text-sm text-zinc-200 drop-shadow">
          {character.blurb}
        </p>
        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand/20 px-2.5 py-1 text-[11px] font-semibold uppercase text-emerald-300">
          {buildCount} build{buildCount === 1 ? '' : 's'} →
        </span>
      </div>
    </button>
  )
}

function ExpandedPanel({
  character,
  builds,
  onClose
}: {
  character: CharacterEntry
  builds: Compendium['builds']
  onClose: () => void
}): React.JSX.Element {
  const bundle = useTierData()
  return (
    <div
      // Don't let interactions inside the panel start a horizontal drag.
      onPointerDown={(e) => e.stopPropagation()}
      className={`flex h-full w-[620px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface-900 shadow-xl shadow-black/50 ring-1 ${charMeta(character.id).ring}`}
    >
      <div className="relative h-44 shrink-0">
        <ArtThumb
          src={character.imageUrl}
          alt={character.name}
          className="absolute inset-0 h-full w-full !object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/40 to-transparent" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-surface-950/80 p-1.5 text-zinc-200 ring-1 ring-surface-700 hover:text-white"
          aria-label="Collapse"
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h2 className="text-2xl font-extrabold text-white drop-shadow">
            {character.name}
          </h2>
          <p className="mt-0.5 text-sm text-zinc-200 drop-shadow">{character.blurb}</p>
        </div>
      </div>

      <div
        // Let this area scroll vertically without the row hijacking the wheel.
        onWheel={(e) => e.stopPropagation()}
        className="min-h-0 flex-1 overflow-y-auto p-5"
      >
        {character.description && (
          <p className="text-sm leading-relaxed text-zinc-300">
            {character.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1">
          {character.archetypes.map((a) => (
            <Tag key={a}>{a}</Tag>
          ))}
        </div>

        <h3 className="mb-3 mt-5 text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Recommended builds
        </h3>
        {builds.length === 0 ? (
          <p className="text-sm text-zinc-500">No builds yet for this character.</p>
        ) : (
          <div className="space-y-3">
            {builds
              .sort((a, b) => b.rating - a.rating)
              .map((b) => (
                <BuildCard key={b.id} build={b} bundle={bundle} />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
