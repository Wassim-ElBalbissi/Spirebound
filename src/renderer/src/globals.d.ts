import type { NormalizedState, McpHealth, GameStatus } from '../../main/types/gameState'
import type {
  AnnotationPayload,
  CalibrationStatePayload,
  RecommendationView
} from '../../main/types/recommendation'
import type { UserSettings } from '../../main/types/settings'
import type { TierBundle } from '../../main/types/tierData'
import type { Compendium } from '../../main/types/compendium'
import type { CustomTierList } from '../../main/types/tierList'

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

/** Result of the install-time setup: mod (+deps) install and save migration. */
export interface ModSetupResult {
  mod: { ok: boolean; installedTo?: string; files?: string[]; reason?: string }
  saves: { ok: boolean; action: string; reason?: string; backupDir?: string }
}

export interface OverlayApi {
  setInteractive(interactive: boolean): Promise<void>
  togglePinned(): Promise<boolean>
  openModInstall(): Promise<void>
  installBundledMod(): Promise<ModSetupResult>
  setCompact(compact: boolean): Promise<void>
  quit(): Promise<void>
  getSnapshot(): Promise<{
    health: McpHealth
    state: NormalizedState | null
    recommendation: RecommendationView
  }>
  onGameStateUpdate(cb: (state: NormalizedState) => void): () => void
  onMcpHealth(cb: (health: McpHealth) => void): () => void
  onRecommendation(cb: (rec: RecommendationView) => void): () => void
  onPinnedChanged(cb: (state: { pinned: boolean }) => void): () => void
  getSettings(): Promise<UserSettings>
  setSettings(partial: Partial<UserSettings>): Promise<UserSettings>
  onSettingsChanged(cb: (settings: UserSettings) => void): () => void
  onAnnotations(cb: (payload: AnnotationPayload) => void): () => void
  calibrationStart(): Promise<{ ok: boolean; reason?: string }>
  calibrationCancel(): Promise<void>
  calibrationClick(point: { x: number; y: number }): Promise<void>
  onCalibrationState(cb: (state: CalibrationStatePayload) => void): () => void
  openHub(): Promise<void>
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>
  hubMinimize(): Promise<void>
  hubMaximizeToggle(): Promise<boolean>
  hubClose(): Promise<void>
  onGameStatus(cb: (status: GameStatus) => void): () => void
  getTierData(): Promise<TierBundle>
  getCompendium(): Promise<Compendium>
  listTierLists(): Promise<TierListsSnapshot>
  saveTierList(list: CustomTierList): Promise<CustomTierList>
  deleteTierList(id: string): Promise<void>
  exportTierList(id: string, toFile?: boolean): Promise<ExportResult>
  importTierList(code?: string): Promise<ImportResult>
  setActiveTierList(id: string | null): Promise<string | null>
  onActiveTierListChanged(
    cb: (state: { activeId: string | null }) => void
  ): () => void
}

declare global {
  interface Window {
    overlay?: OverlayApi
  }
}
