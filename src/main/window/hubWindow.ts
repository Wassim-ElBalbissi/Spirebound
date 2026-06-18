import { BrowserWindow, screen } from 'electron'
import type { WindowBounds } from '../services/persistedState'

export interface HubWindowOptions {
  preloadPath: string
  rendererUrl?: string
  rendererFile?: string
  icon?: string
  /** Show + focus the window as soon as it's ready (used on app launch). */
  showOnReady?: boolean
  initialBounds?: WindowBounds
  onBoundsChanged?: (bounds: WindowBounds) => void
  /**
   * Called when the user closes the Hub by any means (custom title-bar X,
   * Alt+F4, taskbar "Close window"). The Hub is the whole app, so this should
   * quit rather than hide to tray.
   */
  onCloseRequest?: () => void
}

export interface HubWindowHandle {
  win: BrowserWindow
  openFocus(): void
}

const DEFAULT_WIDTH = 1100
const DEFAULT_HEIGHT = 720

/**
 * The Hub is a normal, framed, alt-tab-able window for browsing the card /
 * relic / compendium databases and editing tier lists. Unlike the overlay it is
 * NOT transparent, NOT always-on-top, and DOES appear in the taskbar so it can
 * be parked on a second monitor. It is hidden (not destroyed) on close so
 * reopening is instant.
 */
export function createHubWindow(opts: HubWindowOptions): HubWindowHandle {
  const bounds = resolveBounds(opts.initialBounds)

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'Spirebound',
    backgroundColor: '#0b0b0f',
    // Frameless: we draw our own native-looking dark title bar in the renderer
    // (HubRoot's TitleBar). No OS/browser chrome.
    frame: false,
    autoHideMenuBar: true,
    icon: opts.icon,
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Frameless windows on Windows pop the native system menu when you
  // right-click the drag region. Suppress it — we have our own controls.
  win.on('system-context-menu', (e: Electron.Event) => {
    e.preventDefault()
  })

  if (opts.showOnReady) {
    win.once('ready-to-show', () => {
      win.show()
      win.focus()
    })
  }

  if (opts.rendererUrl) {
    void win.loadURL(`${opts.rendererUrl}/hub.html`)
  } else if (opts.rendererFile) {
    void win.loadFile(opts.rendererFile)
  }

  // The Hub is the whole app — closing it (custom X, Alt+F4, taskbar close)
  // quits rather than hiding to tray. _forceClose is set once the app is
  // already tearing down (e.g. an OS-initiated app.quit), so that close is
  // allowed straight through; otherwise we defer to the quit routine, which
  // destroys windows so the quit can't be vetoed.
  win.on('close', (e) => {
    if ((win as BrowserWindow & { _forceClose?: boolean })._forceClose) return
    e.preventDefault()
    opts.onCloseRequest?.()
  })

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
    openFocus() {
      if (!win.isVisible()) win.show()
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  }
}

function resolveBounds(saved: WindowBounds | undefined): {
  x?: number
  y?: number
  width: number
  height: number
} {
  const all = screen.getAllDisplays()
  if (saved && all.some((d) => d.id === saved.displayId)) {
    return {
      x: saved.x,
      y: saved.y,
      width: saved.width,
      height: saved.height
    }
  }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
}
