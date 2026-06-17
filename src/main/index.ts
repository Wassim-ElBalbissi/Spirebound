import {
  app,
  ipcMain,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  shell,
  Tray
} from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createOverlayWindow, OverlayWindowHandle } from './window/overlayWindow'
import {
  createAnnotationWindow,
  AnnotationWindowHandle
} from './window/annotationWindow'
import { createHubWindow, HubWindowHandle } from './window/hubWindow'
import { createTray, refreshMenu } from './window/trayMenu'
import { IpcChannels } from './ipc/channels'
import { McpClient } from './services/mcpClient'
import { PollLoop } from './services/pollLoop'
import { MockStateProvider } from './services/mockStateProvider'
import { loadTierBundle, getTierBundle } from './services/tierData/cacheStore'
import { applyTierList } from './services/tierData/applyTierList'
import { loadCompendium } from './services/compendium'
import { createRecommender, Recommender } from './services/recommender'
import { StateStore, UserSettings, WindowBounds } from './services/persistedState'
import type { CustomTierList, TierListShare } from './types/tierList'
import type { NormalizedState, McpHealth, GameStatus } from './types/gameState'
import type {
  AnnotationPayload,
  CalibrationStatePayload,
  RecommendationView
} from './types/recommendation'
import { estimateCardSlots } from './services/cardSlotLayout'
import { installBundledMod } from './services/modInstaller'
import { detectGameWindow } from './services/gameWindow'
import {
  registerImageCacheProtocol,
  registerImageCacheScheme
} from './services/imageCache'
import { initAutoUpdate } from './services/updater'
import { screen as electronScreen } from 'electron'
import type { CalibrationAnchors } from './types/settings'
import { logger } from './services/logger'

const isDev = !app.isPackaged
// The in-game overlay is paused for now; the app runs as the Hub. Flip back to
// re-enable the overlay window, poll loop, and per-card advice.
const OVERLAY_ENABLED = false
const TOGGLE_PIN_ACCELERATOR = 'CmdOrCtrl+Alt+S'
const OPEN_HUB_ACCELERATOR = 'CmdOrCtrl+Alt+B'
const STS2MCP_RELEASES_URL =
  'https://github.com/Gennadiyev/STS2MCP/releases/latest'

let overlay: OverlayWindowHandle | null = null
let annotation: AnnotationWindowHandle | null = null
let hub: HubWindowHandle | null = null
let pollLoop: PollLoop | null = null
let mockProvider: MockStateProvider | null = null
let store: StateStore | null = null
let tray: Tray | null = null
let recommender: Recommender | null = null
let savedBoundsBeforeCompact: { width: number; height: number } | null = null
let presenceTimer: NodeJS.Timeout | null = null
let gameRunning = false
let mcpConnected = false
let lastModVersion: string | undefined
let lastState: NormalizedState | null = null
let lastRec: RecommendationView = { kind: 'none' }
let calibrationState: CalibrationStatePayload = {
  active: false,
  step: 0,
  handSize: 0
}

