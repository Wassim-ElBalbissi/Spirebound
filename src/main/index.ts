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
import { createHubWindow, HubWindowHandle } from './window/hubWindow'
import { createTray, refreshMenu } from './window/trayMenu'
import { IpcChannels } from './ipc/channels'
import { McpClient } from './services/mcpClient'
import { PollLoop } from './services/pollLoop'
import { MockStateProvider } from './services/mockStateProvider'
import { loadTierBundle, getTierBundle } from './services/tierData/cacheStore'
import { applyTierList } from './services/tierData/applyTierList'
import { loadCompendium } from './services/compendium'
import { CurrentRunDeckFetcher } from './services/compendium/currentRun'
import { resolveDeckIds } from './services/tierData/cardNameIndex'
import { createRecommender, Recommender } from './services/recommender'
import { StateStore, UserSettings, WindowBounds } from './services/persistedState'
import type { CustomTierList, TierListShare } from './types/tierList'
import type {
  CardInstance,
  NormalizedState,
  McpHealth,
  GameStatus
} from './types/gameState'
import type { RecommendationView } from './types/recommendation'
import { runSetup } from './services/modInstaller'
import { detectGame, detectGameWindow } from './services/gameWindow'
import { computeRegion, toPixelStrokes } from './services/drawing/drawEngine'
import { pickRandomShape } from './services/drawing/shapes'
import { drawStrokes } from './services/drawing/mouseDraw'
import {
  registerImageCacheProtocol,
  registerImageCacheScheme
} from './services/imageCache'
import { initAutoUpdate } from './services/updater'
import { screen as electronScreen } from 'electron'
import type { HotkeyInfo } from './types/settings'
import { logger } from './services/logger'

const isDev = !app.isPackaged
// The in-game overlay is active: it owns the poll loop, the recommendation
// pipeline, and the per-card advice surface. The Hub runs alongside it.
const OVERLAY_ENABLED = true
const TOGGLE_PIN_ACCELERATOR = 'CmdOrCtrl+Alt+S'
const OPEN_HUB_ACCELERATOR = 'CmdOrCtrl+Alt+B'
const DRAW_MAP_ACCELERATOR = 'CmdOrCtrl+Alt+D'
const STS2MCP_RELEASES_URL =
  'https://github.com/Gennadiyev/STS2MCP/releases/latest'

let overlay: OverlayWindowHandle | null = null
let hub: HubWindowHandle | null = null
let pollLoop: PollLoop | null = null
let mockProvider: MockStateProvider | null = null
let store: StateStore | null = null
let tray: Tray | null = null
let recommender: Recommender | null = null
let deckFetcher: CurrentRunDeckFetcher | null = null
/** Floor we last attempted a deck fetch for (one attempt per floor). */
let lastDeckFloor = -1
/**
 * Deck reconstructed from the most recent combat's piles, with ids resolved.
 * Used as the primary deck source outside combat (the compendium endpoint is a
 * refinement), so build-aware advice works even when that endpoint doesn't.
 */
let lastCombatDeck: CardInstance[] | null = null
let savedBoundsBeforeCompact: { width: number; height: number } | null = null
let presenceTimer: NodeJS.Timeout | null = null
/** Set once a quit is underway so we only tear down once. */
let isQuitting = false
let gameRunning = false
/** Whether the overlay window is currently shown. */
let overlayVisible = false
let mcpConnected = false
let lastModVersion: string | undefined
let lastState: NormalizedState | null = null
let lastRec: RecommendationView = { kind: 'none' }
/** Last health pushed to the renderer, replayed when an overlay (re)loads. */
let lastHealth: McpHealth = { ok: false }

