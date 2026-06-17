import React, { useState } from 'react'
import type { Tier } from '../../../main/types/tierData'
import { TIER_BADGE, TIER_RAIL } from '../theme/tiers'

export function TierBadge({
  tier,
  solid = false,
  className = ''
}: {
  tier: Tier
  /** Solid tier-colored chip with white text — for use over card art. */
  solid?: boolean
  className?: string
}): React.JSX.Element {
  const style = solid
    ? `${TIER_RAIL[tier]} text-white ring-1 ring-black/30 shadow-md`
    : `border ${TIER_BADGE[tier]}`
  return (
    <span
      className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-xs font-extrabold ${style} ${className}`}
    >
      {tier}
    </span>
  )
}

/** Rating bar colored by tier with an inline numeric label (op.gg style). */
export function ScoreBar({
  score,
  tier,
  showValue = true
}: {
  score: number
  tier?: Tier
  showValue?: boolean
}): React.JSX.Element {
  const pct = Math.max(0, Math.min(100, score))
  const fill = tier ? TIER_RAIL[tier] : 'bg-brand'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-700">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      {showValue && (
        <span className="w-7 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-400">
          {Math.round(score)}
        </span>
      )}
    </div>
  )
}

/**
 * Route remote images through the disk-cached `simg://` scheme so they're only
 * downloaded once (see main/services/imageCache.ts).
 */
export function cachedSrc(url?: string): string | undefined {
  if (!url) return url
  if (url.startsWith('https://')) return 'simg://' + url.slice('https://'.length)
  if (url.startsWith('http://')) return 'simg://' + url.slice('http://'.length)
  return url
}

/** Remote art thumbnail with a tier-colored placeholder fallback. */
export function ArtThumb({
  src,
  alt,
  tier,
  className = ''
}: {
  src?: string
  alt: string
  tier?: Tier
  className?: string
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-950 ${className}`}
      >
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            tier ? TIER_BADGE[tier] : 'text-zinc-500'
          }`}
        >
          {alt.slice(0, 2)}
        </span>
      </div>
    )
  }
  return (
    <img
      src={cachedSrc(src)}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-contain ${className}`}
    />
  )
}

export function Pill({
  children,
  active = false,
  onClick,
  title
}: {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
  title?: string
}): React.JSX.Element {
  const base =
    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors border'
  const cls = active
    ? 'bg-brand/20 border-brand/50 text-emerald-200'
    : 'bg-surface-800 border-surface-700 text-zinc-400 hover:text-zinc-200 hover:border-surface-700'
  return (
    <button type="button" title={title} onClick={onClick} className={`${base} ${cls}`}>
      {children}
    </button>
  )
}

export function Tag({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
      {children}
    </span>
  )
}

/** Primary call-to-action — subtle emerald→sky gradient that ties to the logo. */
export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  title,
  className = ''
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
  className?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500/90 to-sky-500/90 px-3 py-1.5 text-xs font-semibold text-white shadow-sm ring-1 ring-white/10 transition-all hover:from-emerald-400 hover:to-sky-400 hover:shadow-md hover:shadow-sky-950/40 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

export function Select({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-1.5 text-xs text-zinc-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs font-medium text-zinc-200 outline-none focus:border-brand/60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function SearchBar({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): React.JSX.Element {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? 'Search…'}
      className="w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-brand/60"
    />
  )
}

export function EmptyState({
  title,
  hint
}: {
  title: string
  hint?: string
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center p-10 text-center">
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {hint && <p className="mt-1 max-w-md text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}
