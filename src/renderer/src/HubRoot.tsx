import React, { useState } from 'react'
import { useCompendium, useTierData } from './hub/hooks'
import { BrowsePage } from './hub/BrowsePage'
import { EventsPage, PotionsPage } from './hub/CompendiumPages'
import { CharactersPage } from './hub/CharactersPage'
import { BuildsPage } from './hub/BuildsPage'
import { DeckBuilderPage } from './hub/DeckBuilderPage'
import { GlossaryPage } from './hub/GlossaryPage'
import { OverlaySettingsPage } from './hub/OverlaySettingsPage'
import { Logo } from './hub/Logo'
import { ArtThumb } from './hub/ui'
import { charMeta } from './hub/meta'
import { GlossaryProvider } from './hub/glossary'

function Svg({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

/** Compact inline icon set for the nav + tiles. */
const I = {
  Home: () => (
    <Svg>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </Svg>
  ),
  Cards: () => (
    <Svg>
      <rect x="3" y="4" width="12" height="16" rx="2" />
      <path d="M8 8h8a2 2 0 0 1 2 2v8" />
    </Svg>
  ),
  User: () => (
    <Svg>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </Svg>
  ),
  Gem: () => (
    <Svg>
      <path d="M6 3h12l3 6-9 12L3 9z" />
      <path d="M3 9h18M12 3 9 9l3 12 3-12-3-6" />
    </Svg>
  ),
  Flask: () => (
    <Svg>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
    </Svg>
  ),
  Spark: () => (
    <Svg>
      <path d="M12 3l2.5 6L21 11l-6.5 2L12 19l-2.5-6L3 11l6.5-2z" />
    </Svg>
  ),
  Layers: () => (
    <Svg>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </Svg>
  ),
  Hammer: () => (
    <Svg>
      <path d="M14 3l7 7-3 3-7-7z" />
      <path d="M11 6 3 14a2 2 0 0 0 0 3l1 1a2 2 0 0 0 3 0l8-8" />
    </Svg>
  ),
  Book: () => (
    <Svg>
      <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19a2 2 0 0 1 2-2h12" />
    </Svg>
  ),
  Gear: () => (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  )
}

type Section =
  | 'home'
  | 'cards'
  | 'characters'
  | 'relics'
  | 'potions'
  | 'events'
  | 'builds'
  | 'deckbuilder'
  | 'glossary'
  | 'settings'

const NAV: { id: Section; label: string; icon: React.ReactNode; group?: string }[] = [
  { id: 'home', label: 'Home', icon: <I.Home /> },
  { id: 'cards', label: 'Cards', icon: <I.Cards />, group: 'Database' },
  { id: 'characters', label: 'Characters', icon: <I.User /> },
  { id: 'relics', label: 'Relics', icon: <I.Gem /> },
  { id: 'potions', label: 'Potions', icon: <I.Flask /> },
  { id: 'events', label: 'Events', icon: <I.Spark /> },
  { id: 'glossary', label: 'Keywords', icon: <I.Book /> },
  { id: 'builds', label: 'Builds', icon: <I.Layers />, group: 'Strategy' },
  { id: 'deckbuilder', label: 'Deck Builder', icon: <I.Hammer /> }
]

export function HubRoot(): React.JSX.Element {
  const [section, setSection] = useState<Section>('home')
  const bundle = useTierData()
  const compendium = useCompendium()

  return (
    <GlossaryProvider entries={compendium.glossary}>
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface-950 text-zinc-100">
      <TitleBar onOpenSettings={() => setSection('settings')} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="flex w-56 shrink-0 flex-col border-r border-surface-800 bg-surface-900">
          <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {NAV.map((item) => {
              const active = section === item.id
              return (
                <li key={item.id}>
                  {item.group && (
                    <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                      {item.group}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                      active
                        ? 'bg-surface-800 text-zinc-50'
                        : 'text-zinc-400 hover:bg-surface-800/60 hover:text-zinc-200'
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
                    )}
                    <span
                      className={active ? 'text-brand' : 'text-zinc-500 group-hover:text-zinc-300'}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">
          {section === 'home' && (
            <HomePage
              onNavigate={setSection}
              bundle={bundle}
              compendium={compendium}
            />
          )}
          {section === 'cards' && <BrowsePage bundle={bundle} kind="card" />}
          {section === 'relics' && <BrowsePage bundle={bundle} kind="relic" />}
          {section === 'characters' && <CharactersPage data={compendium} />}
          {section === 'potions' && <PotionsPage data={compendium} />}
          {section === 'events' && <EventsPage data={compendium} />}
          {section === 'glossary' && <GlossaryPage data={compendium} />}
          {section === 'builds' && <BuildsPage />}
          {section === 'deckbuilder' && <DeckBuilderPage />}
          {section === 'settings' && <OverlaySettingsPage />}
        </main>
      </div>
    </div>
    </GlossaryProvider>
  )
}

function TitleBar({
  onOpenSettings
}: {
  onOpenSettings: () => void
}): React.JSX.Element {
  return (
    <div className="drag-region flex h-10 shrink-0 items-center justify-between border-b border-surface-800 bg-gradient-to-b from-surface-800 to-surface-900 pl-3 text-zinc-300">
      <div className="flex items-center gap-2">
        <Logo size={18} />
        <span className="text-xs font-bold tracking-tight text-zinc-100">
          Spirebound
        </span>
      </div>
      <div className="no-drag ml-auto flex h-full">
        <WindowButton label="Settings" onClick={onOpenSettings}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </WindowButton>
        <WindowButton
          label="Minimize"
          onClick={() => void window.overlay?.hubMinimize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="1" y="4.5" width="8" height="1" fill="currentColor" />
          </svg>
        </WindowButton>
        <WindowButton
          label="Maximize"
          onClick={() => void window.overlay?.hubMaximizeToggle()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect
              x="1"
              y="1"
              width="8"
              height="8"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </WindowButton>
        <WindowButton
          label="Close"
          danger
          onClick={() => void window.overlay?.hubClose()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              d="M1 1 L9 9 M9 1 L1 9"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
        </WindowButton>
      </div>
    </div>
  )
}

function WindowButton({
  label,
  onClick,
  danger = false,
  children
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-full w-11 items-center justify-center text-zinc-400 transition-colors ${
        danger
          ? 'hover:bg-rose-600 hover:text-white'
          : 'hover:bg-surface-700 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}

function HomePage({
  onNavigate,
  bundle,
  compendium
}: {
  onNavigate: (s: Section) => void
  bundle: ReturnType<typeof useTierData>
  compendium: ReturnType<typeof useCompendium>
}): React.JSX.Element {
  const stats = [
    { label: 'Cards', value: Object.keys(bundle.cards).length },
    { label: 'Relics', value: Object.keys(bundle.relics).length },
    { label: 'Potions', value: compendium.potions.length },
    { label: 'Events', value: compendium.events.length }
  ]
  const tiles: { id: Section; title: string; desc: string; icon: React.ReactNode }[] = [
    { id: 'cards', title: 'Cards', desc: 'Tiers, costs & commentary', icon: <I.Cards /> },
    { id: 'relics', title: 'Relics', desc: 'Ranked, filter by class', icon: <I.Gem /> },
    { id: 'potions', title: 'Potions', desc: 'Effects & rarity', icon: <I.Flask /> },
    { id: 'events', title: 'Events', desc: 'What to expect & pick', icon: <I.Spark /> },
    { id: 'builds', title: 'Builds', desc: 'Rated builds, load into overlay', icon: <I.Layers /> },
    { id: 'deckbuilder', title: 'Deck Builder', desc: 'Craft a deck, make it a build', icon: <I.Hammer /> }
  ]
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-surface-800 via-surface-900 to-surface-950 p-7 ring-1 ring-white/5">
        <div
          className="pointer-events-none absolute -right-10 -top-12 opacity-[0.12] blur-xl"
          aria-hidden
        >
          <Logo size={240} />
        </div>
        <div className="relative flex items-center gap-4">
          <div className="rounded-2xl bg-surface-950/70 p-3 ring-1 ring-white/10">
            <Logo size={40} />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
              Spirebound
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              Your Slay the Spire 2 hub — browse cards, relics & potions, study
              rated builds, and craft your own decks. The live in-game overlay is
              coming soon.
            </p>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap gap-2">
          {stats.map((s) => (
            <span
              key={s.label}
              className="flex items-baseline gap-1.5 rounded-lg bg-surface-950/60 px-3 py-1.5 ring-1 ring-white/5"
            >
              <span className="text-base font-bold text-zinc-100">{s.value}</span>
              <span className="text-xs text-zinc-500">{s.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Characters strip */}
      {compendium.characters.length > 0 && (
        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Characters
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('characters')}
              className="text-xs font-medium text-brand hover:underline"
            >
              View all →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {compendium.characters.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onNavigate('characters')}
                className={`group relative aspect-[4/5] overflow-hidden rounded-xl text-left shadow-md shadow-black/40 ring-1 transition-all hover:-translate-y-0.5 ${charMeta(c.id).ring}`}
              >
                <ArtThumb
                  src={c.imageUrl}
                  alt={c.name}
                  className="absolute inset-0 h-full w-full !object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/20 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-2.5 text-sm font-bold text-white drop-shadow">
                  {c.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Explore tiles */}
      <div className="mt-7">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Explore
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onNavigate(t.id)}
              className="group flex items-start gap-3 rounded-xl bg-surface-900 p-5 text-left shadow-md shadow-black/30 ring-1 ring-white/5 transition-all hover:-translate-y-0.5 hover:ring-brand/40"
            >
              <span className="mt-0.5 rounded-lg bg-surface-950 p-2 text-brand ring-1 ring-white/10 transition-colors group-hover:ring-brand/40">
                {t.icon}
              </span>
              <span>
                <span className="block text-base font-semibold text-zinc-50">
                  {t.title}
                </span>
                <span className="mt-1 block text-sm text-zinc-400">{t.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

