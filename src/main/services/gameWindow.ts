import { spawn } from 'child_process'
import { logger } from './logger'

export interface GameWindowRect {
  x: number
  y: number
  width: number
  height: number
}

interface Cached {
  rect: GameWindowRect | null
  at: number
}

const CACHE_MS = 1000
let cached: Cached = { rect: null, at: 0 }
let inflight: Promise<GameWindowRect | null> | null = null

const PROCESS_NAME = 'SlayTheSpire2'

/**
 * Returns the on-screen rect of the Slay the Spire 2 main window, or null
 * if the game isn't running or its bounds can't be read.
 *
 * Used as a fallback for the heuristic card-slot layout when the SlayOverlay
 * STS2MCP fork isn't installed (i.e. no per-card `pos`). Calls PowerShell
 * once per second; subsequent calls within that window return the cached
 * value with no spawn cost.
 */
export async function detectGameWindow(): Promise<GameWindowRect | null> {
  const now = Date.now()
  if (now - cached.at < CACHE_MS) return cached.rect
  if (inflight) return await inflight

  inflight = readWindowRect().then((rect) => {
    cached = { rect, at: Date.now() }
    inflight = null
    return rect
  })
  return await inflight
}

const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
'@
$p = Get-Process -Name '${PROCESS_NAME}' | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($null -eq $p) { Write-Output 'null'; exit 0 }
$r = New-Object W+RECT
$ok = [W]::GetWindowRect($p.MainWindowHandle, [ref]$r)
if (-not $ok) { Write-Output 'null'; exit 0 }
"{""x"":$($r.L),""y"":$($r.T),""w"":$($r.R - $r.L),""h"":$($r.B - $r.T)}"
`.trim()

function readWindowRect(): Promise<GameWindowRect | null> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let done = false
    const finish = (v: GameWindowRect | null): void => {
      if (done) return
      done = true
      resolve(v)
    }
    let proc
    try {
      proc = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
        { windowsHide: true }
      )
    } catch (err) {
      logger.warn({ err }, 'gameWindow: spawn failed')
      finish(null)
      return
    }
    const timer = setTimeout(() => {
      try { proc?.kill() } catch { /* noop */ }
      finish(null)
    }, 2000)
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('close', () => {
      clearTimeout(timer)
      const txt = stdout.trim()
      if (txt === 'null' || txt === '') return finish(null)
      try {
        const parsed = JSON.parse(txt) as {
          x: number; y: number; w: number; h: number
        }
        if (
          typeof parsed.x !== 'number' || typeof parsed.y !== 'number' ||
          typeof parsed.w !== 'number' || typeof parsed.h !== 'number' ||
          parsed.w <= 0 || parsed.h <= 0
        ) {
          return finish(null)
        }
        finish({ x: parsed.x, y: parsed.y, width: parsed.w, height: parsed.h })
      } catch (err) {
        logger.warn({ err, stdout, stderr }, 'gameWindow: parse failed')
        finish(null)
      }
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      logger.warn({ err }, 'gameWindow: proc error')
      finish(null)
    })
  })
}
