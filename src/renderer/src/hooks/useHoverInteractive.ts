import { useEffect, useRef } from 'react'

const LEAVE_GRACE_MS = 250

/**
 * Click-through-when-idle interaction model: hovering the returned ref
 * disables ignore-mouse-events so the user can click inside that region; the
 * rest of the overlay stays click-through. A short grace period on leave
 * prevents flicker when the cursor crosses a gap.
 *
 * `enabled` lets a caller gate a region that mounts/unmounts (e.g. the settings
 * panel) — the listeners (re)attach whenever it flips true with the element
 * present, and detach (releasing interactivity) when it flips false.
 */
export function useHoverInteractive<T extends HTMLElement>(
  enabled = true
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || !window.overlay) return

    let leaveTimer: number | null = null
    let interactive = false

    const setInteractive = (next: boolean): void => {
      if (next === interactive) return
      interactive = next
      void window.overlay!.setInteractive(next)
    }

    const onEnter = (): void => {
      if (leaveTimer !== null) {
        window.clearTimeout(leaveTimer)
        leaveTimer = null
      }
      setInteractive(true)
    }

    const onLeave = (): void => {
      if (leaveTimer !== null) window.clearTimeout(leaveTimer)
      leaveTimer = window.setTimeout(() => {
        setInteractive(false)
        leaveTimer = null
      }, LEAVE_GRACE_MS)
    }

    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mouseleave', onLeave)
      if (leaveTimer !== null) window.clearTimeout(leaveTimer)
      if (interactive) void window.overlay!.setInteractive(false)
    }
  }, [enabled])

  return ref
}
