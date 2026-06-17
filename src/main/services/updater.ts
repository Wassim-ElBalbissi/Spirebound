import { app, dialog } from 'electron'
import electronUpdater from 'electron-updater'
import { logger } from './logger'

const { autoUpdater } = electronUpdater

/**
 * Checks GitHub Releases for a newer version on launch and, when one is
 * downloaded, offers to restart into it — so users get updates without
 * reinstalling. No-ops in dev (only meaningful for packaged builds).
 */
export function initAutoUpdate(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) =>
    logger.warn({ err: String(err) }, 'auto-update error')
  )
  autoUpdater.on('update-available', (info) =>
    logger.info({ version: info.version }, 'update available')
  )
  autoUpdater.on('update-downloaded', async (info) => {
    const res = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Spirebound ${info.version} is ready to install.`,
      detail: 'Restart to apply the update. It will also install automatically next time you quit.'
    })
    if (res.response === 0) autoUpdater.quitAndInstall()
  })

  autoUpdater
    .checkForUpdatesAndNotify()
    .catch((err) => logger.warn({ err: String(err) }, 'update check failed'))
}
