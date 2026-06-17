import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  type UserSettings
} from '../../../main/types/settings'

const FALLBACK: UserSettings = DEFAULT_SETTINGS

export interface UseSettingsResult {
  settings: UserSettings
  set: (partial: Partial<UserSettings>) => void
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<UserSettings>(FALLBACK)

  useEffect(() => {
    const api = window.overlay
    if (!api) return
    void api.getSettings().then(setSettings)
    const off = api.onSettingsChanged(setSettings)
    return () => off()
  }, [])

  const set = useCallback(async (partial: Partial<UserSettings>) => {
    const api = window.overlay
    if (!api) return
    const next = await api.setSettings(partial)
    setSettings(next)
  }, [])

  return { settings, set }
}
