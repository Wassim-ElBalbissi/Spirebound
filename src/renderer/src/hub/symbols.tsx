import React from 'react'
import type { GlossaryEntry } from '../../../main/types/compendium'
import { Term, useGlossary } from './glossary'

/** Inline energy orb sized to the surrounding text. */
export function EnergyIcon({ className = '' }: { className?: string }): React.JSX.Element {
  return (
    <span
      className={`inline-flex h-[1.05em] w-[1.05em] -translate-y-[0.05em] items-center justify-center rounded-full bg-gradient-to-b from-sky-400 to-sky-600 align-middle text-white shadow-sm ring-1 ring-sky-900/40 ${className}`}
    >
      <svg width="60%" height="60%" viewBox="0 0 9 11" aria-hidden>
        <path d="M5 0 L0 6 H4 L3 11 L9 4 H5 Z" fill="currentColor" />
      </svg>
    </span>
  )
}

/** Inline gold star sized to the surrounding text. */
export function StarIcon({ className = '' }: { className?: string }): React.JSX.Element {
  return (
    <span
      className={`inline-flex h-[1.05em] w-[1.05em] -translate-y-[0.05em] items-center justify-center rounded-full bg-gradient-to-b from-amber-300 to-amber-500 align-middle text-white shadow-sm ring-1 ring-amber-900/40 ${className}`}
    >
      <svg width="68%" height="68%" viewBox="0 0 12 12" aria-hidden>
        <path
          d="M6 0 L7.6 4 L12 4.4 L8.6 7.2 L9.7 11.5 L6 9 L2.3 11.5 L3.4 7.2 L0 4.4 L4.4 4 Z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}

/**
 * Renders game text, replacing [E]/[S] tokens with inline icons and
 * highlighting glossary terms (powers / statuses / keywords) with tooltips.
 */
export function GameText({ text }: { text: string }): React.JSX.Element {
  const { map, alt } = useGlossary()
  const parts = text.split(/(\[E\]|\[S\])/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p === '[E]') return <EnergyIcon key={i} />
        if (p === '[S]') return <StarIcon key={i} />
        return <Highlighted key={i} text={p} map={map} alt={alt} />
      })}
    </>
  )
}

function Highlighted({
  text,
  map,
  alt
}: {
  text: string
  map: Map<string, GlossaryEntry>
  alt: string | null
}): React.JSX.Element {
  if (!alt || !text) return <>{text}</>
  // Capture an optional leading amount so "1 Strength" highlights as a unit.
  const re = new RegExp(`(\\d+\\s+)?\\b(${alt})\\b`, 'gi')
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    const entry = map.get((m[2] ?? '').toLowerCase())
    if (entry) {
      out.push(<Term key={start} entry={entry} label={m[0]} />)
    } else {
      out.push(m[0])
    }
    last = start + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

/** Corner badge: energy cost. */
export function EnergyBadge({ cost }: { cost: number | string }): React.JSX.Element {
  return (
    <span
      className="inline-flex h-6 min-w-[1.65rem] items-center justify-center gap-1 rounded-md bg-gradient-to-b from-sky-400 to-sky-600 px-1.5 text-xs font-bold leading-none text-white shadow-md ring-1 ring-black/25"
      title={`Energy cost ${cost}`}
    >
      <svg width="11" height="13" viewBox="0 0 9 11" className="shrink-0 drop-shadow" aria-hidden>
        <path d="M5 0 L0 6 H4 L3 11 L9 4 H5 Z" fill="currentColor" />
      </svg>
      <span className="leading-none">{cost}</span>
    </span>
  )
}

/** Corner badge: star cost (Regent). */
export function StarBadge({ stars }: { stars: number }): React.JSX.Element {
  return (
    <span
      className="inline-flex h-6 min-w-[1.65rem] items-center justify-center gap-1 rounded-md bg-gradient-to-b from-amber-300 to-amber-500 px-1.5 text-xs font-bold leading-none text-white shadow-md ring-1 ring-black/25"
      title={`Star cost ${stars}`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 drop-shadow" aria-hidden>
        <path
          d="M6 0 L7.6 4 L12 4.4 L8.6 7.2 L9.7 11.5 L6 9 L2.3 11.5 L3.4 7.2 L0 4.4 L4.4 4 Z"
          fill="currentColor"
        />
      </svg>
      <span className="leading-none">{stars}</span>
    </span>
  )
}

/**
 * Show the resource cost(s). Star cards (Regent) spend Stars; lead with the
 * star badge and only show energy when it actually costs energy so a
 * "0 energy / 3 stars" card doesn't show a confusing "0".
 */
export function CostBadges({
  cost,
  starCost
}: {
  cost?: number | string
  starCost?: number
}): React.JSX.Element | null {
  const hasStar = typeof starCost === 'number' && starCost > 0
  const energyNum = typeof cost === 'number' ? cost : undefined
  const showEnergy =
    cost !== undefined && cost !== '' && !(hasStar && energyNum === 0)
  if (!showEnergy && !hasStar) return null
  return (
    <span className="flex items-center gap-1">
      {showEnergy && <EnergyBadge cost={cost as number | string} />}
      {hasStar && <StarBadge stars={starCost as number} />}
    </span>
  )
}
