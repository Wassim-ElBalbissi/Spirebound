import { readFileSync } from 'fs'
import type { McpClient } from '../mcpClient'
import type { CardInstance } from '../../types/gameState'
import { logger } from '../logger'
import { parseCurrentRunDeck } from './deckParse'

const COMPENDIUM_PATH = '/api/v1/compendium'

/**
 * Fetches the player's current deck from the STS2MCP compendium endpoint so
 * card / relic / shop advice can reason about the real deck *outside* combat —
 * the singleplayer run-state endpoint only exposes the deck during combat
 * (split across the draw/discard/exhaust piles).
 *
 * The exact JSON shape of /api/v1/compendium is owned by the external mod and
 * is not guaranteed, so parsing is deliberately defensive: any unexpected
 * payload, transport error, or missing field degrades to `null` (= deck
 * unknown), which the recommender treats exactly like today's empty-deck path.
 *
 * Set MOCK_COMPENDIUM=<path> to read the deck from a JSON file instead of HTTP —
 * lets `MOCK_STATE` runs exercise deck-aware advice without the game running.
 */
export class CurrentRunDeckFetcher {
  /** floor -> deck snapshot. The deck only changes between floors. */
  private readonly cache = new Map<number, CardInstance[]>()

  constructor(private readonly client: McpClient) {}

  /**
   * Returns the deck for `floor`, fetching it at most once per floor and
   * caching the result. Returns `null` when the deck can't be determined.
   */
  async getDeck(
    floor: number,
    signal?: AbortSignal
  ): Promise<CardInstance[] | null> {
    const cached = this.cache.get(floor)
    if (cached) return cached

    const body = await this.loadRaw(signal)
    if (body === null) return null

    const deck = parseCurrentRunDeck(body)
    if (!deck) return null
    this.cache.set(floor, deck)
    return deck
  }

  /** Drop cached decks — call when a run ends so the next run refetches. */
  reset(): void {
    this.cache.clear()
  }

  private async loadRaw(signal?: AbortSignal): Promise<unknown> {
    const mockPath = process.env['MOCK_COMPENDIUM']
    if (mockPath) {
      try {
        return JSON.parse(readFileSync(mockPath, 'utf-8'))
      } catch (err) {
        logger.error({ err, mockPath }, 'MOCK_COMPENDIUM read failed')
        return null
      }
    }
    try {
      const res = await this.client.get<unknown>(COMPENDIUM_PATH, signal)
      if (res.status >= 400 || res.body == null) return null
      return res.body
    } catch {
      // McpUnavailableError / abort / network — degrade silently to "unknown".
      return null
    }
  }
}
