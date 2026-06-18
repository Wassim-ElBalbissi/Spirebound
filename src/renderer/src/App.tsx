import React from 'react'
import { CardPickAdvice } from './components/CardPickAdvice'
import { CardChoiceAdvice } from './components/CardChoiceAdvice'
import { RelicEventAdvice } from './components/RelicEventAdvice'
import { ShopAdvice } from './components/ShopAdvice'
import { MapPathAdvice } from './components/MapPathAdvice'
import { RestAdvice } from './components/RestAdvice'
import { CombatAdvice } from './components/CombatAdvice'
import { OnboardingPanel } from './components/OnboardingPanel'
import { useGameState } from './hooks/useGameState'
import { useOnboarding } from './hooks/useOnboarding'

/**
 * The in-game overlay is a fixed, click-through HUD anchored to the top-center
 * of the screen. It has no chrome and no background of its own — only the
 * advice content shows. All settings live in the Hub.
 */
export function App(): React.JSX.Element {
  const { state, health, recommendation } = useGameState()
  const showOnboarding = useOnboarding(health)

  return (
    <div className="flex h-screen w-screen items-start justify-center overflow-hidden text-zinc-100">
      <Body
        screenKind={state?.screen.kind ?? null}
        recommendation={recommendation}
        health={health}
        showOnboarding={showOnboarding}
      />
    </div>
  )
}

function Body({
  screenKind,
  recommendation,
  health,
  showOnboarding
}: {
  screenKind: string | null
  recommendation: ReturnType<typeof useGameState>['recommendation']
  health: ReturnType<typeof useGameState>['health']
  showOnboarding: boolean
}): React.JSX.Element {
  if (showOnboarding) {
    return (
      <Chip>
        <OnboardingPanel errorMessage={health.error} />
      </Chip>
    )
  }

  if (!health.ok && !screenKind) {
    return (
      <Chip>
        <div className="px-4 py-3 text-center text-sm text-zinc-200">
          Waiting for STS2MCP — launch Slay the Spire 2 with the mod.
        </div>
      </Chip>
    )
  }

  // Combat takes the full horizontal strip; other screens float as a chip.
  if (recommendation.kind === 'combatPlay') {
    return (
      <div className="w-full">
        <CombatAdvice result={recommendation.result} />
      </div>
    )
  }

  // The map route sits in the tall left-side panel the overlay switches to,
  // vertically centered so the compact card mirrors the in-game Legend.
  if (recommendation.kind === 'mapPath') {
    return (
      <div className="flex h-full w-full items-center">
        <MapPathAdvice result={recommendation.result} />
      </div>
    )
  }

  return (
    <Chip>
      {recommendation.kind === 'cardPick' ? (
        <CardPickAdvice
          ranked={recommendation.ranked}
          canSkip={recommendation.canSkip}
          build={recommendation.build}
        />
      ) : recommendation.kind === 'relicPick' || recommendation.kind === 'event' ? (
        <RelicEventAdvice recommendation={recommendation} />
      ) : recommendation.kind === 'cardSelect' ? (
        <CardChoiceAdvice
          title={recommendation.title}
          verb={recommendation.verb}
          ranked={recommendation.ranked}
        />
      ) : recommendation.kind === 'shopAdvice' ? (
        <ShopAdvice
          items={recommendation.items}
          gold={recommendation.gold}
          build={recommendation.build}
        />
      ) : recommendation.kind === 'restUpgrade' ? (
        <RestAdvice
          action={recommendation.action}
          cards={recommendation.cards}
          build={recommendation.build}
        />
      ) : (
        <Idle screenKind={screenKind} />
      )}
    </Chip>
  )
}

/** A translucent container for the non-combat advice panels. */
function Chip({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mt-1 max-h-[196px] w-auto max-w-[480px] overflow-y-auto rounded-xl bg-zinc-900/80 shadow-xl ring-1 ring-white/10 backdrop-blur-sm">
      {children}
    </div>
  )
}

function Idle({ screenKind }: { screenKind: string | null }): React.JSX.Element {
  const copy = (() => {
    switch (screenKind) {
      case 'rest':
        return 'Rest site — rest or smith based on your build.'
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
    <div className="px-4 py-3 text-center text-sm text-zinc-300">{copy}</div>
  )
}
