import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../main/ipc/channels'
import type { NormalizedState, McpHealth, GameStatus } from '../main/types/gameState'
import type {
  AnnotationPayload,
  RecommendationView
} from '../main/types/recommendation'
import type { UserSettings } from '../main/types/settings'
import type { TierBundle } from '../main/types/tierData'
import type { Compendium } from '../main/types/compendium'
import type { CustomTierList } from '../main/types/tierList'

export interface TierListsSnapshot {
  lists: CustomTierList[]
  activeId: string | null
}
export interface ExportResult {
  ok: boolean
  code?: string
  savedPath?: string
  reason?: string
}
export interface ImportResult {
  ok: boolean
  list?: CustomTierList
  reason?: string
}

const api = {
  setInteractive(interactive: boolean): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.overlaySetInteractive, interactive)
  },
  togglePinned(): Promise<boolean> {
    return ipcRenderer.invoke(IpcChannels.overlayTogglePinned)
  },
  openModInstall(): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.overlayOpenModInstall)
  },
  installBundledMod(): Promise<{
    mod: { ok: boolean; installedTo?: string; files?: string[]; reason?: string }
    saves: { ok: boolean; action: string; reason?: string; backupDir?: string }
  }> {
    return ipcRenderer.invoke(IpcChannels.modInstallBundled)
  },
  setCompact(compact: boolean): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.overlaySetCompact, compact)
  },
  quit(): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.overlayQuit)
  },
  /** Current state/health/recommendation, pulled once on overlay mount. */
  getSnapshot(): Promise<{
    health: McpHealth
    state: NormalizedState | null
    recommendation: RecommendationView
  }> {
    return ipcRenderer.invoke(IpcChannels.overlaySnapshot)
  },
  onGameStateUpdate(cb: (state: NormalizedState) => void): () => void {
    const handler = (_: unknown, state: NormalizedState): void => cb(state)
    ipcRenderer.on(IpcChannels.gameStateUpdate, handler)
    return () => ipcRenderer.off(IpcChannels.gameStateUpdate, handler)
  },
  onMcpHealth(cb: (health: McpHealth) => void): () => void {
    const handler = (_: unknown, health: McpHealth): void => cb(health)
    ipcRenderer.on(IpcChannels.mcpHealth, handler)
    return () => ipcRenderer.off(IpcChannels.mcpHealth, handler)
  },
  onRecommendation(cb: (rec: RecommendationView) => void): () => void {
    const handler = (_: unknown, rec: RecommendationView): void => cb(rec)
    ipcRenderer.on(IpcChannels.recommendationReady, handler)
    return () => ipcRenderer.off(IpcChannels.recommendationReady, handler)
  },
  onPinnedChanged(cb: (state: { pinned: boolean }) => void): () => void {
    const handler = (_: unknown, state: { pinned: boolean }): void => cb(state)
    ipcRenderer.on(IpcChannels.overlayPinnedChanged, handler)
    return () => ipcRenderer.off(IpcChannels.overlayPinnedChanged, handler)
  },
  getSettings(): Promise<UserSettings> {
    return ipcRenderer.invoke(IpcChannels.settingsGet)
  },
  setSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
    return ipcRenderer.invoke(IpcChannels.settingsSet, partial)
  },
  onSettingsChanged(cb: (settings: UserSettings) => void): () => void {
    const handler = (_: unknown, s: UserSettings): void => cb(s)
    ipcRenderer.on(IpcChannels.settingsChanged, handler)
    return () => ipcRenderer.off(IpcChannels.settingsChanged, handler)
  },
  onAnnotations(cb: (payload: AnnotationPayload) => void): () => void {
    const handler = (_: unknown, p: AnnotationPayload): void => cb(p)
    ipcRenderer.on(IpcChannels.annotationsUpdate, handler)
    return () => ipcRenderer.off(IpcChannels.annotationsUpdate, handler)
  },
  calibrationStart(): Promise<{ ok: boolean; reason?: string }> {
    return ipcRenderer.invoke(IpcChannels.calibrationStart)
  },
  calibrationCancel(): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.calibrationCancel)
  },
  calibrationClick(point: { x: number; y: number }): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.calibrationClick, point)
  },
  onCalibrationState(
    cb: (state: import('../main/types/recommendation').CalibrationStatePayload) => void
  ): () => void {
    const handler = (
      _: unknown,
      s: import('../main/types/recommendation').CalibrationStatePayload
    ): void => cb(s)
    ipcRenderer.on(IpcChannels.calibrationState, handler)
    return () => ipcRenderer.off(IpcChannels.calibrationState, handler)
  },

  // --- Hub: open / browse data / tier lists ---
  openHub(): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.hubOpen)
  },
  openExternal(url: string): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.openExternal, url)
  },
  copyText(text: string): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.clipboardWrite, text)
  },
  hubMinimize(): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.hubMinimize)
  },
  hubMaximizeToggle(): Promise<boolean> {
    return ipcRenderer.invoke(IpcChannels.hubMaximizeToggle)
  },
  hubClose(): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.hubClose)
  },
  onGameStatus(cb: (status: GameStatus) => void): () => void {
    const handler = (_: unknown, s: GameStatus): void => cb(s)
    ipcRenderer.on(IpcChannels.gameStatus, handler)
    return () => ipcRenderer.off(IpcChannels.gameStatus, handler)
  },
  getTierData(): Promise<TierBundle> {
    return ipcRenderer.invoke(IpcChannels.tierDataGet)
  },
  getCompendium(): Promise<Compendium> {
    return ipcRenderer.invoke(IpcChannels.compendiumGet)
  },
  listTierLists(): Promise<TierListsSnapshot> {
    return ipcRenderer.invoke(IpcChannels.tierListsList)
  },
  saveTierList(list: CustomTierList): Promise<CustomTierList> {
    return ipcRenderer.invoke(IpcChannels.tierListSave, list)
  },
  deleteTierList(id: string): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.tierListDelete, id)
  },
  exportTierList(id: string, toFile?: boolean): Promise<ExportResult> {
    return ipcRenderer.invoke(IpcChannels.tierListExport, { id, toFile })
  },
  importTierList(code?: string): Promise<ImportResult> {
    return ipcRenderer.invoke(IpcChannels.tierListImport, { code })
  },
  setActiveTierList(id: string | null): Promise<string | null> {
    return ipcRenderer.invoke(IpcChannels.tierListSetActive, id)
  },
  onActiveTierListChanged(
    cb: (state: { activeId: string | null }) => void
  ): () => void {
    const handler = (_: unknown, s: { activeId: string | null }): void => cb(s)
    ipcRenderer.on(IpcChannels.tierListActiveChanged, handler)
    return () => ipcRenderer.off(IpcChannels.tierListActiveChanged, handler)
  }
}

contextBridge.exposeInMainWorld('overlay', api)

export type OverlayApi = typeof api
