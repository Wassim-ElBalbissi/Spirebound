import { app, net, protocol } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import { logger } from './logger'

/**
 * Disk-backed image cache exposed as a custom `simg://` scheme. The renderer
 * loads `simg://host/path` instead of `https://host/path`; the first request
 * fetches + saves to userData, every request after is served from disk — so
 * card/relic art isn't re-downloaded on every view or restart.
 */
const SCHEME = 'simg'

function mime(ext: string): string {
  const e = ext.toLowerCase()
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg'
  if (e === '.webp') return 'image/webp'
  if (e === '.gif') return 'image/gif'
  return 'image/png'
}

/** Must run before `app.ready`. */
export function registerImageCacheScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true }
    }
  ])
}

/** Must run after `app.ready`. */
export function registerImageCacheProtocol(): void {
  const dir = join(app.getPath('userData'), 'img-cache')
  mkdirSync(dir, { recursive: true })

  protocol.handle(SCHEME, async (request) => {
    const remote = 'https://' + request.url.slice(`${SCHEME}://`.length)
    let ext = '.png'
    try {
      ext = extname(new URL(remote).pathname) || '.png'
    } catch {
      /* keep default */
    }
    const key = createHash('sha1').update(remote).digest('hex') + ext
    const file = join(dir, key)

    if (existsSync(file)) {
      return new Response(readFileSync(file), {
        headers: { 'content-type': mime(ext), 'cache-control': 'max-age=31536000' }
      })
    }

    try {
      const res = await net.fetch(remote)
      if (!res.ok) return new Response('', { status: res.status })
      const buf = Buffer.from(await res.arrayBuffer())
      writeFileSync(file, buf)
      return new Response(buf, {
        headers: {
          'content-type': res.headers.get('content-type') ?? mime(ext),
          'cache-control': 'max-age=31536000'
        }
      })
    } catch (err) {
      logger.warn({ err, remote }, 'image cache fetch failed')
      return new Response('', { status: 502 })
    }
  })
}
