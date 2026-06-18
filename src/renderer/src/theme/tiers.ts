import type { Tier } from '../../../main/types/tierData'

/** Canonical tier order, strongest first. */
export const TIER_ORDER: Tier[] = ['S', 'A', 'B', 'C', 'D', 'F']

/**
 * Canonical tier color classes, shared across the overlay advice panels and the
 * Hub's tier lists so a card looks the same everywhere.
 */
export const TIER_BADGE: Record<Tier, string> = {
  S: 'text-fuchsia-300 bg-fuchsia-500/20 border-fuchsia-400/60',
  A: 'text-emerald-300 bg-emerald-500/20 border-emerald-400/60',
  B: 'text-sky-300 bg-sky-500/20 border-sky-400/60',
  C: 'text-zinc-200 bg-zinc-500/20 border-zinc-400/60',
  D: 'text-amber-200 bg-amber-500/20 border-amber-400/60',
  F: 'text-rose-300 bg-rose-500/20 border-rose-400/60'
}

/** Solid accent (left rail of a tier row). */
export const TIER_RAIL: Record<Tier, string> = {
  S: 'bg-fuchsia-500',
  A: 'bg-emerald-500',
  B: 'bg-sky-500',
  C: 'bg-zinc-500',
  D: 'bg-amber-500',
  F: 'bg-rose-500'
}

export function tierFromScore(score: number): Tier {
  if (score >= 80) return 'S'
  if (score >= 70) return 'A'
  if (score >= 55) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}
