import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import type { GlossaryEntry } from '../../../main/types/compendium'

interface Anchor {
  left: number
  top: number
  bottom: number
}

interface GlossaryCtx {
  map: Map<string, GlossaryEntry>
  /** Escaped term alternation, e.g. "Strength|Dexterity|…" (null if empty). */
  alt: string | null
  select: (entry: GlossaryEntry, anchor: Anchor) => void
}

const Ctx = createContext<GlossaryCtx>({
  map: new Map(),
  alt: null,
  select: () => {}
})

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const KIND_STYLE: Record<GlossaryEntry['kind'], string> = {
  Buff: 'text-emerald-300/90 decoration-emerald-400/40',
  Debuff: 'text-rose-300/90 decoration-rose-400/40',
  Keyword: 'text-sky-300/90 decoration-sky-400/40',
  Enchantment: 'text-violet-300/90 decoration-violet-400/40'
}
const KIND_CHIP: Record<GlossaryEntry['kind'], string> = {
  Buff: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  Debuff: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  Keyword: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  Enchantment: 'bg-violet-500/15 text-violet-300 ring-violet-500/30'
}

export function GlossaryProvider({
  entries,
  children
}: {
  entries: GlossaryEntry[]
  children: React.ReactNode
}): React.JSX.Element {
  const [popup, setPopup] = useState<{ entry: GlossaryEntry; anchor: Anchor } | null>(
    null
  )

  const value = useMemo<GlossaryCtx>(() => {
    const map = new Map<string, GlossaryEntry>()
    for (const e of entries) map.set(e.name.toLowerCase(), e)
    const alt =
      entries.length === 0
        ? null
        : [...map.values()]
            .map((e) => e.name)
            .sort((a, b) => b.length - a.length)
            .map(escapeRe)
            .join('|')
    return { map, alt, select: (entry, anchor) => setPopup({ entry, anchor }) }
  }, [entries])

  useEffect(() => {
    if (!popup) return
    const close = (): void => setPopup(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPopup(null)
    }
    // Defer so the opening click doesn't immediately close it.
    const t = setTimeout(() => {
      window.addEventListener('mousedown', close)
      window.addEventListener('wheel', close, { passive: true })
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', close)
      window.removeEventListener('wheel', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [popup])

  return (
    <Ctx.Provider value={value}>
      {children}
      {popup && <Popover entry={popup.entry} anchor={popup.anchor} />}
    </Ctx.Provider>
  )
}

function Popover({
  entry,
  anchor
}: {
  entry: GlossaryEntry
  anchor: Anchor
}): React.JSX.Element {
  const W = 256
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - W - 8)
  const below = anchor.bottom < window.innerHeight - 180
  const style: React.CSSProperties = below
    ? { left, top: anchor.top + (anchor.bottom - anchor.top) + 6 }
    : { left, bottom: window.innerHeight - anchor.top + 6 }
  return (
    <div
      style={{ position: 'fixed', width: W, ...style, zIndex: 60 }}
      onMouseDown={(e) => e.stopPropagation()}
      className="rounded-xl bg-surface-900/95 p-3 shadow-2xl shadow-black/60 ring-1 ring-white/10 backdrop-blur-xl"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={`text-sm font-bold ${KIND_STYLE[entry.kind].split(' ')[0]}`}>
          {entry.name}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${KIND_CHIP[entry.kind]}`}
        >
          {entry.kind}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-zinc-200">{entry.description}</p>
    </div>
  )
}

export function useGlossary(): GlossaryCtx {
  return useContext(Ctx)
}

/** A glossary term that opens a click popover describing its effect. */
export function Term({
  entry,
  label
}: {
  entry: GlossaryEntry
  label?: string
}): React.JSX.Element {
  const { select } = useGlossary()
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        const r = e.currentTarget.getBoundingClientRect()
        select(entry, { left: r.left, top: r.top, bottom: r.bottom })
      }}
      className={`cursor-pointer font-semibold underline decoration-dotted underline-offset-2 hover:decoration-solid ${KIND_STYLE[entry.kind]}`}
    >
      {label ?? entry.name}
    </button>
  )
}
