import { BrowserWindow, screen } from 'electron'
import type { WindowBounds } from '../services/persistedState'

export interface OverlayWindowOptions {
  preloadPath: string
  rendererUrl?: string
  rendererFile?: string
  initialBounds?: WindowBounds
  onBoundsChanged?: (bounds: WindowBounds) => void
}

export interface OverlayWindowHandle {
  win: BrowserWindow
  setInteractive(interactive: boolean): void
  setPinned(pinned: boolean): void
  isPinned(): boolean
}

const DEFAULT_WIDTH = 360
const DEFAULT_HEIGHT = 480
const EDGE_MARGIN = 24

export function createOverlayWindow(
  opts: OverlayWindowOptions
): OverlayWindowHandle {
  const bounds = resolveBounds(opts.initialBounds)

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    transparent: true,
    frame: false,
    hasShadow: false,
    skipTaskbar: true,
    resizable: true,
    minWidth: 220,
    minHeight: 80,
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
  saved: WindowBounds | undefined
): { x: number; y: number; width: number; height: number } {
  const all = screen.getAllDisplays()

  if (saved && all.some((d) => d.id === saved.displayId)) {
    if (boundsOnScreen(saved, all)) {
      return {
        x: saved.x,
        y: saved.y,
        width: saved.width,
        height: saved.height
      }
    }
  }

  const display = screen.getPrimaryDisplay()
  const { workArea } = display
  const width = DEFAULT_WIDTH
  const height = DEFAULT_HEIGHT
  return {
    width,
    height,
    x: workArea.x + workArea.width - width - EDGE_MARGIN,
    y: workArea.y + EDGE_MARGIN
  }
}

function boundsOnScreen(
  b: WindowBounds,
  displays: Electron.Display[]
): boolean {
  // Require ≥40px of the window to be visible on some display.
  return displays.some((d) => {
    const wa = d.workArea
    const overlapX = Math.max(
      0,
      Math.min(b.x + b.width, wa.x + wa.width) - Math.max(b.x, wa.x)
    )
    const overlapY = Math.max(
      0,
      Math.min(b.y + b.height, wa.y + wa.height) - Math.max(b.y, wa.y)
    )
    return overlapX >= 40 && overlapY >= 40
  })
}
