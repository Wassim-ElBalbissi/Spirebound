import { app } from 'electron'
import { join } from 'path'
import pino from 'pino'

const logDir = app.isPackaged
  ? join(app.getPath('userData'), 'logs')
  : join(process.cwd(), 'logs')

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? (app.isPackaged ? 'info' : 'debug'),
  transport: app.isPackaged
    ? {
        target: 'pino/file',
        options: { destination: join(logDir, 'overlay.log'), mkdir: true }
      }
    : undefined
})
