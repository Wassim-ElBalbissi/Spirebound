import React, { useState } from 'react'
import { cachedSrc } from './ui'

/** Color-coded rarity chips (cards, relics, potions). */
export const RARITY_STYLE: Record<string, string> = {
  starter: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  common: 'bg-zinc-400/15 text-zinc-200 border-zinc-400/30',
  uncommon: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  rare: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  special: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  event: 'bg-teal-500/15 text-teal-300 border-teal-500/40',
  boss: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40',
  shop: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  curse: 'bg-rose-500/15 text-rose-300 border-rose-500/40'
}

const FALLBACK_RARITY = 'bg-zinc-400/15 text-zinc-200 border-zinc-400/30'

export function rarityClass(rarity: string): string {
  return RARITY_STYLE[rarity?.toLowerCase()] ?? FALLBACK_RARITY
}

/** Color-coded card types. */
export const TYPE_STYLE: Record<string, string> = {
  Attack: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  Skill: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  Power: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  Status: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  Curse: 'bg-rose-700/20 text-rose-300 border-rose-600/40'
}

const FALLBACK_TYPE = 'bg-sky-500/15 text-sky-300 border-sky-500/40'

export function typeClass(type?: string): string {
  return (type && TYPE_STYLE[type]) || FALLBACK_TYPE
}

export interface CharMeta {
  label: string
  /** Accent color (tailwind text/border friendly hex via arbitrary values). */
  ring: string
  text: string
  imageUrl?: string
}

const HOST = 'https://spire-archive.com'

export const CHARACTER_META: Record<string, CharMeta> = {
  ironclad: {
    label: 'Ironclad',
    ring: 'ring-red-500/60',
    text: 'text-red-300',
    imageUrl: `${HOST}/images/sts2/characters/ironclad.jpg`
  },
  silent: {
    label: 'Silent',
    ring: 'ring-emerald-500/60',
    text: 'text-emerald-300',
    imageUrl: `${HOST}/images/sts2/characters/silent.jpg`
  },
  defect: {
    label: 'Defect',
    ring: 'ring-sky-500/60',
    text: 'text-sky-300',
    imageUrl: `${HOST}/images/sts2/characters/defect.jpg`
  },
  regent: {
    label: 'Regent',
    ring: 'ring-amber-500/60',
    text: 'text-amber-300',
    imageUrl: `${HOST}/images/sts2/characters/regent.jpg`
  },
  necrobinder: {
    label: 'Necrobinder',
    ring: 'ring-violet-500/60',
    text: 'text-violet-300',
    imageUrl: `${HOST}/images/sts2/characters/necrobinder.jpg`
  },
  neutral: { label: 'Colorless', ring: 'ring-zinc-500', text: 'text-zinc-300' }
}

const NEUTRAL: CharMeta = {
  label: 'Colorless',
  ring: 'ring-zinc-500',
  text: 'text-zinc-300'
}

export function charMeta(id?: string): CharMeta {
  return CHARACTER_META[id ?? 'neutral'] ?? NEUTRAL
}

/** Small round character avatar (portrait, or colored initial fallback). */
export function CharacterAvatar({
  id,
  size = 22,
  title
}: {
  id?: string
  size?: number
  title?: string
}): React.JSX.Element {
  const meta = charMeta(id)
  const [failed, setFailed] = useState(false)
  const common = `inline-flex items-center justify-center overflow-hidden rounded-full ring-2 ${meta.ring} bg-surface-950`
  if (!meta.imageUrl || failed) {
    return (
      <span
        title={title ?? meta.label}
        style={{ width: size, height: size }}
        className={`${common} text-[10px] font-bold ${meta.text}`}
      >
        {meta.label.slice(0, 1)}
      </span>
    )
  }
  return (
    <img
      src={cachedSrc(meta.imageUrl)}
      alt={meta.label}
      title={title ?? meta.label}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`${common} object-cover`}
    />
  )
}
