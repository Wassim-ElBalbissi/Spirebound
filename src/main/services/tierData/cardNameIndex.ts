import type { TierBundle } from '../../types/tierData'
import type { CardInstance, Character } from '../../types/gameState'

/**
 * Resolve card *names* to tier-data *ids*. Cards reconstructed from the combat
 * piles have no id (the mod omits it), so we map their display name to the
 * bundle id, scoped to the run's character to disambiguate shared names like
 * "Strike" / "Defend" (STRIKE_DEFECT vs STRIKE_IRONCLAD).
 */

let cache: { bundle: TierBundle; index: Map<string, string> } | null = null

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function buildIndex(bundle: TierBundle): Map<string, string> {
  const index = new Map<string, string>()
  for (const c of Object.values(bundle.cards)) {
    const key = `${c.character}|${normalizeName(c.name)}`
    // First id wins — bundle order is stable, so this is deterministic.
    if (!index.has(key)) index.set(key, c.id)
  }
  return index
}

function getIndex(bundle: TierBundle): Map<string, string> {
  if (!cache || cache.bundle !== bundle) {
    cache = { bundle, index: buildIndex(bundle) }
  }
  return cache.index
}

/** Look up the bundle id for a card name, character-scoped with a neutral fallback. */
export function resolveCardId(
  name: string,
  character: Character,
  bundle: TierBundle
): string | undefined {
  const index = getIndex(bundle)
  const nn = normalizeName(name)
  return index.get(`${character}|${nn}`) ?? index.get(`neutral|${nn}`)
}

/**
 * Return a copy of the deck with placeholder (name-based) ids resolved to real
 * bundle ids. Cards whose id already exists in the bundle are left untouched;
 * unresolvable cards keep their placeholder id (still usable via their tags).
 */
export function resolveDeckIds(
  deck: CardInstance[],
  character: Character,
  bundle: TierBundle
): CardInstance[] {
  return deck.map((card) => {
    if (bundle.cards[card.id]) return card
    const resolved = resolveCardId(card.name, character, bundle)
    return resolved ? { ...card, id: resolved } : card
  })
}
