import React, { useEffect, useState } from 'react'
import type { CalibrationSource } from '../../main/types/recommendation'
import { Header } from './components/Header'
import { ConnectionBadge, ConnectionState } from './components/ConnectionBadge'
import { CardPickAdvice } from './components/CardPickAdvice'
import { MapPathAdvice } from './components/MapPathAdvice'
import { RelicEventAdvice } from './components/RelicEventAdvice'
import { CombatAdvice } from './components/CombatAdvice'
import { CombatThreatChip } from './components/CombatThreatChip'
import { OnboardingPanel } from './components/OnboardingPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { useHoverInteractive } from './hooks/useHoverInteractive'
import { useGameState } from './hooks/useGameState'
import { useOnboarding } from './hooks/useOnboarding'
import { usePinned } from './hooks/usePinned'
import { useSettings } from './hooks/useSettings'

const STALE_MS = 2000
const BASE_FONT_PX = 14

export function App(): React.JSX.Element {
  const cardRef = useHoverInteractive<HTMLDivElement>()
  const { state, health, recommendation } = useGameState()
  const showOnboarding = useOnboarding(health)
  const pinned = usePinned()
  const { settings, set } = useSettings()
  const [showSettings, setShowSettings] = useState(false)
  const [calibrationSource, setCalibrationSource] =
    useState<CalibrationSource>('heuristic')
  useEffect(() => {
    return window.overlay?.onAnnotations((p) =>
      setCalibrationSource(p.calibrationSource ?? 'heuristic')
    )
  }, [])

  // Compact the corner window during combat when per-card badges are active.
  const compactMode =
    state?.screen.kind === 'combat' &&
    settings.showPerCardBadges &&
    !showSettings
  useEffect(() => {
    void window.overlay?.setCompact(compactMode)
  }, [compactMode])

  // UI scale is applied in main via webContents.setZoomFactor — it scales
  // hardcoded Tailwind pixel sizes uniformly. Inline fontSize can't.
  void BASE_FONT_PX
  void settings.uiScale
  const cardBg = `rgba(24, 24, 27, ${settings.opacity})`

  return (
    <div
      className="h-screen w-screen p-2"
    >
      <div
        ref={cardRef}
        style={{ backgroundColor: cardBg }}
        className={`h-full w-full rounded-xl border text-zinc-100 shadow-2xl backdrop-blur-md flex flex-col overflow-hidden ${
          pinned ? 'border-sky-500/70' : 'border-zinc-700/60'
        }`}
      >
        <Header
          right={
            <span className="flex items-center gap-2">
              {pinned && (
                <span className="text-[10px] uppercase tracking-wider text-sky-400">
                  Pinned
                </span>
              )}
              <ConnectionBadge
                state={connState(health)}
                version={health.version}
              />
              <button
                type="button"
                aria-label="Open browser / tier lists"
                title="Open browser / tier lists (Ctrl+Alt+B)"
                onClick={() => void window.overlay?.openHub()}
                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700/40 hover:text-zinc-100"
              >
                <BrowseIcon />
              </button>
              <button
                type="button"
                aria-label="Settings"
                onClick={() => setShowSettings((v) => !v)}
                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700/40 hover:text-zinc-100"
              >
                <GearIcon />
              </button>
            </span>
          }
        />
        <main className="flex-1 overflow-y-auto">
          {showSettings ? (
            <SettingsPanel
              settings={settings}
              onChange={set}
              onClose={() => setShowSettings(false)}
              calibrationSource={calibrationSource}
            />
          ) : (
            <Body
              screenKind={state?.screen.kind ?? null}
              recommendation={recommendation}
              health={health}
              showOnboarding={showOnboarding}
              compactMode={compactMode}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function Body({
  screenKind,
  recommendation,
  health,
  showOnboarding,
  compactMode
}: {
  screenKind: string | null
  recommendation: ReturnType<typeof useGameState>['recommendation']
  health: ReturnType<typeof useGameState>['health']
  showOnboarding: boolean
  compactMode: boolean
}): React.JSX.Element {
  if (showOnboarding) {
    return <OnboardingPanel errorMessage={health.error} />
  }

  if (!health.ok && !screenKind) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center text-sm text-zinc-400">
        <p className="font-medium text-zinc-300">Waiting for STS2MCP…</p>
        <p className="mt-2 text-xs opacity-70">
          Launch Slay the Spire 2 with the STS2MCP mod installed.
        </p>
      </div>
    )
  }

  switch (recommendation.kind) {
    case 'cardPick':
      return (
        <CardPickAdvice
          ranked={recommendation.ranked}
          canSkip={recommendation.canSkip}
        />
      )
    case 'mapPath':
      return <MapPathAdvice paths={recommendation.paths} />
    case 'relicPick':
    case 'event':
      return <RelicEventAdvice recommendation={recommendation} />
    case 'combatPlay':
      return compactMode ? (
        <CombatThreatChip result={recommendation.result} />
      ) : (
        <CombatAdvice result={recommendation.result} />
      )
    case 'none':
    default:
      return <Idle screenKind={screenKind} />
  }
}

function Idle({
  screenKind
}: {
  screenKind: string | null
}): React.JSX.Element {
  const copy = (() => {
    switch (screenKind) {
      case 'combat':
        return 'Combat — no playable cards.'
      case 'rest':
        return 'Rest site — rest or smith based on your build.'
      case 'shop':
        return 'Shop — purchase advice coming soon.'
      case 'rewards':
        return 'Pick a reward to see card advice.'
      case 'menu':
      case null:
        return 'No active run.'
      default:
        return `Idle (${screenKind ?? 'unknown'}).`
    }
  })()
  return (
    <div className="flex h-full flex-col items-center justify-center p-4 text-center text-xs text-zinc-400">
      <span>{copy}</span>
      <span className="mt-3 text-[10px] uppercase tracking-wider text-zinc-600">
        Ctrl+Alt+S to pin overlay
      </span>
    </div>
  )
}

function connState(health: { ok: boolean; lastOkAt?: number }): ConnectionState {
  if (!health.ok) return 'offline'
  if (health.lastOkAt && Date.now() - health.lastOkAt > STALE_MS) return 'stale'
  return 'connected'
}

function BrowseIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  )
}

function GearIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
