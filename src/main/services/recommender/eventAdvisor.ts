import type { EventChoice } from '../../types/gameState'

/**
 * Run context an event choice is judged against. HP fraction drives how harshly
 * HP costs are penalized; deck size drives how much a card-removal is worth.
 */
export interface EventContext {
  hp: number
  maxHp: number
  act: number
  floor: number
  /** Known deck size (0 when unknown — removal value falls back to neutral). */
  deckSize: number
  gold: number
}

export interface EventChoiceRanked {
  index: number
  title: string
  description: string
  score: number
  rationale: string[]
  isLocked: boolean
  wasChosen: boolean
}

/**
 * Heuristic event-choice advisor.
 *
 * No curated per-option tier data exists (early-access events ship with empty
 * tags), so each option is scored by parsing its effect text and weighing it
 * against the run: relics and permanent stats rank highest, card removal scales
 * with deck size, and HP costs are penalized harder the lower your HP. Every
 * credited effect emits a rationale line, and a hard floor flags any option that
 * would take more HP than you have. It's a transparent heuristic, not a solver.
 */
export function rankEventChoices(
  choices: EventChoice[],
  ctx: EventContext
): EventChoiceRanked[] {
  const ranked = choices.map((c) => scoreChoice(c, ctx))
  // Locked options sink to the bottom; otherwise highest score first. Stable on
  // ties so the game's own ordering is preserved.
  return ranked
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      if (a.r.isLocked !== b.r.isLocked) return a.r.isLocked ? 1 : -1
      return b.r.score - a.r.score || a.i - b.i
    })
    .map(({ r }) => r)
}

const WORD_NUM: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5
}

function num(token: string | undefined): number {
  if (!token) return 0
  const n = Number(token)
  if (Number.isFinite(n)) return n
  return WORD_NUM[token.toLowerCase()] ?? 0
}

/** Curse / status cards an event might shove into your deck. */
const BAD_CARD_RE =
  /\b(curse|wound|dazed|burn|parasite|doubt|regret|shame|pain|decay|writhe|clumsy|injury|normality|pride)\b/i

