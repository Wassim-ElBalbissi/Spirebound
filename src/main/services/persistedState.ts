import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { logger } from './logger'
import { DEFAULT_SETTINGS, UserSettings } from '../types/settings'
import type { CustomTierList } from '../types/tierList'

export type { UserSettings } from '../types/settings'
export { DEFAULT_SETTINGS } from '../types/settings'
export type { CustomTierList } from '../types/tierList'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  displayId?: number
}

/**
 * One-time record of the vanilla→modded save migration. STS2 keeps modded-run
 * progress in a scope separate from vanilla, so we copy the vanilla scope over
 * once (when the modded scope is empty). This record stops it from repeating.
 */
export interface SaveMigrationRecord {
  done: boolean
  /** Outcome of the migration attempt (see saveMigrator SaveMigrationResult). */
  action: string
  migratedAt: string
  vanillaDir?: string
  moddedDir?: string
  backupDir?: string
}

export interface PersistedState {
  schemaVersion: 1
  windowBounds: Record<string, WindowBounds>
  /** Bounds for the full-size Hub window, keyed by displayId. */
  hubBounds?: Record<string, WindowBounds>
  pinnedInteractive?: boolean
  lastModVersion?: string
  /** Set once the unmodded save profile has been migrated into the modded scope. */
  saveMigration?: SaveMigrationRecord
  settings?: UserSettings
  /** User-authored tier lists, keyed by id. */
  customTierLists?: Record<string, CustomTierList>
  /** Id of the tier list currently applied to the live overlay (if any). */
  activeTierListId?: string | null
}

const DEFAULT_STATE: PersistedState = {
  schemaVersion: 1,
  windowBounds: {},
  hubBounds: {},
  settings: DEFAULT_SETTINGS,
  customTierLists: {},
  activeTierListId: null
}

/**
 * Tiny JSON-on-disk store. We deliberately avoid electron-store v10 because
 * it is ESM-only and the main bundle is CommonJS.
 *
 * Writes are coalesced via a 250 ms debounce so a drag-resize doesn't
 * thrash the filesystem.
 */
export class StateStore {
  private state: PersistedState
  private readonly filePath: string
  private writeTimer: NodeJS.Timeout | null = null

  constructor() {
    this.filePath = join(app.getPath('userData'), 'state.json')
    this.state = this.load()
  }

  get<K extends keyof PersistedState>(key: K): PersistedState[K] {
    return this.state[key]
  }

  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
    this.state[key] = value
    this.scheduleWrite()
  }

  getWindowBounds(displayId: number): WindowBounds | undefined {
    return this.state.windowBounds[String(displayId)]
  }

  setWindowBounds(displayId: number, bounds: WindowBounds): void {
    this.state.windowBounds[String(displayId)] = { ...bounds, displayId }
    this.scheduleWrite()
  }

  getHubBounds(displayId: number): WindowBounds | undefined {
    return this.state.hubBounds?.[String(displayId)]
  }

  setHubBounds(displayId: number, bounds: WindowBounds): void {
    if (!this.state.hubBounds) this.state.hubBounds = {}
    this.state.hubBounds[String(displayId)] = { ...bounds, displayId }
    this.scheduleWrite()
  }

  anyHubBounds(): WindowBounds | undefined {
    const all = this.state.hubBounds ?? {}
    const key = Object.keys(all)[0]
    return key ? all[key] : undefined
  }

  // --- Custom tier lists ---

  listTierLists(): CustomTierList[] {
    return Object.values(this.state.customTierLists ?? {}).sort(
      (a, b) => b.updatedAt - a.updatedAt
    )
  }

  getTierList(id: string): CustomTierList | undefined {
    return this.state.customTierLists?.[id]
  }

  saveTierList(list: CustomTierList): CustomTierList {
    if (!this.state.customTierLists) this.state.customTierLists = {}
    this.state.customTierLists[list.id] = list
    this.scheduleWrite()
    return list
  }

  deleteTierList(id: string): void {
    if (this.state.customTierLists) delete this.state.customTierLists[id]
    if (this.state.activeTierListId === id) this.state.activeTierListId = null
    this.scheduleWrite()
  }

  getActiveTierListId(): string | null {
    return this.state.activeTierListId ?? null
  }

  setActiveTierListId(id: string | null): void {
    this.state.activeTierListId = id
    this.scheduleWrite()
  }

  getSettings(): UserSettings {
    return { ...DEFAULT_SETTINGS, ...(this.state.settings ?? {}) }
  }

  setSettings(partial: Partial<UserSettings>): UserSettings {
    const next: UserSettings = { ...this.getSettings(), ...partial }
    next.uiScale = clamp(next.uiScale, 0.75, 1.5)
    this.state.settings = next
    this.scheduleWrite()
    return next
  }

  private load(): PersistedState {
    try {
      if (!existsSync(this.filePath)) return { ...DEFAULT_STATE }
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as PersistedState
      if (parsed.schemaVersion !== 1) {
        logger.warn(
          { schemaVersion: parsed.schemaVersion },
          'unknown state schema; resetting'
        )
        return { ...DEFAULT_STATE }
      }
      return { ...DEFAULT_STATE, ...parsed }
    } catch (err) {
      logger.warn({ err }, 'failed to load persisted state; using defaults')
      return { ...DEFAULT_STATE }
    }
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => this.flush(), 250)
  }

  flush(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8')
    } catch (err) {
      logger.error({ err, filePath: this.filePath }, 'persist failed')
    }
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
