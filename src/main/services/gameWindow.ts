import { spawn } from 'child_process'
import { logger } from './logger'

export interface GameWindowRect {
  x: number
  y: number
  width: number
  height: number
}

export interface GameWindowInfo {
  /** On-screen rect of the game's main window, or null if not running. */
  rect: GameWindowRect | null
  /** True when the game's window is the active (foreground) window. */
  foreground: boolean
}

interface Cached {
  info: GameWindowInfo
  at: number
}

const CACHE_MS = 1000
let cached: Cached = { info: { rect: null, foreground: false }, at: 0 }
let inflight: Promise<GameWindowInfo> | null = null

const PROCESS_NAME = 'SlayTheSpire2'

/**
 * Returns the game window rect plus whether it's the foreground window.
 * Calls PowerShell at most once per second; subsequent calls within that
 * window return the cached value with no spawn cost.
 */
export async function detectGame(): Promise<GameWindowInfo> {
  const now = Date.now()
  if (now - cached.at < CACHE_MS) return cached.info
  if (inflight) return await inflight

  inflight = readGame().then((info) => {
    cached = { info, at: Date.now() }
    inflight = null
    return info
  })
  return await inflight
}

/**
 * Returns the on-screen rect of the Slay the Spire 2 main window, or null
 * if the game isn't running or its bounds can't be read.
 *
 * Used as a fallback for the heuristic card-slot layout when the Spirebound
 * STS2MCP fork isn't installed (i.e. no per-card `pos`).
 */
export async function detectGameWindow(): Promise<GameWindowRect | null> {
  return (await detectGame()).rect
}

const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
'@
$p = Get-Process -Name '${PROCESS_NAME}' | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($null -eq $p) { Write-Output '{"fg":false}'; exit 0 }
$fgh = [W]::GetForegroundWindow()
$fgpid = 0
[void][W]::GetWindowThreadProcessId($fgh, [ref]$fgpid)
$fgStr = if ($fgpid -eq $p.Id) { 'true' } else { 'false' }
$r = New-Object W+RECT
$ok = [W]::GetWindowRect($p.MainWindowHandle, [ref]$r)
if (-not $ok) { Write-Output "{""fg"":$fgStr}"; exit 0 }
"{""x"":$($r.L),""y"":$($r.T),""w"":$($r.R - $r.L),""h"":$($r.B - $r.T),""fg"":$fgStr}"
`.trim()

const NONE: GameWindowInfo = { rect: null, foreground: false }

function readGame(): Promise<GameWindowInfo> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let done = false
    const finish = (v: GameWindowInfo): void => {
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
      finish(NONE)
      return
    }
    const timer = setTimeout(() => {
      try { proc?.kill() } catch { /* noop */ }
      finish(NONE)
    }, 2000)
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('close', () => {
      clearTimeout(timer)
      const txt = stdout.trim()
      if (txt === '' || txt === 'null') return finish(NONE)
      try {
        const parsed = JSON.parse(txt) as {
          x?: number; y?: number; w?: number; h?: number; fg?: boolean
        }
        const foreground = parsed.fg === true
        if (
          typeof parsed.x !== 'number' || typeof parsed.y !== 'number' ||
          typeof parsed.w !== 'number' || typeof parsed.h !== 'number' ||
          parsed.w <= 0 || parsed.h <= 0
        ) {
          // Game running but rect unreadable — still report foreground.
          return finish({ rect: null, foreground })
        }
        finish({
          rect: { x: parsed.x, y: parsed.y, width: parsed.w, height: parsed.h },
          foreground
        })
      } catch (err) {
        logger.warn({ err, stdout, stderr }, 'gameWindow: parse failed')
        finish(NONE)
      }
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      logger.warn({ err }, 'gameWindow: proc error')
      finish(NONE)
    })
  })
}