function bootstrap(): void {
  registerImageCacheProtocol()
  store = new StateStore()

  const preloadPath = join(__dirname, '../preload/index.js')
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']

  // The in-game overlay is paused ("coming soon"); the app ships as the Hub.
  if (OVERLAY_ENABLED) {
    overlay = createOverlayWindow({
      preloadPath,
      rendererUrl: isDev ? rendererUrl : undefined,
      rendererFile: !isDev
        ? join(__dirname, '../renderer/index.html')
        : undefined,
      initialBounds: pickInitialBounds(),
      onBoundsChanged(bounds) {
        if (bounds.displayId !== undefined) {
          store?.setWindowBounds(bounds.displayId, bounds)
        }
      }
    })

    annotation = createAnnotationWindow({
      preloadPath,
      rendererUrl: isDev ? rendererUrl : undefined,
      rendererFile: !isDev
        ? join(__dirname, '../renderer/annotations.html')
        : undefined
    })

    // Push initial settings + apply saved zoom factor on first paint.
    overlay.win.webContents.once('did-finish-load', () => {
      const settings = store?.getSettings()
      if (settings) {
        applyZoom(settings.uiScale)
        sendToRenderer(IpcChannels.settingsChanged, settings)
      }
    })
  }

  hub = createHubWindow({
    preloadPath,
    rendererUrl: isDev ? rendererUrl : undefined,
    rendererFile: !isDev
      ? join(__dirname, '../renderer/hub.html')
      : undefined,
    icon: appIconPath(),
    // The Hub is the primary app window — show it on launch.
    showOnReady: true,
    initialBounds: store?.anyHubBounds(),
    onBoundsChanged(bounds) {
      if (bounds.displayId !== undefined) {
        store?.setHubBounds(bounds.displayId, bounds)
      }
    }
  })

  tray = createTray({
    overlay: overlay ?? undefined,
    onOpenHub: () => hub?.openFocus(),
    onQuit: () => app.quit()
  })

  registerHotkeys()
  registerIpc()
  initAutoUpdate()
  if (OVERLAY_ENABLED) {
    startRecommendationPipeline()
    startPresenceLoop()
  }
}

/**
 * Poll for whether Slay the Spire 2 is actually running and show/hide the
 * in-game overlay accordingly — it should never sit on the desktop when the
 * game is closed. Presence = mock mode (dev) OR mod connected OR the game
 * window is detectable. Also broadcasts status to the Hub.
 */
function startPresenceLoop(): void {
  const tick = async (): Promise<void> => {
    const mock = !!process.env['MOCK_STATE']
    let present = mock || mcpConnected
    if (!present) {
      const rect = await detectGameWindow().catch(() => null)
      present = !!rect
    }
    applyGameRunning(present)
    broadcastGameStatus()
  }
  void tick()
  presenceTimer = setInterval(() => void tick(), 2500)
}

function applyGameRunning(running: boolean): void {
  if (running === gameRunning) return
  gameRunning = running
  const ow = overlay?.win
  if (ow && !ow.isDestroyed()) {
    if (running) ow.showInactive()
    else ow.hide()
  }
  const aw = annotation?.win
  if (aw && !aw.isDestroyed()) {
    if (running) aw.showInactive()
    else aw.hide()
  }
}

function broadcastGameStatus(): void {
  const payload: GameStatus = {
    gameRunning,
    mcpConnected,
    modVersion: lastModVersion
  }
  const hubWin = hub?.win
  if (hubWin && !hubWin.isDestroyed()) {
    hubWin.webContents.send(IpcChannels.gameStatus, payload)
  }
  const ow = overlay?.win
  if (ow && !ow.isDestroyed()) {
    ow.webContents.send(IpcChannels.gameStatus, payload)
  }
}

function appIconPath(): string | undefined {
  // Dev: build/icon.png in the project root. Packaged: electron-builder applies
  // the exe icon, so the window icon is optional there.
  const devPath = join(process.cwd(), 'build', 'icon.png')
  if (isDev && existsSync(devPath)) return devPath
  const packed = join(process.resourcesPath, 'icon.png')
  if (existsSync(packed)) return packed
  return undefined
}

function pickInitialBounds(): WindowBounds | undefined {
  if (!store) return undefined
  const all = store.get('windowBounds')
  const keys = Object.keys(all)
  if (keys.length === 0) return undefined
  const id = Number(keys[0])
  return store.getWindowBounds(id)
}

function registerHotkeys(): void {
  const registered = globalShortcut.register(TOGGLE_PIN_ACCELERATOR, () => {
    if (!overlay) return
    overlay.setPinned(!overlay.isPinned())
    refreshTrayMenu()
    sendToRenderer(IpcChannels.overlayPinnedChanged, {
      pinned: overlay.isPinned()
    })
  })
  if (!registered) {
    logger.warn(
      { accel: TOGGLE_PIN_ACCELERATOR },
      'global shortcut registration failed'
    )
  }

  const hubRegistered = globalShortcut.register(OPEN_HUB_ACCELERATOR, () => {
    hub?.openFocus()
  })
  if (!hubRegistered) {
    logger.warn(
      { accel: OPEN_HUB_ACCELERATOR },
      'hub global shortcut registration failed'
    )
  }
}

