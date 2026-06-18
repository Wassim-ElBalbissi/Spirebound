import React from 'react'
import type { CombatPlayResultView } from '../../../main/types/recommendation'
import type { Tier } from '../../../main/types/tierData'
import { ArtThumb, TierBadge } from '../hub/ui'
import { CostBadges } from '../hub/symbols'

export interface CombatAdviceProps {
  result: CombatPlayResultView
}

type Row = CombatPlayResultView['ranked'][number]
type Orb = CombatPlayResultView['orbs'][number]
type Potion = CombatPlayResultView['potions'][number]

export function CombatAdvice({ result }: CombatAdviceProps): React.JSX.Element {
  const top = result.ranked[0]
  // Drop notes shown as dedicated sections.
  const notes = result.notes.filter(
    (n) => !/^Incoming /.test(n) && !/^Orbs deal/.test(n)
  )
  return (
    <div className="flex h-full w-full items-start justify-between gap-3 p-3 text-zinc-100">
      {/* LEFT — what to play + orbs / notes / potions */}
      <div className="flex w-[290px] shrink-0 flex-col gap-2">
        {top && <PlayCallout row={top} />}
        <InfoSection orbs={result.orbs} potions={result.potions} notes={notes} />
      </div>

      {/* CENTER — the hand */}
      <HandSection ranked={result.ranked} />

      {/* RIGHT — incoming stacked over incoming-by-enemy */}
      <div className="flex w-[260px] shrink-0 flex-col items-end gap-2">
        <IncomingSection
          incoming={result.incomingDamage}
          blockNeeded={result.blockNeeded}
        />
        <ThreatSection threats={result.threats} />
      </div>
    </div>
  )
}

function Section({
  title,
  className,
  children
}: {
  title?: string
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section
      className={`flex max-h-[220px] flex-col overflow-y-auto rounded-lg bg-zinc-900/65 px-2.5 py-2 ring-1 ring-white/5 ${className ?? ''}`}
    >
      {title && (
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {title}
        </div>
      )}
      {children}
    </section>
  )
}

function PlayCallout({ row }: { row: Row }): React.JSX.Element {
  return (
    <div className="rounded-lg bg-zinc-900/65 px-3 py-2 ring-1 ring-emerald-400/40">
      <div className="flex items-baseline gap-1.5">
        <span className="shrink-0 rounded bg-emerald-500/25 px-1 text-[10px] font-bold uppercase text-emerald-200">
          Play
        </span>
        <span className="truncate text-base font-bold text-zinc-50">
          {row.name}
        </span>
      </div>
      {row.rationale.length > 0 && (
        <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-200">
          {row.rationale.join(' · ')}
        </div>
      )}
    </div>
  )
}

function IncomingSection({
  incoming,
  blockNeeded
}: {
  incoming: number
  blockNeeded: number
}): React.JSX.Element {
  if (incoming === 0) {
    return (
      <Section className="items-end">
        <span className="text-lg font-bold uppercase tracking-wide text-zinc-400">
          No incoming
        </span>
      </Section>
    )
  }
  const numColor =
    blockNeeded === 0
      ? 'text-emerald-300'
      : blockNeeded > 12
        ? 'text-rose-300'
        : 'text-amber-300'
  return (
    <Section className="items-end">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold uppercase tracking-wide text-zinc-200">
          Incoming
        </span>
        <span className={`text-4xl font-extrabold leading-none ${numColor}`}>
          {incoming}
        </span>
        <span className="text-2xl font-bold uppercase text-zinc-200">dmg</span>
      </div>
      <div
        className={`mt-1 text-xl font-bold uppercase tracking-wide ${
          blockNeeded > 0 ? 'text-cyan-300' : 'text-emerald-300'
        }`}
      >
        {blockNeeded > 0 ? `Required ${blockNeeded} Block` : 'Covered'}
      </div>
    </Section>
  )
}

