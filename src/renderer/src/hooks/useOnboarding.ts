import { useEffect, useState } from 'react'
import type { McpHealth } from '../../../main/types/gameState'

const SHOW_ONBOARDING_AFTER_MS = 5_000

/**
 * Show the onboarding panel only when the mod has been continuously
 * unreachable for SHOW_ONBOARDING_AFTER_MS. Avoids flashing the panel during
 * the first poll attempt or a brief mod restart.
 */
export function useOnboarding(health: McpHealth): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (health.ok) {
      setShow(false)
      return
    }
    const timer = window.setTimeout(() => setShow(true), SHOW_ONBOARDING_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [health.ok])

  return show
}
