/**
 * Derive archetype/mechanic tags for a card from its rules text.
 *
 * Pure and dependency-free so it's unit-testable and can run both at
 * bundle-build time (`spireArchive.ts`) and at runtime against the live combat
 * deck — pile cards arrive with a description but no resolved tier-data id, so
 * tagging off the text is the only reliable signal there.
 *
 * The emitted strings MUST match, verbatim, the vocabulary used by
 *   - `ARCHETYPE_TAGS` in `recommender/synergy.ts` (drives synergy scoring), and
 *   - `archetypeTags` in `resources/compendium/builds.json` (drives buildMatch),
 * because every downstream consumer compares with `.has()` / `.includes()`.
 * Emit the canonical tag, never the raw word (e.g. "Channel" -> `orb-gen`).
 *
 * Tags are intentionally character-agnostic: `synergyScore`/`detectBuild` already
 * scope relevance per character, so emitting e.g. `block` on a Silent card is
 * harmless (that character weights it 0 and no Silent build references it).
 */

export interface ArchetypeTagInput {
  description?: string
  descriptionTemplate?: string
  /** Keyword names (e.g. "Exhaust", "Channel"); folded into the text scan. */
  keywords?: string[]
  type?: string
}

/**
 * Each rule contributes its `tags` when `re` matches the combined lowercased
 * text (description + template + keywords). Ordering is irrelevant — results
 * are deduped into a set.
 */
const TERM_RULES: { re: RegExp; tags: string[] }[] = [
  // --- Defect: orbs / focus ---
  { re: /\bchannel\b/, tags: ['orb-gen'] },
  { re: /\borbs?\b/, tags: ['orb-gen'] },
  { re: /\blightning\b/, tags: ['lightning', 'orb-gen'] },
  { re: /\bfrost\b/, tags: ['frost', 'orb-gen'] },
  { re: /\bdark\b/, tags: ['dark', 'orb-gen'] },
  { re: /\bplasma\b/, tags: ['plasma', 'orb-gen'] },
  { re: /\bfocus\b/, tags: ['focus'] },
  { re: /\bevoke[ds]?\b/, tags: ['evoke', 'orb-gen'] },

  // --- Silent: poison / shiv / discard / draw ---
  { re: /\bpoison\b/, tags: ['poison'] },
  { re: /\bshivs?\b/, tags: ['shiv'] },
  { re: /\bdiscard\b/, tags: ['discard'] },
  { re: /\bdraw\s+(?:\d+|a|x)\s+cards?\b/, tags: ['draw-cycle'] },
  { re: /\bweak\b/, tags: ['weak', 'debuff'] },

  // --- Ironclad: strength / block / exhaust / self-damage ---
  { re: /\bstrength\b/, tags: ['strength'] },
  { re: /\bexhausts?\b/, tags: ['exhaust'] },
  { re: /\bblock\b/, tags: ['block'] },
  {
    re: /block is not removed|equal to your block|\bdexterity\b/,
    tags: ['block-scaling']
  },
  {
    re: /\blose\s+\d+\s+(?:hp|health)\b|\btake\s+\d+\s+damage\b/,
    tags: ['self-damage']
  },

  // --- Regent: stars / forge / court / decree ---
  { re: /\bforges?\b/, tags: ['forge'] },
  { re: /\bdecree\b/, tags: ['decree'] },
  { re: /\bcourt\b/, tags: ['court-summon'] },
  { re: /\bgain[^.]*\[s\]/, tags: ['star-gen'] },
  { re: /\bspend[^.]*\[s\]/, tags: ['star-spend'] },
  { re: /\[s\]/, tags: ['star-gen'] }, // fallback: any star card scales stars

  // --- Necrobinder: minions / sacrifice / corpse / soul / doom ---
  { re: /\bsummons?\b/, tags: ['minion'] },
  { re: /\bminions?\b/, tags: ['minion'] },
  { re: /\bosty\b/, tags: ['minion', 'minion-buff'] },
  { re: /\bsacrifices?\b/, tags: ['sacrifice'] },
  { re: /\bcorpses?\b/, tags: ['corpse-gen'] },
  { re: /\bsouls?\b/, tags: ['soul'] },
  { re: /\bdoom\b/, tags: ['doom', 'debuff'] },
  { re: /\bvulnerable\b/, tags: ['debuff'] }
]

const TYPE_TAGS: Record<string, string> = {
  attack: 'attack',
  skill: 'skill',
  power: 'power'
}

export function deriveArchetypeTags(input: ArchetypeTagInput): string[] {
  const text = [
    input.description ?? '',
    input.descriptionTemplate ?? '',
    ...(input.keywords ?? [])
  ]
    .join(' ')
    .toLowerCase()

  const tags = new Set<string>()
  for (const rule of TERM_RULES) {
    if (rule.re.test(text)) {
      for (const t of rule.tags) tags.add(t)
    }
  }

  const typeTag = input.type ? TYPE_TAGS[input.type.toLowerCase()] : undefined
  if (typeTag) tags.add(typeTag)

  return [...tags]
}
