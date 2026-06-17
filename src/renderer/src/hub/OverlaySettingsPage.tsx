import React from 'react'
import { Logo } from './Logo'

export function OverlaySettingsPage(): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-2xl bg-surface-900 p-8 text-center ring-1 ring-white/5">
        <div className="mx-auto mb-4 w-fit rounded-2xl bg-surface-950/70 p-3 ring-1 ring-white/10">
          <Logo size={40} />
        </div>
        <h1 className="text-lg font-semibold text-zinc-50">In-game overlay</h1>
        <span className="mt-3 inline-block rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-brand/30">
          Coming soon
        </span>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          The live in-game overlay — real-time card, relic and combat advice while
          you play — is on the way. For now, use the Hub to browse the database,
          study rated builds, and craft decks.
        </p>
      </div>
    </div>
  )
}