function scoreChoice(choice: EventChoice, ctx: EventContext): EventChoiceRanked {
  const rationale: string[] = []
  if (choice.isLocked) {
    return {
      index: choice.index,
      title: choice.title,
      description: choice.description,
      score: -1000,
      rationale: ['Locked — unavailable.'],
      isLocked: true,
      wasChosen: choice.wasChosen
    }
  }

  const d = choice.description
  let score = 0
  const hpFrac = ctx.maxHp > 0 ? ctx.hp / ctx.maxHp : 1
  // HP costs hurt more the lower you are: ×1 at full, up to ×2.5 near death.
  const hpRisk = 1 + 1.5 * (1 - hpFrac)

  // --- Gains -------------------------------------------------------------
  const relic = /\b(relic)\b/i.test(d) || /obtain .*relic/i.test(d)
  if (relic) {
    const rare = /\brare\b/i.test(d)
    const boss = /\bboss\b/i.test(d)
    const v = boss ? 36 : rare ? 32 : 26
    score += v
    rationale.push(`Gains a relic${rare ? ' (Rare)' : boss ? ' (Boss)' : ''} — premium value.`)
  }

  const maxHp = d.match(/gain\s+(\d+)\s+max\s*hp/i)
  if (maxHp) {
    const n = Number(maxHp[1])
    score += n * 2.2
    rationale.push(`+${n} Max HP — permanent.`)
  }

  // "Choose a card to add" / a card reward — you pick, so it's upside. Worth
  // more in Act 1 while the deck is still being shaped.
  if (/choose .*card|card reward|add a card/i.test(d) && !BAD_CARD_RE.test(d)) {
    const v = ctx.act <= 1 ? 15 : ctx.act === 2 ? 12 : 9
    score += v
    rationale.push('Adds a card you choose.')
  } else {
    // A *specific* card forced into the deck — mild dilution unless it's clearly
    // a curse/status (handled below as a penalty).
    const add = d.match(/add\s+(\d+|a|an|one|two)\b[^.]*\bto your deck/i)
    if (add && !BAD_CARD_RE.test(d)) {
      score += 4
      rationale.push('Adds a fixed card — slight deck dilution.')
    }
  }

  const potion = /\bpotion(s)?\b/i.test(d)
  if (potion) {
    score += 9
    rationale.push('Gains a potion.')
  }

  const gold = d.match(/gain\s+(\d+)\s+gold/i)
  if (gold) {
    const n = Number(gold[1])
    score += n * 0.04
    rationale.push(`+${n} gold.`)
  }

  const heal = d.match(/(?:heal|gain|restore)\s+(\d+)\s+(?:hp|health)\b/i)
  if (heal && !/max/i.test(d)) {
    const n = Number(heal[1])
    const missing = Math.max(0, ctx.maxHp - ctx.hp)
    const effective = Math.min(n, missing)
    score += effective * 0.6
    rationale.push(
      effective > 0
        ? `Heals ${effective} HP.`
        : 'Healing wasted — already near full.'
    )
  }

  // --- Deck sculpting ----------------------------------------------------
  const remove = d.match(/(?:remove|purge|exhaust)\s+(\d+|a|an|one|two|three)\s+cards?/i)
  if (remove) {
    const n = num(remove[1])
    // Removal scales with deck size: thinning a bloated deck is worth more.
    const deck = ctx.deckSize > 0 ? ctx.deckSize : 15
    const perCard = deck >= 20 ? 17 : deck >= 12 ? 15 : 11
    score += n * perCard
    rationale.push(`Removes ${n} card${n === 1 ? '' : 's'} — thins your deck.`)
  }

  const upgrade = d.match(/upgrade\s+(\d+|a|an|one|two|all)\s+cards?/i)
  if (upgrade) {
    const tok = upgrade[1] ?? ''
    const all = /all/i.test(tok)
    const n = all ? 3 : num(tok)
    score += n * 9
    rationale.push(`Upgrades ${all ? 'cards' : n + ' card' + (n === 1 ? '' : 's')}.`)
  }

  const transform = d.match(/transform\s+(\d+|a|an|one|two)\s+cards?/i)
  if (transform) {
    const n = num(transform[1])
    score += n * 6
    rationale.push(`Transforms ${n} card${n === 1 ? '' : 's'} (random result).`)
  }

  // --- Costs -------------------------------------------------------------
  const loseMax = d.match(/lose\s+(\d+)\s+max\s*hp/i)
  if (loseMax) {
    const n = Number(loseMax[1])
    score -= n * 3
    rationale.push(`−${n} Max HP — permanent loss.`)
  }

  // Current-HP cost ("Lose N HP", "Take N damage"), excluding the Max HP case.
  const hpCost = d.match(/(?:lose|take)\s+(\d+)\s+(?:hp|health|damage)/i)
  if (hpCost && !/max/i.test(d)) {
    const n = Number(hpCost[1])
    if (n >= ctx.hp) {
      score -= 1000
      rationale.push(`Costs ${n} HP — would down you (${ctx.hp} HP).`)
    } else {
      const penalty = n * hpRisk
      score -= penalty
      rationale.push(
        hpFrac < 0.4
          ? `Costs ${n} HP — risky at ${ctx.hp}/${ctx.maxHp}.`
          : `Costs ${n} HP.`
      )
    }
  }

  if (BAD_CARD_RE.test(d) && /add|gain|put|deck/i.test(d)) {
    score -= 16
    rationale.push('Adds a Curse/Status card — clogs your deck.')
  }

  if (/lose .*all .*gold|lose your gold/i.test(d)) {
    score -= ctx.gold * 0.05
    rationale.push('Loses your gold.')
  }
  if (/lose .*relic/i.test(d)) {
    score -= 22
    rationale.push('Loses a relic.')
  }

  // --- Neutral / safe ----------------------------------------------------
  if (choice.isProceed || /^(leave|ignore|continue|nothing|skip)\b/i.test(choice.title)) {
    // A do-nothing exit is a safe baseline — better than a net-negative option,
    // worse than any real gain.
    score += 3
    if (rationale.length === 0) rationale.push('Leave — safe, no cost.')
  }

  if (rationale.length === 0) {
    rationale.push('Effect not recognized — judge by your build.')
  }

  return {
    index: choice.index,
    title: choice.title,
    description: choice.description,
    score: Math.round(score * 10) / 10,
    rationale,
    isLocked: false,
    wasChosen: choice.wasChosen
  }
}
