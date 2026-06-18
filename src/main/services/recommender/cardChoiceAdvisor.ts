import type { CardInstance, CombatState } from '../../types/gameState'
import type { TierBundle } from '../../types/tierData'
import type { CardPickRankedView } from '../../types/recommendation'

export type HandSelectAction = 'discard' | 'exhaust' | 'keep'

/**
 * Combat-aware ranking for an in-combat hand selection (`hand_select`).
 *
 * Each candidate gets a "keep value" — how much you want this card right now —
 * from its tier blended with the board: block cards spike when you're taking a
 * hit, Powers are sacrosanct, Status/Curse and basic Strike/Defend are chaff.
 * For `discard`/`exhaust` we recommend the *lowest* keep value (the chaff);
 * for a fetch (`keep`) we recommend the *highest*. The list is returned already
 * ordered so #1 is the card to pick.
 */
export function rankHandSelect(
  cards: CardInstance[],
  combat: CombatState,
  action: HandSelectAction,
  bundle?: TierBundle
): CardPickRankedView[] {
  const incoming = incomingAttackDamage(combat)
  const blockNeeded = Math.max(0, incoming - combat.block)
  const hasAttacker = incoming > 0

  const scored = cards.map((card, i) => {
    const { keep, rationale } = keepValue(card, {
      blockNeeded,
      hasAttacker,
      bundle
    })
    return { card, i, keep, rationale }
  })

  const dumping = action === 'discard' || action === 'exhaust'
  // Dumping → worst (lowest keep) first; fetching → best (highest keep) first.
  scored.sort((a, b) => (dumping ? a.keep - b.keep : b.keep - a.keep))

  return scored.map(({ card, i, keep, rationale }) => ({
    offerIndex: i,
    id: card.id,
    name: card.name,
    // Show a positive figure that grows with how right the pick is: how
    // dumpable the card is when discarding, how valuable when keeping.
    score: Math.round(dumping ? Math.max(0, 100 - keep) : Math.max(0, keep)),
    rationale
  }))
}

interface KeepCtx {
  blockNeeded: number
  hasAttacker: boolean
  bundle?: TierBundle
}

/** How much you want to keep/play this card on the current board (0..~130). */
function keepValue(
  card: CardInstance,
  ctx: KeepCtx
): { keep: number; rationale: string[] } {
  const rationale: string[] = []
  const desc = card.description ?? ''
  const entry = ctx.bundle?.cards[card.id]
  // Intrinsic quality from the tier bundle (0..100); neutral when unknown.
  let keep = entry ? entry.blendedScore : 45

  const isStatusCurse = card.type === 'Status' || card.type === 'Curse'
  const isPower = card.type === 'Power'
  const isAttack = card.type === 'Attack' || /deal\s+\d+\s+damage/i.test(desc)
  const givesBlock = /gain\s+\d+\s+block/i.test(desc)
  const isBasic =
    card.rarity === 'Basic' || /^(STRIKE|DEFEND)(_|$)/i.test(card.id)
  const ethereal = /ethereal/i.test(desc) || (card.tags ?? []).some((t) => /ethereal/i.test(t))

  if (isStatusCurse) {
    keep = 0
    rationale.push('Status/Curse — dead weight, dump it.')
  } else if (ethereal) {
    keep -= 30
    rationale.push('Ethereal — it exhausts anyway; safe to drop.')
  } else if (isPower) {
    keep += 30
    rationale.push('Power — scales the fight, never discard.')
  }

  if (givesBlock && ctx.blockNeeded > 0) {
    keep += 25
    rationale.push(`You need Block (${ctx.blockNeeded} incoming) — keep it.`)
  }
  if (isAttack && ctx.hasAttacker && !isBasic) {
    keep += 6
    rationale.push('Useful attack this turn.')
  }
  if (isBasic && !isStatusCurse) {
    keep -= 14
    rationale.push('Basic card — lowest deck value.')
  }
  if (card.upgraded) keep += 4

  if (rationale.length === 0) {
    rationale.push(entry ? `Tier ${entry.tier}.` : 'Average value.')
  }
  return { keep, rationale }
}

/** Total damage the enemies' attack intents threaten this turn. */
function incomingAttackDamage(combat: CombatState): number {
  let total = 0
  for (const e of combat.enemies) {
    const intent = e.intent
    if (!intent || !intent.type.toLowerCase().startsWith('attack')) continue
    const m = (intent.label ?? '').match(/(\d+)\s*[×x*]\s*(\d+)|(\d+)/i)
    if (!m) continue
    total += m[1] && m[2] ? Number(m[1]) * Number(m[2]) : Number(m[3] ?? 0)
  }
  return total
}
