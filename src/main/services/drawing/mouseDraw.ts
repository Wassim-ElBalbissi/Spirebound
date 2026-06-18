/**
 * Drives the OS mouse to trace pixel polylines as the in-game pen. Reuses the
 * PowerShell P/Invoke approach from gameWindow.ts (no native module) so there
 * is nothing to rebuild against Electron and no packaging changes.
 *
 * Uses Win32 SendInput (not SetCursorPos / mouse_event): SetCursorPos only
 * teleports the cursor and emits no motion input, so a game reading the mouse
 * via Raw Input never sees a "drag" and draws nothing. SendInput with
 * MOUSEEVENTF_MOVE|ABSOLUTE injects real motion events the game samples as a
 * continuous stroke.
 *
 * One PowerShell process per draw: capture the cursor, trace each stroke with
 * the right button held (StS2's "hold right click to draw" gesture), restore
 * the cursor. The script is fed via stdin (`-Command -`) so a few hundred
 * densified points never hit the command-line length limit.
 */
import { spawn } from 'child_process'
import { logger } from '../logger'
import type { Point } from './shapes'
import { buildDrawScript } from './drawScript'

const DRAW_TIMEOUT_MS = 20000

let drawing = false

export function isDrawing(): boolean {
  return drawing
}

/**
 * Trace `strokes` (virtual-screen pixel polylines) with the right mouse
 * button held. Ignores re-triggers while a draw is already in flight.
 * Resolves true when the draw completed cleanly.
 */
export async function drawStrokes(strokes: Point[][]): Promise<boolean> {
  if (drawing) {
    logger.info('mouseDraw: already drawing, ignoring re-trigger')
    return false
  }
  const valid = strokes.filter((s) => s.length > 0)
  if (valid.length === 0) return false
  drawing = true
  try {
    return await runPowershell(buildDrawScript(valid))
  } finally {
    drawing = false
  }
}

function runPowershell(script: string): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const finish = (ok: boolean): void => {
      if (done) return
      done = true
      resolve(ok)
    }
    let proc
    try {
      proc = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', '-'],
        { windowsHide: true }
      )
    } catch (err) {
      logger.warn({ err }, 'mouseDraw: spawn failed')
      finish(false)
      return
    }
    const timer = setTimeout(() => {
      try { proc?.kill() } catch { /* noop */ }
      finish(false)
    }, DRAW_TIMEOUT_MS)
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        logger.warn({ code, stderr }, 'mouseDraw: powershell exited non-zero')
      }
      finish(code === 0)
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      logger.warn({ err }, 'mouseDraw: proc error')
      finish(false)
    })
    try {
      proc.stdin.write(script)
      proc.stdin.end()
    } catch (err) {
      clearTimeout(timer)
      logger.warn({ err }, 'mouseDraw: stdin write failed')
      finish(false)
    }
  })
}