function bootstrap(): void {
  registerImageCacheProtocol()
  store = new StateStore()

  const preloadPath = join(__dirname, '../preload/index.js')
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']

  // The in-game overlay renders live advice; the Hub is the browse companion.
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
    },
    // Closing the Hub by any means quits the whole app.
    onCloseRequest: () => quitApp()
  })

  tray = createTray({
    overlay: overlay ?? undefined,
    onOpenHub: () => hub?.openFocus(),
    onQuit: () => quitApp(),
    iconPath: appIconPath()
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
 * Quit the whole app. The Hub is the primary window now, so closing it (the
 * custom title-bar X, the tray "Quit", or the overlay) must terminate the
 * process — not hide to tray. Destroying every window directly bypasses the
 * Hub's hide-on-close guard, so no window's `close` handler can veto the quit
 * (a single vetoed close aborts the entire `app.quit()`); `will-quit` then runs
 * the rest of the teardown.
 */
function quitApp(): void {
  if (isQuitting) return
  isQuitting = true
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.destroy()
  }
  app.quit()
}

/**
 * Poll for whether Slay the Spire 2 is running AND focused, and show/hide the
 * in-game overlay accordingly. The overlay must never sit on the desktop when
 * the game is closed, nor float over other apps when the player has alt-tabbed
 * away — so visibility requires the game to be the foreground window. The
 * separate `gameRunning` status (shown in the Hub) keeps a grace period so it
 * doesn't flicker on a momentary mod hiccup.
 */
function startPresenceLoop(): void {
  const HIDE_GRACE_MS = 20000
  const PRESENCE_INTERVAL_MS = 1500
  let absentSince: number | null = null
  const tick = async (): Promise<void> => {
    const mock = !!process.env['MOCK_STATE']
    let running: boolean
    let foreground: boolean
    if (mock) {
      running = true
      foreground = true
    } else {
      const game = await detectGame().catch(() => ({
        rect: null,
        foreground: false
      }))
      running = mcpConnected || !!game.rect
      foreground = game.foreground
    }
    // Grace period before declaring the game gone, to ride out brief hiccups.
    if (running) {
      absentSince = null
    } else {
      if (absentSince === null) absentSince = Date.now()
      if (Date.now() - absentSince < HIDE_GRACE_MS) running = true
    }
    gameRunning = running
    // The overlay only shows while the game is the focused window.
    setOverlayVisible(running && (mock || foreground))
    // Re-assert top-most while visible so the HUD stays above the game.
    if (overlayVisible) {
      const ow = overlay?.win
      if (ow && !ow.isDestroyed() && ow.isVisible()) {
        ow.setAlwaysOnTop(true, 'screen-saver')
      }
    }
    broadcastGameStatus()
  }
  void tick()
  presenceTimer = setInterval(() => void tick(), PRESENCE_INTERVAL_MS)
}

function setOverlayVisible(visible: boolean): void {
  if (visible === overlayVisible) return
  overlayVisible = visible
  const ow = overlay?.win
  if (ow && !ow.isDestroyed()) {
    if (visible) ow.showInactive()
    else ow.hide()
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

/** Live registration status of each global hotkey (read by the Hub settings). */
const hotkeyStatus: HotkeyInfo[] = []

function registerHotkeys(): void {
  // Re-registering on a relaunch: drop stale entries first. globalShortcut owns
  // the OS binding, so a failure here means another app (or a leftover
  // instance) holds the combo — surfaced to the user via hotkeysGet.
  hotkeyStatus.length = 0
  const bind = (
    accelerator: string,
    label: string,
    handler: () => void
  ): void => {
    let ok = false
    try {
      ok = globalShortcut.register(accelerator, handler)
    } catch (err) {
      logger.warn({ err, accelerator }, 'global shortcut registration threw')
    }
    if (!ok) {
      logger.warn(
        { accelerator, label },
        'global shortcut unavailable — already held by another app or instance'
      )
    }
    hotkeyStatus.push({ accelerator, label, registered: ok })
  }

  bind(TOGGLE_PIN_ACCELERATOR, 'Pin / unpin overlay', () => {
    if (!overlay) return
    overlay.setPinned(!overlay.isPinned())
    refreshTrayMenu()
    sendToRenderer(IpcChannels.overlayPinnedChanged, {
      pinned: overlay.isPinned()
    })
  })

  bind(OPEN_HUB_ACCELERATOR, 'Open Hub', () => {
    hub?.openFocus()
  })

  bind(DRAW_MAP_ACCELERATOR, 'Doodle on map', () => {
    void runDoodle()
  })
}

/**
 * Trace a random shape onto the map by driving the mouse with the in-game pen.
 * Positions the drawing inside the game window (lower-middle, clear of the HUD)
 * and falls back to the primary display when the window can't be located.
 */
async function runDoodle(): Promise<void> {
  if (!store?.getSettings().enableMapDoodles) return
  try {
    const rect = await detectGameWindow()
    const display = electronScreen.getPrimaryDisplay().workArea
    const region = computeRegion(rect, display)
    const shape = pickRandomShape()
    const strokes = toPixelStrokes(shape, region)
    logger.info(
      { shape: shape.name, strokes: strokes.length },
      'doodle: drawing on map'
    )
    await drawStrokes(strokes)
  } catch (err) {
    logger.warn({ err }, 'doodle: failed')
  }
}

function refreshTrayMenu(): void {
  refreshMenu({
    overlay: overlay ?? undefined,
    onOpenHub: () => hub?.openFocus(),
    onQuit: () => quitApp()
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

  ipcMain.handle(IpcChannels.openExternal, (_event, url: unknown) => {
    // Only open well-formed http(s) links in the OS browser — never
    // file:// or app-internal schemes coming from renderer data.
    if (typeof url !== 'string') return
    if (!/^https?:\/\//i.test(url)) return
    void shell.openExternal(url)
  })

  ipcMain.handle(IpcChannels.modInstallBundled, async () => {
    if (!store) store = new StateStore()
    return await runSetup(store)
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

  ipcMain.handle(IpcChannels.hotkeysGet, () => hotkeyStatus)

  // Pull the latest known status when an overlay (re)loads, so it never has to
  // wait for the next push — avoids flashing the "mod not detected" panel.
  ipcMain.handle(IpcChannels.overlaySnapshot, () => {
    return { health: lastHealth, state: lastState, recommendation: lastRec }
  })

  ipcMain.handle(
    IpcChannels.settingsSet,
    (_event, partial: Partial<UserSettings>) => {
      const next = store?.setSettings(partial)
      if (next) {
        applyZoom(next.uiScale)
        sendToRenderer(IpcChannels.settingsChanged, next)
        if (partial.applyIntentModifiers !== undefined && recommender) {
          recommender.setApplyIntentModifiers(next.applyIntentModifiers)
          rerunCurrentRecommendation()
        }
      }
      return next
    }
  )

  ipcMain.handle(IpcChannels.overlayQuit, () => {
    quitApp()
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
    // The Hub is the whole app now — closing it should quit, not hide to tray.
    // quitApp() destroys every window directly so the hide-on-close guard can't
    // veto the quit and the process actually exits.
    quitApp()
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
  rerunCurrentRecommendation()
}

/**
 * Re-run the recommender against the most recent state and re-publish, so live
 * advice reflects a changed input (tier list, fetched deck) immediately.
 */
function rerunCurrentRecommendation(): void {
  if (!recommender || !lastState) return
  try {
    const rec = recommender.recommend(lastState) as RecommendationView
    lastRec = rec
    sendToRenderer(IpcChannels.recommendationReady, rec)
  } catch (err) {
    logger.error({ err }, 're-recommend failed')
  }
}

/** Decision screens where knowing the deck improves the advice. */
function isDeckRelevant(kind: NormalizedState['screen']['kind']): boolean {
  return (
    kind === 'cardReward' ||
    kind === 'relicReward' ||
    kind === 'shop' ||
    kind === 'event' ||
    kind === 'rest'
  )
}

/**
 * Cache the deck reconstructed from the live combat piles (ids resolved against
 * the bundle) and feed it to the recommender. This runs every combat tick so the
 * deck stays fresh, and it's the deck the next non-combat screen reasons about.
 */
function captureCombatDeck(state: NormalizedState): void {
  if (!recommender) return
  const { run, screen } = state
  if (!run || screen.kind !== 'combat') return
  const deck = screen.combat.deck
  if (!deck || deck.length === 0) return
  const resolved = resolveDeckIds(deck, run.character, getTierBundle())
  lastCombatDeck = resolved
  recommender.setDeck(resolved)
}

/**
 * Make the run's deck known on a new floor's decision screen so card / relic /
 * shop advice is build-aware. The deck from the most recent combat is the
 * primary source (always available, no network); the compendium endpoint is a
 * refinement that only wins when it returns a plausibly-complete deck. The deck
 * only changes between floors, so we attempt the fetch at most once per floor.
 */
function maybeRefreshDeck(state: NormalizedState): void {
  if (!deckFetcher || !recommender) return
  const run = state.run
  if (!run) {
    // Menu / game over: forget the deck so the next run refetches cleanly.
    if (lastDeckFloor !== -1) {
      lastDeckFloor = -1
      lastCombatDeck = null
      deckFetcher.reset()
      recommender.setDeck(null)
    }
    return
  }
  if (!isDeckRelevant(state.screen.kind)) return
  if (run.floor === lastDeckFloor) return
  lastDeckFloor = run.floor
  // Seed the combat-derived deck immediately (no wait on the network).
  if (lastCombatDeck && lastCombatDeck.length > 0) {
    recommender.setDeck(lastCombatDeck)
  }
  void deckFetcher
    .getDeck(run.floor)
    .then((deck) => {
      if (!deck || !recommender) return
      // The compendium shape is unverified — don't let a truncated/garbage
      // payload clobber the (usually complete) combat-derived deck.
      if (deck.length < (lastCombatDeck?.length ?? 0)) return
      recommender.setDeck(deck)
      rerunCurrentRecommendation()
    })
    .catch((err) => logger.debug({ err }, 'deck fetch failed'))
}

function broadcastActiveTierList(): void {
  const activeId = store?.getActiveTierListId() ?? null
  const hubWin = hub?.win
  if (hubWin && !hubWin.isDestroyed()) {
    hubWin.webContents.send(IpcChannels.tierListActiveChanged, { activeId })
  }
}

function startRecommendationPipeline(): void {
  const bundle = loadTierBundle()
  recommender = createRecommender(bundle, loadCompendium().builds)
  recommender.setApplyIntentModifiers(
    store?.getSettings().applyIntentModifiers ?? false
  )
  deckFetcher = new CurrentRunDeckFetcher(new McpClient())
  lastDeckFloor = -1
  // Apply a previously-active custom tier list, if any, on top of the base.
  applyActiveTierList()

  const onState = (state: NormalizedState): void => {
    const active = recommender
    if (!active) return
    mcpConnected = true
    lastModVersion = state.modVersion
    // The game is clearly running once we have state — but the presence loop
    // owns overlay visibility (it must stay hidden when the game isn't focused).
    gameRunning = true
    broadcastGameStatus()
    sendToRenderer(IpcChannels.gameStateUpdate, state)
    lastHealth = {
      ok: true,
      version: state.modVersion,
      lastOkAt: Date.now()
    }
    sendToRenderer(IpcChannels.mcpHealth, lastHealth)
    try {
      const rec = active.recommend(state) as RecommendationView
      lastState = state
      lastRec = rec
      sendToRenderer(IpcChannels.recommendationReady, rec)
    } catch (err) {
      logger.error({ err }, 'recommender failure')
      lastState = state
      lastRec = { kind: 'none' }
      sendToRenderer(IpcChannels.recommendationReady, { kind: 'none' })
    }
    // Cache the live combat deck, then lazily refresh on floor change.
    captureCombatDeck(state)
    maybeRefreshDeck(state)
    // The map screen gets a tall left-side panel; everything else the top HUD.
    overlay?.setLayout(
      state.run && state.screen.kind === 'map' ? 'mapLeft' : 'hud'
    )
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
      lastHealth = health
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

// Headless one-shot used by the Windows installer (ExecWait'd from the NSIS
// customInstall step): install the mod + dependencies and migrate the unmodded
// save profile into the modded scope, then exit. Best-effort — never throws so
// the installer can't be blocked, and never opens a window.
const SETUP_MODE = process.argv.includes('--spirebound-setup')

if (SETUP_MODE) {
  app.whenReady().then(async () => {
    try {
      const s = new StateStore()
      const result = await runSetup(s)
      s.flush()
      logger.info({ result }, 'spirebound-setup finished')
    } catch (err) {
      logger.error({ err }, 'spirebound-setup crashed')
    } finally {
      app.exit(0)
    }
  })
} else if (!app.requestSingleInstanceLock()) {
  // Another Spirebound is already running. A second instance can't re-register
  // the global shortcuts (Ctrl+Alt+S / B / D), so it would silently break them
  // — quit and let the existing instance keep ownership.
  logger.warn('another instance is already running; quitting this one')
  app.quit()
} else {
  // Surface the existing instance if the user launches Spirebound again.
  app.on('second-instance', () => {
    hub?.openFocus()
  })
  // Custom image-cache scheme must be registered before the app is ready.
  registerImageCacheScheme()
  app.whenReady().then(bootstrap)
}

app.on('before-quit', () => {
  // Belt-and-suspenders for OS-initiated quits (Windows shutdown, Cmd+Q) that
  // don't route through quitApp(): let the Hub's hide-on-close guard fall
  // through so the app can exit instead of hiding to tray.
  isQuitting = true
  if (hub && !hub.win.isDestroyed()) {
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
