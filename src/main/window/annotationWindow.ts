import { BrowserWindow, screen } from 'electron'

export interface AnnotationWindowOptions {
  preloadPath: string
  rendererUrl?: string
  rendererFile?: string
}

export interface AnnotationWindowHandle {
  win: BrowserWindow
  reposition(): void
  setInteractive(interactive: boolean): void
}

/**
 * Fullscreen transparent click-through window used to paint per-card badges
 * directly above the in-game card row. Different from the corner overlay:
 *
 * - Never interactive (no hover-to-activate, no pin).
 * - Always sized to the work area of the primary display.
 * - Tracks `display-metrics-changed` so resolution changes don't desync.
 */
export function createAnnotationWindow(
  opts: AnnotationWindowOptions
): AnnotationWindowHandle {
  const display = screen.getPrimaryDisplay()
  const { workArea } = display

  const win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    fullscreenable: false,
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

  // 'screen-saver' floats above borderless-fullscreen STS2 on Windows.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Never accept clicks — pure overlay. `forward: false` because we have no
  // hover state to trigger; the renderer must paint nothing interactive.
  win.setIgnoreMouseEvents(true, { forward: false })

  win.once('ready-to-show', () => win.show())

  if (opts.rendererUrl) {
    void win.loadURL(`${opts.rendererUrl}/annotations.html`)
  } else if (opts.rendererFile) {
    void win.loadFile(opts.rendererFile)
  }

  const reposition = (): void => {
    if (win.isDestroyed()) return
    const primary = screen.getPrimaryDisplay()
    const wa = primary.workArea
    win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height })
  }

  screen.on('display-metrics-changed', reposition)
  win.on('closed', () => {
    screen.removeListener('display-metrics-changed', reposition)
  })

  return {
    win,
    reposition,
    setInteractive(interactive: boolean) {
      if (interactive) {
        win.setIgnoreMouseEvents(false)
        win.setFocusable(true)
        win.focus()
      } else {
        win.setIgnoreMouseEvents(true, { forward: false })
        win.setFocusable(false)
      }
    }
  }
}
