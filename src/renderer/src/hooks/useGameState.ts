import { useEffect, useState } from 'react'
import type { NormalizedState, McpHealth } from '../../../main/types/gameState'
import type { RecommendationView } from '../../../main/types/recommendation'

export interface OverlayDataState {
  state: NormalizedState | null
  health: McpHealth
  recommendation: RecommendationView
}

export function useGameState(): OverlayDataState {
  const [state, setState] = useState<NormalizedState | null>(null)
  const [health, setHealth] = useState<McpHealth>({ ok: false })
  const [recommendation, setRecommendation] = useState<RecommendationView>({
    kind: 'none'
  })

  useEffect(() => {
    const api = window.overlay
    if (!api) return
    const offState = api.onGameStateUpdate(setState)
    const offHealth = api.onMcpHealth(setHealth)
    const offRec = api.onRecommendation(setRecommendation)
    return () => {
      offState()
      offHealth()
      offRec()
    }
  }, [])

  return { state, health, recommendation }
}
