import { useCallback, useEffect, useState } from 'react'
import type { TierBundle } from '../../../main/types/tierData'
import type { Compendium } from '../../../main/types/compendium'
import type { CustomTierList } from '../../../main/types/tierList'
import type { GameStatus } from '../../../main/types/gameState'

const EMPTY_BUNDLE: TierBundle = {
  schemaVersion: 1,
  gameVersion: 'unknown',
  fetchedAt: 0,
  cards: {},
  relics: {}
}
const EMPTY_COMPENDIUM: Compendium = {
  characters: [],
  potions: [],
  events: [],
  builds: [],
  glossary: []
}

export function useTierData(): TierBundle {
  const [bundle, setBundle] = useState<TierBundle>(EMPTY_BUNDLE)
  useEffect(() => {
    let alive = true
    void window.overlay?.getTierData().then((b) => {
      if (alive && b) setBundle(b)
    })
    return () => {
      alive = false
    }
  }, [])
  return bundle
}

export function useGameStatus(): GameStatus {
  const [status, setStatus] = useState<GameStatus>({
    gameRunning: false,
    mcpConnected: false
  })
  useEffect(() => window.overlay?.onGameStatus(setStatus), [])
  return status
}

export function useCompendium(): Compendium {
  const [data, setData] = useState<Compendium>(EMPTY_COMPENDIUM)
  useEffect(() => {
    let alive = true
    void window.overlay?.getCompendium().then((c) => {
      if (alive && c) setData(c)
    })
    return () => {
      alive = false
    }
  }, [])
  return data
}

export interface TierListsState {
  lists: CustomTierList[]
  activeId: string | null
  refresh: () => Promise<void>
  save: (list: CustomTierList) => Promise<void>
  remove: (id: string) => Promise<void>
  setActive: (id: string | null) => Promise<void>
}

export function useCustomTierLists(): TierListsState {
  const [lists, setLists] = useState<CustomTierList[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const snap = await window.overlay?.listTierLists()
    if (snap) {
      setLists(snap.lists)
      setActiveId(snap.activeId)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return window.overlay?.onActiveTierListChanged((s) =>
      setActiveId(s.activeId)
    )
  }, [refresh])

  const save = useCallback(
    async (list: CustomTierList) => {
      await window.overlay?.saveTierList(list)
      await refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      await window.overlay?.deleteTierList(id)
      await refresh()
    },
    [refresh]
  )

  const setActive = useCallback(
    async (id: string | null) => {
      await window.overlay?.setActiveTierList(id)
      setActiveId(id)
    },
    []
  )

  return { lists, activeId, refresh, save, remove, setActive }
}
