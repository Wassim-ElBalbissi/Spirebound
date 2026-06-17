import type { Tier } from './tierData'

/**
 * A user-authored tier list. `kind` selects which catalog it ranks; `tiers`
 * maps an entry id (card id or relic id) to the tier the user assigned it.
 * Entries absent from the map fall back to their official/bundled tier when
 * rendered, and are left untouched when applied to the overlay's bundle.
 */
export interface CustomTierList {
  id: string
  name: string
  kind: 'card' | 'relic'
  tiers: Record<string, Tier>
  /** Optional per-entry note shown in the Hub. */
  notes?: Record<string, string>
  createdAt: number
  updatedAt: number
}

/** Wire format for export/import (file or share-code). */
export interface TierListShare {
  format: 'slay-overlay-tierlist'
  version: 1
  list: CustomTierList
}
