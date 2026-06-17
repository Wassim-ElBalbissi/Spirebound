import { Menu, MenuItemConstructorOptions, Tray, nativeImage, shell } from 'electron'
import type { OverlayWindowHandle } from './overlayWindow'

const STS2MCP_RELEASES_URL =
  'https://github.com/Gennadiyev/STS2MCP/releases/latest'

export interface TrayContext {
  /** Absent while the in-game overlay is paused ("coming soon"). */
  overlay?: OverlayWindowHandle
  onOpenHub?: () => void
  onQuit: () => void
}

let tray: Tray | null = null

export function createTray(ctx: TrayContext): Tray {
  // 16×16 transparent dot — placeholder icon. A bundled .ico can replace this
  // once we have art assets.
  const image = nativeImage.createEmpty()
  tray = new Tray(image)
  tray.setToolTip('Spirebound')
  refreshMenu(ctx)
  return tray
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
