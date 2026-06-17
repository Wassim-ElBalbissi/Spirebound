import { useEffect, useState } from 'react'

export function usePinned(): boolean {
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    const off = window.overlay?.onPinnedChanged((state) => setPinned(state.pinned))
    return () => {
      off?.()
    }
  }, [])

  return pinned
}
