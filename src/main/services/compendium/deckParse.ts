import type { CardInstance } from '../../types/gameState'

/**
 * Pull a deck out of an unknown compendium payload. Pure (no Electron / logger
 * imports) so it stays unit-testable. The exact JSON shape of /api/v1/compendium
 * is owned by the external STS2MCP mod and not guaranteed, so this tries the
 * documented `current_run` block first, then a few obvious fallbacks. Each card
 * may be a bare id string or an object with id/card_id + name + an upgrade flag.
 * Returns `null` for anything it can't confidently read.
 */
export function parseCurrentRunDeck(body: unknown): CardInstance[] | null {
  const arr = findDeckArray(body)
  if (!arr) return null
  const cards: CardInstance[] = []
  for (const raw of arr) {
    const card = toCardInstance(raw)
    if (card) cards.push(card)
  }
  return cards.length > 0 ? cards : null
}

function findDeckArray(body: unknown): unknown[] | null {
  if (!isObject(body)) return null
  const currentRun = isObject(body['current_run'])
    ? (body['current_run'] as Record<string, unknown>)
    : null
  const candidates = [
    currentRun?.['deck'],
    currentRun?.['cards'],
    body['deck'],
    body['cards']
  ]
  for (const c of candidates) {
    if (Array.isArray(c)) return c
  }
  return null
}

function toCardInstance(raw: unknown): CardInstance | null {
  if (typeof raw === 'string') {
    return { id: raw, name: raw, upgraded: false }
  }
  if (!isObject(raw)) return null
  const id = firstString(raw['id'], raw['card_id'], raw['cardId'])
  if (!id) return null
  const name = firstString(raw['name']) ?? id
  const upgraded =
    raw['is_upgraded'] === true ||
    raw['upgraded'] === true ||
    (typeof raw['upgrades'] === 'number' && (raw['upgrades'] as number) > 0)
  const rarity = firstString(raw['rarity'])
  const type = firstString(raw['type'])
  return { id, name, upgraded, rarity, type }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}