function ThreatSection({
  threats
}: {
  threats: CombatPlayResultView['threats']
}): React.JSX.Element | null {
  const attackers = threats.filter((t) => t.adjusted !== null)
  if (attackers.length === 0) return null
  return (
    <Section title="Incoming by enemy" className="w-full items-stretch">
      <div className="flex flex-col gap-1">
        {attackers.map((t, i) => (
          <div
            key={`${t.entityId}-${i}`}
            className="flex items-baseline justify-between gap-2 text-sm"
          >
            <span className="min-w-0 truncate text-zinc-200">{t.name}</span>
            <span className="shrink-0 font-mono">
              <span className="font-semibold text-rose-300">{t.adjusted}</span>
              {t.applied.length > 0 && (
                <span className="ml-1 text-xs text-zinc-300">
                  ({t.applied.join(', ')})
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}

function InfoSection({
  orbs,
  potions,
  notes
}: {
  orbs: Orb[]
  potions: Potion[]
  notes: string[]
}): React.JSX.Element | null {
  const shownPotions = potions.filter((p) => p.advice !== 'hold')
  if (orbs.length === 0 && shownPotions.length === 0 && notes.length === 0)
    return null
  return (
    <Section className="gap-1">
      {orbs.map((o, i) => (
        <div key={`${o.id}-${i}`} className="text-xs leading-snug">
          <span className="font-semibold text-cyan-200">{o.name}</span>{' '}
          <span className="text-zinc-300">{orbText(o)}</span>
        </div>
      ))}
      {notes.map((n, i) => (
        <div key={i} className="text-xs leading-snug text-zinc-100">
          {n}
        </div>
      ))}
      {shownPotions.map((p, i) => (
        <div key={`${p.id}-${i}`} className="text-xs leading-snug">
          <AdviceTag advice={p.advice} />{' '}
          <span
            className={`font-semibold ${
              p.advice === 'use' ? 'text-emerald-200' : 'text-zinc-100'
            }`}
          >
            {p.name}
          </span>
          <span className="text-zinc-300"> — {p.rationale.join(' ')}</span>
        </div>
      ))}
    </Section>
  )
}

function HandSection({ ranked }: { ranked: Row[] }): React.JSX.Element {
  return (
    <section className="flex min-w-0 flex-1 flex-wrap content-start items-start justify-center gap-2 self-stretch">
      {ranked.length === 0 ? (
        <span className="px-2 py-1 text-sm italic text-zinc-400">
          No playable cards.
        </span>
      ) : (
        ranked.map((row, i) => (
          <CardTile key={`${row.index}-${i}`} row={row} rank={i + 1} top={i === 0} />
        ))
      )}
    </section>
  )
}

function CardTile({
  row,
  rank,
  top
}: {
  row: Row
  rank: number
  top: boolean
}): React.JSX.Element {
  return (
    <div
      className={`flex w-[116px] shrink-0 flex-col items-center gap-1 rounded-md p-1.5 ${
        top
          ? 'bg-emerald-500/15 ring-1 ring-emerald-400/70'
          : 'bg-zinc-800/50 ring-1 ring-white/5'
      }`}
    >
      <div className="relative h-[78px] w-full overflow-hidden rounded ring-1 ring-black/30">
        <ArtThumb
          src={row.imageUrl}
          alt={row.name}
          tier={(row.tier ?? undefined) as Tier | undefined}
          className="absolute inset-0 h-full w-full !object-cover"
        />
        <span className="absolute left-0.5 top-0.5">
          <CostBadges cost={row.cost ?? undefined} starCost={row.starCost} />
        </span>
        <span
          className={`absolute right-0.5 top-0.5 rounded px-1 text-[10px] font-bold uppercase ${
            top ? 'bg-emerald-500/90 text-white' : 'bg-black/60 text-zinc-200'
          }`}
        >
          {top ? 'Play' : `#${rank}`}
        </span>
      </div>
      <span className="w-full truncate text-center text-sm font-semibold text-zinc-50">
        {row.name}
      </span>
      <div className="flex items-center gap-1.5">
        {row.tier && (
          <TierBadge
            tier={row.tier as Tier}
            solid
            className="h-4 min-w-[1rem] px-1 text-[10px]"
          />
        )}
        <span className="font-mono text-xs text-zinc-400">
          {Math.round(row.score)}
        </span>
      </div>
    </div>
  )
}

function orbText(o: Orb): string {
  const passive =
    o.passiveKind === 'block'
      ? `+${o.passiveValue} block/turn`
      : o.passiveKind === 'damage'
        ? `${o.passiveValue} dmg/turn`
        : o.passiveKind === 'energy'
          ? `+${o.passiveValue} energy`
          : 'passive'
  return o.evokeValue > 0 ? `${passive} · evoke ${o.evokeValue}` : passive
}

function AdviceTag({
  advice
}: {
  advice: 'use' | 'consider' | 'hold'
}): React.JSX.Element {
  const style =
    advice === 'use'
      ? 'bg-emerald-500/25 text-emerald-200'
      : advice === 'consider'
        ? 'bg-sky-500/20 text-sky-200'
        : 'bg-zinc-600/30 text-zinc-300'
  return (
    <span
      className={`shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide ${style}`}
    >
      {advice}
    </span>
  )
}
