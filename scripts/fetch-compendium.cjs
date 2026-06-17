/* eslint-disable */
// Fetches the full Potions + Events datasets from spire-archive and writes them
// to resources/compendium/{potions,events}.json in our schema (with image URLs).
// Run: node scripts/fetch-compendium.cjs
const fs = require('fs')
const path = require('path')

const HOST = 'https://spire-archive.com'

async function fetchAll(type) {
  let out = []
  let offset = 0
  for (;;) {
    const res = await fetch(`${HOST}/api/sts2/${type}?limit=200&offset=${offset}`)
    const json = await res.json()
    out = out.concat(json.items)
    if (out.length >= json.total || json.items.length === 0) break
    offset += json.items.length
  }
  return out
}

const RARITY = (r) => {
  const x = String(r || '').toLowerCase()
  if (x === 'common' || x === 'uncommon' || x === 'rare') return x
  if (x === 'event') return 'event'
  return 'common'
}

// Light keyword tagging for filtering/search.
function potionTags(desc) {
  const t = []
  const d = (desc || '').toLowerCase()
  const add = (k, tag) => d.includes(k) && t.push(tag)
  add('block', 'block')
  add('strength', 'strength')
  add('dexterity', 'dexterity')
  add('energy', 'energy')
  add('poison', 'poison')
  add('weak', 'weak')
  add('vulnerable', 'vulnerable')
  add('draw', 'draw')
  add('heal', 'sustain')
  add('damage', 'damage')
  return [...new Set(t)]
}

;(async () => {
  const potions = (await fetchAll('potions')).map((p) => ({
    id: p.id,
    name: p.name,
    rarity: RARITY(p.rarity),
    description: p.description || '',
    tags: potionTags(p.description),
    imageUrl: `${HOST}/images/sts2/potions/${p.id.toLowerCase()}.png`
  }))

  const events = (await fetchAll('events')).map((e) => {
    const act = Number(e.act)
    return {
      id: e.id,
      name: e.name,
      acts: Number.isFinite(act) ? [act] : [],
      description: (e.description || '').trim(),
      tags: []
    }
  })

  // Glossary: powers (buffs/debuffs/statuses) + enchantments + authored
  // card keywords (Innate/Ethereal/… aren't exposed by the API).
  const powers = (await fetchAll('powers')).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    kind: p.type === 'Debuff' ? 'Debuff' : 'Buff'
  }))
  const enchants = (await fetchAll('enchantments')).map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description || '',
    kind: 'Enchantment'
  }))
  const KEYWORDS = [
    ['Innate', 'Starts in your opening hand.'],
    [
      'Ethereal',
      'If this card is in your hand at the end of your turn, it is Exhausted.'
    ],
    ['Exhaust', 'When played, this card leaves your deck for the rest of combat.'],
    ['Retain', 'This card is not discarded at the end of your turn.'],
    ['Replay', 'Plays this card an additional time.'],
    ['Unplayable', 'This card cannot be played.'],
    ['Purge', 'Permanently removes the card from your deck.']
  ].map(([name, description]) => ({
    id: `KW_${name.toUpperCase()}`,
    name,
    description,
    kind: 'Keyword'
  }))

  // De-dup by lowercased name (authored keywords win).
  const seen = new Set(KEYWORDS.map((k) => k.name.toLowerCase()))
  const glossary = [...KEYWORDS]
  for (const e of [...powers, ...enchants]) {
    if (seen.has(e.name.toLowerCase())) continue
    seen.add(e.name.toLowerCase())
    glossary.push(e)
  }
  glossary.sort((a, b) => a.name.localeCompare(b.name))

  const dir = path.join(__dirname, '..', 'resources', 'compendium')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'potions.json'),
    JSON.stringify(potions, null, 2)
  )
  fs.writeFileSync(
    path.join(dir, 'events.json'),
    JSON.stringify(events, null, 2)
  )
  fs.writeFileSync(
    path.join(dir, 'glossary.json'),
    JSON.stringify(glossary, null, 2)
  )
  console.log(
    `wrote ${potions.length} potions, ${events.length} events, ${glossary.length} glossary`
  )
})()
