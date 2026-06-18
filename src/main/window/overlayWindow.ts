import { BrowserWindow, screen } from 'electron'
import type { WindowBounds } from '../services/persistedState'

export interface OverlayWindowOptions {
  preloadPath: string
  rendererUrl?: string
  rendererFile?: string
  initialBounds?: WindowBounds
  onBoundsChanged?: (bounds: WindowBounds) => void
}

/**
 * Where the overlay sits. `hud` is the default top-center strip; `mapLeft`
 * is a tall, left-anchored panel used on the map screen so the route plan can
 * live in the empty space beside the map (mirroring the in-game Legend on the
 * right) instead of overlapping the map itself.
 */
export type OverlayLayout = 'hud' | 'mapLeft'

export interface OverlayWindowHandle {
  win: BrowserWindow
  setInteractive(interactive: boolean): void
  setPinned(pinned: boolean): void
  isPinned(): boolean
  /** Switch the window between the top-strip HUD and the left map panel. */
  setLayout(layout: OverlayLayout): void
}

// Fixed horizontal HUD anchored to the top-center of the screen.
const HUD_HEIGHT = 260
// Pushed down a fraction of the screen so it clears the game's top header bar.
const HUD_TOP_FRACTION = 0.07
const HUD_MAX_WIDTH = 1320
const HUD_SIDE_MARGIN = 60

// Left panel for the map screen. Tall enough to hold a full route; the content
// is compact and vertically centered within it.
const MAP_PANEL_WIDTH = 300
const MAP_PANEL_HEIGHT_FRACTION = 0.78
const MAP_PANEL_LEFT_MARGIN = 24

export function createOverlayWindow(
  opts: OverlayWindowOptions
): OverlayWindowHandle {
  let layout: OverlayLayout = 'hud'
  const bounds = resolveBounds(layout)

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    transparent: true,
    frame: false,
    hasShadow: false,
    skipTaskbar: true,
    // Fixed HUD: anchored top-center, never moved or resized by the user.
    // All controls live in the Hub.
    resizable: false,
    movable: false,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      sandbox: false
    }
  })

  // 'screen-saver' keeps the overlay above borderless-fullscreen games on Windows.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Suppress the Windows system menu on right-click of the drag-region header.
  win.on('system-context-menu', (e: Electron.Event) => {
    e.preventDefault()
  })

  let pinned = false
  applyInteractivity(win, /* interactive */ false, pinned)
  // Visibility is driven by game presence (see index.ts), not shown on ready.

  if (opts.rendererUrl) {
    void win.loadURL(opts.rendererUrl)
  } else if (opts.rendererFile) {
    void win.loadFile(opts.rendererFile)
  }

  if (opts.onBoundsChanged) {
    const emit = (): void => {
      const b = win.getBounds()
      const display = screen.getDisplayMatching(b)
      opts.onBoundsChanged!({
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        displayId: display.id
      })
    }
    win.on('moved', emit)
    win.on('resized', emit)
  }

  return {
    win,
    setInteractive(interactive: boolean) {
      applyInteractivity(win, interactive, pinned)
    },
    setPinned(next: boolean) {
      pinned = next
      // When pinning, treat as interactive; when unpinning, return to hover.
      applyInteractivity(win, next, pinned)
    },
    isPinned() {
      return pinned
    },
    setLayout(next: OverlayLayout) {
      if (next === layout || win.isDestroyed()) return
      layout = next
      // A window created with resizable/movable:false ignores programmatic
      // setBounds on Windows, so briefly re-enable them around the resize.
      win.setResizable(true)
      win.setMovable(true)
      win.setBounds(resolveBounds(next))
      win.setMovable(false)
      win.setResizable(false)
    }
  }
}

function applyInteractivity(
  win: BrowserWindow,
  interactive: boolean,
  pinned: boolean
): void {
  if (interactive || pinned) {
    win.setIgnoreMouseEvents(false)
  } else {
    win.setIgnoreMouseEvents(true, { forward: true })
  }
}

function resolveBounds(
  layout: OverlayLayout
): { x: number; y: number; width: number; height: number } {
  // Anchor to the primary display — saved bounds are ignored so the overlay
  // never drifts; the layout is driven entirely by the current screen.
  const { workArea } = screen.getPrimaryDisplay()

  if (layout === 'mapLeft') {
    const height = Math.round(workArea.height * MAP_PANEL_HEIGHT_FRACTION)
    return {
      width: MAP_PANEL_WIDTH,
      height,
      x: workArea.x + MAP_PANEL_LEFT_MARGIN,
      y: workArea.y + Math.round((workArea.height - height) / 2)
    }
  }

  // hud: fixed horizontal strip, top-center.
  const width = Math.min(
    HUD_MAX_WIDTH,
    Math.max(720, workArea.width - HUD_SIDE_MARGIN * 2)
  )
  return {
    width,
    height: HUD_HEIGHT,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: workArea.y + Math.round(workArea.height * HUD_TOP_FRACTION)
  }
}
