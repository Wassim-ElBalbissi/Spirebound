import { Menu, MenuItemConstructorOptions, Tray, nativeImage, shell } from 'electron'
import type { OverlayWindowHandle } from './overlayWindow'

const STS2MCP_RELEASES_URL =
  'https://github.com/Gennadiyev/STS2MCP/releases/latest'

export interface TrayContext {
  /** Absent while the in-game overlay is paused ("coming soon"). */
  overlay?: OverlayWindowHandle
  onOpenHub?: () => void
  onQuit: () => void
  /** Absolute path to the tray icon PNG; falls back to an empty image. */
  iconPath?: string
}

let tray: Tray | null = null

export function createTray(ctx: TrayContext): Tray {
  tray = new Tray(resolveTrayImage(ctx.iconPath))
  tray.setToolTip('Spirebound')
  refreshMenu(ctx)
  return tray
}

/**
 * Build the tray image from the app icon. Windows renders tray icons at 16×16
 * (logical), so a full-size app icon is resized rather than cropped. Falls back
 * to an empty image when the path is missing or unreadable, so the tray still
 * exists (just invisible) instead of throwing.
 */
function resolveTrayImage(iconPath?: string): Electron.NativeImage {
  if (iconPath) {
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 })
  }
  return nativeImage.createEmpty()
}

export function refreshMenu(ctx: TrayContext): void {
  if (!tray) return
  const items: MenuItemConstructorOptions[] = [
    {
      label: 'Open Browser (Ctrl+Alt+B)',
      click: () => ctx.onOpenHub?.()
    }
  ]

  const overlay = ctx.overlay
  if (overlay) {
    items.unshift(
      {
        label: overlay.isPinned() ? 'Unpin overlay' : 'Pin overlay (Ctrl+Alt+S)',
        click: () => {
          overlay.setPinned(!overlay.isPinned())
          refreshMenu(ctx)
        }
      },
      {
        label: 'Show overlay',
        click: () => {
          overlay.win.show()
          overlay.win.focus()
        }
      }
    )
    items.push(
      { type: 'separator' },
      {
        label: 'Install STS2MCP…',
        click: () => {
          void shell.openExternal(STS2MCP_RELEASES_URL)
        }
      }
    )
  }

  items.push({ type: 'separator' }, { label: 'Quit', click: ctx.onQuit })
  tray.setContextMenu(Menu.buildFromTemplate(items))
}
