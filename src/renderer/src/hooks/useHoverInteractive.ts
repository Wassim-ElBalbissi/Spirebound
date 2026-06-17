import { useEffect, useRef } from 'react'

const LEAVE_GRACE_MS = 250

/**
 * Click-through-when-idle interaction model: hovering the returned ref
 * disables ignore-mouse-events so the user can click inside the advice card.
 * A short grace period on leave prevents flicker when the cursor crosses a gap.
 */
export function useHoverInteractive<T extends HTMLElement>(): React.RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !window.overlay) return

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
  }, [])

  return ref
}