function refreshTrayMenu(): void {
  refreshMenu({
    overlay: overlay ?? undefined,
    onOpenHub: () => hub?.openFocus(),
    onQuit: () => app.quit()
  })
}

function registerIpc(): void {
  ipcMain.handle(
    IpcChannels.overlaySetInteractive,
    (_event, interactive: boolean) => {
      overlay?.setInteractive(interactive)
    }
  )

  ipcMain.handle(IpcChannels.overlayTogglePinned, () => {
    if (!overlay) return false
    overlay.setPinned(!overlay.isPinned())
    refreshTrayMenu()
    sendToRenderer(IpcChannels.overlayPinnedChanged, {
      pinned: overlay.isPinned()
    })
    return overlay.isPinned()
  })

  ipcMain.handle(IpcChannels.overlayOpenModInstall, () => {
    void shell.openExternal(STS2MCP_RELEASES_URL)
  })

  ipcMain.handle(IpcChannels.modInstallBundled, async () => {
    return await installBundledMod()
  })

  ipcMain.handle(
    IpcChannels.overlaySetCompact,
    (_event, compact: boolean) => {
      const win = overlay?.win
      if (!win || win.isDestroyed()) return
      if (compact) {
        const [w, h] = win.getSize()
        if (typeof w === 'number' && typeof h === 'number') {
          savedBoundsBeforeCompact = { width: w, height: h }
        }
        win.setSize(280, 110, true)
      } else if (savedBoundsBeforeCompact) {
        win.setSize(
          savedBoundsBeforeCompact.width,
          savedBoundsBeforeCompact.height,
          true
        )
      }
    }
  )

  ipcMain.handle(IpcChannels.settingsGet, () => {
    return store?.getSettings()
  })

  ipcMain.handle(
    IpcChannels.settingsSet,
    (_event, partial: Partial<UserSettings>) => {
      const next = store?.setSettings(partial)
      if (next) {
        applyZoom(next.uiScale)
        sendToRenderer(IpcChannels.settingsChanged, next)
        // Push fresh annotations so calibration grid / sliders react
        // immediately, not only on the next game-state tick.
        if (lastState) void publishAnnotations(lastState, lastRec)
      }
      return next
    }
  )

  ipcMain.handle(IpcChannels.calibrationStart, () => {
    const handSize =
      lastState?.screen.kind === 'combat'
        ? lastState.screen.combat.hand.length
        : 0
    if (handSize < 2) {
      calibrationState = { active: false, step: 0, handSize: 0 }
      broadcastCalibrationState()
      return {
        ok: false,
        reason: 'Need ≥2 cards in hand to calibrate. Enter combat and try again.'
      }
    }
    calibrationState = { active: true, step: 1, handSize }
    annotation?.setInteractive(true)
    broadcastCalibrationState()
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.calibrationCancel, () => {
    calibrationState = { active: false, step: 0, handSize: 0 }
    annotation?.setInteractive(false)
    broadcastCalibrationState()
  })

  ipcMain.handle(
    IpcChannels.calibrationClick,
    (_event, point: { x: number; y: number }) => {
      if (!calibrationState.active) return
      if (calibrationState.step === 1) {
        calibrationState = {
          ...calibrationState,
          step: 2,
          leftCard: point
        }
        broadcastCalibrationState()
        return
      }
      if (calibrationState.step === 2 && calibrationState.leftCard) {
        const display = electronScreen.getPrimaryDisplay().workArea
        const anchors: CalibrationAnchors = {
          handSize: calibrationState.handSize,
          leftCard: calibrationState.leftCard,
          rightCard: point,
          display: { width: display.width, height: display.height },
          capturedAt: Date.now()
        }
        const next = store?.setSettings({ calibration: anchors })
        if (next) sendToRenderer(IpcChannels.settingsChanged, next)

        calibrationState = { active: false, step: 0, handSize: 0 }
        annotation?.setInteractive(false)
        broadcastCalibrationState()
        if (lastState) void publishAnnotations(lastState, lastRec)
      }
    }
  )

  ipcMain.handle(IpcChannels.overlayQuit, () => {
    app.quit()
  })

  // --- Hub: open / browse data / tier lists ---

  ipcMain.handle(IpcChannels.hubOpen, () => {
    hub?.openFocus()
  })

  ipcMain.handle(IpcChannels.clipboardWrite, (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle(IpcChannels.hubMinimize, () => {
    hub?.win.minimize()
  })

  ipcMain.handle(IpcChannels.hubMaximizeToggle, () => {
    const win = hub?.win
    if (!win || win.isDestroyed()) return false
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    }
    win.maximize()
    return true
  })

  ipcMain.handle(IpcChannels.hubClose, () => {
    hub?.win.hide()
  })

  ipcMain.handle(IpcChannels.tierDataGet, () => {
    return getTierBundle()
  })

  ipcMain.handle(IpcChannels.compendiumGet, () => {
    return loadCompendium()
  })

  ipcMain.handle(IpcChannels.tierListsList, () => {
    return {
      lists: store?.listTierLists() ?? [],
      activeId: store?.getActiveTierListId() ?? null
    }
  })

  ipcMain.handle(IpcChannels.tierListSave, (_event, list: CustomTierList) => {
    if (!store) return null
    const saved = store.saveTierList(list)
    // If the saved list is the active one, re-apply it to the overlay.
    if (store.getActiveTierListId() === saved.id) applyActiveTierList()
    return saved
  })

  ipcMain.handle(IpcChannels.tierListDelete, (_event, id: string) => {
    store?.deleteTierList(id)
    applyActiveTierList()
    broadcastActiveTierList()
  })

  ipcMain.handle(
    IpcChannels.tierListExport,
    async (_event, payload: { id: string; toFile?: boolean }) => {
      const list = store?.getTierList(payload.id)
      if (!list) return { ok: false, reason: 'Tier list not found.' }
      const share: TierListShare = {
        format: 'slay-overlay-tierlist',
        version: 1,
        list
      }
      const json = JSON.stringify(share)
      const code = Buffer.from(json, 'utf-8').toString('base64')
      clipboard.writeText(code)

      let savedPath: string | undefined
      if (payload.toFile) {
        const res = await dialog.showSaveDialog({
          title: 'Export tier list',
          defaultPath: `${sanitizeFileName(list.name)}.tierlist.json`,
          filters: [{ name: 'Tier list', extensions: ['json'] }]
        })
        if (!res.canceled && res.filePath) {
          writeFileSync(res.filePath, JSON.stringify(share, null, 2), 'utf-8')
          savedPath = res.filePath
        }
      }
      return { ok: true, code, savedPath }
    }
  )

  ipcMain.handle(
    IpcChannels.tierListImport,
    async (_event, payload: { code?: string }) => {
      try {
        let json: string
        if (payload.code && payload.code.trim()) {
          json = Buffer.from(payload.code.trim(), 'base64').toString('utf-8')
        } else {
          const res = await dialog.showOpenDialog({
            title: 'Import tier list',
            properties: ['openFile'],
            filters: [{ name: 'Tier list', extensions: ['json'] }]
          })
          if (res.canceled || !res.filePaths[0]) {
            return { ok: false, reason: 'cancelled' }
          }
          json = readFileSync(res.filePaths[0], 'utf-8')
        }
        const list = parseSharedTierList(json)
        if (!list) return { ok: false, reason: 'Invalid tier list file or code.' }
        // Re-id on import so it never clobbers an existing list.
        const imported: CustomTierList = {
          ...list,
          id: `tl_${Date.now().toString(36)}`,
          name: `${list.name} (imported)`,
          updatedAt: Date.now()
        }
        store?.saveTierList(imported)
        return { ok: true, list: imported }
      } catch (err) {
        logger.error({ err }, 'tier list import failed')
        return { ok: false, reason: 'Could not read the tier list.' }
      }
    }
  )

  ipcMain.handle(
    IpcChannels.tierListSetActive,
    (_event, id: string | null) => {
      store?.setActiveTierListId(id)
      applyActiveTierList()
      broadcastActiveTierList()
      return id
    }
  )
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'tierlist'
}

function parseSharedTierList(json: string): CustomTierList | null {
  const parsed = JSON.parse(json) as Partial<TierListShare>
  if (parsed.format !== 'slay-overlay-tierlist' || !parsed.list) return null
  const list = parsed.list
  if (!list.id || !list.name || (list.kind !== 'card' && list.kind !== 'relic')) {
    return null
  }
  if (typeof list.tiers !== 'object' || list.tiers === null) return null
  return list
}

/**
 * Rebuild the recommender's bundle from the official base plus the active
 * custom tier list (if any) and re-run the current recommendation so live
 * advice reflects the change immediately.
 */
function applyActiveTierList(): void {
  if (!recommender) return
  const activeId = store?.getActiveTierListId() ?? null
  const list = activeId ? store?.getTierList(activeId) : null
  recommender.setBundle(applyTierList(getTierBundle(), list))
  if (lastState) {
    try {
      const rec = recommender.recommend(lastState) as RecommendationView
      lastRec = rec
      sendToRenderer(IpcChannels.recommendationReady, rec)
      void publishAnnotations(lastState, rec)
    } catch (err) {
      logger.error({ err }, 're-recommend after tier list change failed')
    }
  }
}

function broadcastActiveTierList(): void {
  const activeId = store?.getActiveTierListId() ?? null
  const hubWin = hub?.win
  if (hubWin && !hubWin.isDestroyed()) {
    hubWin.webContents.send(IpcChannels.tierListActiveChanged, { activeId })
  }
}

function broadcastCalibrationState(): void {
  const annoWin = annotation?.win
  const overlayWin = overlay?.win
  if (annoWin && !annoWin.isDestroyed()) {
    annoWin.webContents.send(IpcChannels.calibrationState, calibrationState)
  }
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send(IpcChannels.calibrationState, calibrationState)
  }
}

function startRecommendationPipeline(): void {
  const bundle = loadTierBundle()
  recommender = createRecommender(bundle)
  // Apply a previously-active custom tier list, if any, on top of the base.
  applyActiveTierList()

  const onState = (state: NormalizedState): void => {
    const active = recommender
    if (!active) return
    mcpConnected = true
    lastModVersion = state.modVersion
    // The game is clearly running once we have state — surface it immediately.
    applyGameRunning(true)
    broadcastGameStatus()
    sendToRenderer(IpcChannels.gameStateUpdate, state)
    sendToRenderer(IpcChannels.mcpHealth, {
      ok: true,
      version: state.modVersion,
      lastOkAt: Date.now()
    } satisfies McpHealth)
    try {
      const rec = active.recommend(state) as RecommendationView
      lastState = state
      lastRec = rec
      sendToRenderer(IpcChannels.recommendationReady, rec)
      void publishAnnotations(state, rec)
    } catch (err) {
      logger.error({ err }, 'recommender failure')
      lastState = state
      lastRec = { kind: 'none' }
      sendToRenderer(IpcChannels.recommendationReady, { kind: 'none' })
      void publishAnnotations(state, { kind: 'none' })
    }
  }

  const mockPath = process.env['MOCK_STATE']
  if (mockPath) {
    logger.info({ mockPath }, 'starting mock state provider (dev)')
    mockProvider = new MockStateProvider(mockPath, { onState })
    mockProvider.start()
    return
  }

  const client = new McpClient()
  pollLoop = new PollLoop(client, {
    onState,
    onHealth(health) {
      mcpConnected = health.ok
      if (health.version) lastModVersion = health.version
      broadcastGameStatus()
      sendToRenderer(IpcChannels.mcpHealth, health)
    }
  })
  pollLoop.start()
  logger.info('poll loop started')
}

function sendToRenderer<T>(channel: string, payload: T): void {
  const win = overlay?.win
  if (!win || win.isDestroyed()) return
  win.webContents.send(channel, payload)
}

function applyZoom(scale: number): void {
  const win = overlay?.win
  if (!win || win.isDestroyed()) return
  // Renderer-level zoom scales all CSS — including hardcoded text-[10px] /
  // padding values — uniformly. Inline fontSize alone can't do that.
  win.webContents.setZoomFactor(scale)
}

async function publishAnnotations(
  state: NormalizedState,
  rec: RecommendationView
): Promise<void> {
  const win = annotation?.win
  if (!win || win.isDestroyed()) return

  const settings = store?.getSettings()
  if (!settings) return

  const isCombat =
    state.screen.kind === 'combat' && rec.kind === 'combatPlay'
  const visible = isCombat && settings.showPerCardBadges

  const display = electronScreen.getPrimaryDisplay()
  const annotations =
    isCombat && rec.kind === 'combatPlay' ? rec.result.hand : []

  // When the calibration grid is on, always render reference slots even out
  // of combat so the user can dial in alignment against the in-game UI.
  const slotsForLayout =
    annotations.length > 0
      ? annotations.length
      : settings.showCalibrationGrid
        ? 5
        : 0

  const anchors = settings.calibration
    ? {
        handSize: settings.calibration.handSize,
        leftCenter: settings.calibration.leftCard,
        rightCenter: settings.calibration.rightCard,
        display: settings.calibration.display
      }
    : null

  // Mod-provided positions take priority when every annotation has a pos.
  const combatViewport =
    state.screen.kind === 'combat' ? state.screen.combat.viewport : undefined
  const modPositions =
    annotations.length > 0 && annotations.every((a) => !!a.pos)
      ? annotations.map((a) => a.pos)
      : undefined

  // Game-window fallback: when there's no mod-provided pos AND no manual
  // anchors, scale the heuristic to the game's actual window rect (handles
  // windowed-mode + non-primary monitors). Cached at 1Hz.
  let layoutWidth = display.workArea.width
  let layoutHeight = display.workArea.height
  let usedWindow = false
  if (!modPositions && !anchors) {
    const gameRect = await detectGameWindow().catch(() => null)
    if (gameRect && gameRect.width > 0 && gameRect.height > 0) {
      layoutWidth = gameRect.width
      layoutHeight = gameRect.height
      usedWindow = true
    }
  }

  const slots = estimateCardSlots({
    handSize: slotsForLayout,
    displayWidth: layoutWidth,
    displayHeight: layoutHeight,
    calibration: {
      verticalOffsetPct: settings.verticalOffsetPct,
      horizontalStretchPct: settings.horizontalStretchPct
    },
    anchors,
    modPositions,
    modViewport: combatViewport
  })

  const calibrationSource: AnnotationPayload['calibrationSource'] =
    modPositions ? 'mod' : anchors ? 'manual' : usedWindow ? 'window' : 'heuristic'

  const payload: AnnotationPayload = {
    visible,
    display: {
      width: display.workArea.width,
      height: display.workArea.height
    },
    slots,
    annotations,
    showCalibrationGrid: settings.showCalibrationGrid,
    calibrationSource
  }
  win.webContents.send(IpcChannels.annotationsUpdate, payload)
  // Also send to the corner overlay so the Settings panel can show the
  // current calibration source pill.
  const cornerWin = overlay?.win
  if (cornerWin && !cornerWin.isDestroyed()) {
    cornerWin.webContents.send(IpcChannels.annotationsUpdate, payload)
  }
}

// Custom image-cache scheme must be registered before the app is ready.
registerImageCacheScheme()

app.whenReady().then(bootstrap)

app.on('before-quit', () => {
  // Let the Hub's hide-on-close guard fall through so the app can exit.
  if (hub) {
    ;(hub.win as BrowserWindow & { _forceClose?: boolean })._forceClose = true
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (presenceTimer) clearInterval(presenceTimer)
  pollLoop?.stop()
  mockProvider?.stop()
  store?.flush()
})

app.on('window-all-closed', () => {
  // Tray keeps the app alive; only quit explicitly via tray "Quit".
  // Subscribing (and not calling app.quit) overrides the default quit-on-close.
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) bootstrap()
})
