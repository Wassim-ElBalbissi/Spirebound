/*
 * Standalone draw probe — verifies the OS-level mouse drawing path (Win32
 * SendInput) WITHOUT the Electron app, the global hotkey, or game detection.
 *
 *   npm run draw:probe            # draws a star in a centered box on the primary display
 *   npm run draw:probe -- heart   # pick a shape: heart | star | smiley | ghost | cat
 *
 * After a 4-second countdown it traces the shape by holding the right mouse
 * button. Switch to MS Paint (or the StS2 map) during the countdown to watch.
 * If it draws in Paint but NOT on the game map, the game is filtering injected
 * input; if it doesn't draw in Paint either, the input path itself is broken.
 *
 * This compiles the TS shape/engine modules on the fly via tsx-free dynamic
 * import of the built output, falling back to inlined geometry so it runs even
 * before `npm run build`.
 */
import { spawnSync } from 'node:child_process'

// --- Minimal inlined copy of the shape + engine geometry (keep in sync with
// src/main/services/drawing). Standalone so the probe needs no build step. ---

function arc(cx, cy, r, a0, a1, seg) {
  const pts = []
  for (let i = 0; i <= seg; i++) {
    const deg = a0 + ((a1 - a0) * i) / seg
    const rad = (deg * Math.PI) / 180
    pts.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) })
  }
  return pts
}
const circle = (cx, cy, r, seg = 32) => arc(cx, cy, r, 0, 360, seg)

function star() {
  const order = [0, 2, 4, 1, 3, 0]
  return [
    order.map((k) => {
      const rad = ((-90 + 72 * k) * Math.PI) / 180
      return { x: 0.5 + 0.48 * Math.cos(rad), y: 0.5 + 0.48 * Math.sin(rad) }
    })
  ]
}
function heart() {
  const raw = []
  for (let i = 0; i <= 90; i++) {
    const t = (i / 90) * Math.PI * 2
    raw.push({
      x: 16 * Math.sin(t) ** 3,
      y:
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t)
    })
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of raw) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  const w = maxX - minX, h = maxY - minY, span = 0.88
  const sc = span / Math.max(w, h)
  return [
    raw.map((p) => ({
      x: 0.06 + (span - w * sc) / 2 + (p.x - minX) * sc,
      y: 1 - (0.06 + (span - h * sc) / 2 + (p.y - minY) * sc)
    }))
  ]
}
const smiley = () => [
  circle(0.5, 0.5, 0.46, 48),
  circle(0.37, 0.4, 0.05, 14),
  circle(0.63, 0.4, 0.05, 14),
  arc(0.5, 0.52, 0.26, 25, 155, 24)
]
const SHAPES = { star, heart, smiley }

function densify(points, maxStep = 5) {
  if (points.length < 2) return points
  const out = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.max(1, Math.ceil(dist / maxStep))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

// --- Region: a centered square on the primary display (read via PowerShell) ---
function primaryRect() {
  const out = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    'Add-Type -AssemblyName System.Windows.Forms; ' +
      '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ' +
      '"$($b.X),$($b.Y),$($b.Width),$($b.Height)"'
  ], { encoding: 'utf8' })
  const [x, y, w, h] = (out.stdout || '0,0,1920,1080').trim().split(',').map(Number)
  return { x, y, width: w, height: h }
}

const name = (process.argv[2] || 'star').toLowerCase()
const shapeFn = SHAPES[name] || star
const base = primaryRect()
const side = Math.min(base.width, base.height) * 0.42
const region = {
  x: Math.round(base.x + base.width / 2 - side / 2),
  y: Math.round(base.y + base.height * 0.56 - side / 2),
  width: Math.round(side),
  height: Math.round(side)
}

const strokes = shapeFn().map((stroke) =>
  densify(stroke.map((p) => ({
    x: region.x + p.x * region.width,
    y: region.y + p.y * region.height
  }))).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
)

const arrayLit =
  '$strokes = @(\n' +
  strokes.map((s) => '  ,@(' + s.map((p) => `${p.x},${p.y}`).join(',') + ')').join('\n') +
  '\n)'

const PREAMBLE = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SI {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public MOUSEINPUT mi; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] p, int cb);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  public const uint MOVE=0x0001, ABSOLUTE=0x8000, VIRTUALDESK=0x4000, RDOWN=0x0008, RUP=0x0010;
  static int VX=GetSystemMetrics(76), VY=GetSystemMetrics(77), VW=GetSystemMetrics(78), VH=GetSystemMetrics(79);
  static void Send(uint f,int ax,int ay){ INPUT[] i=new INPUT[1]; i[0].type=0; i[0].mi.dx=ax; i[0].mi.dy=ay; i[0].mi.dwFlags=f; SendInput(1,i,Marshal.SizeOf(typeof(INPUT))); }
  public static void MoveTo(int px,int py){ int ax=(int)Math.Round((px-VX)*65535.0/Math.Max(1,VW-1)); int ay=(int)Math.Round((py-VY)*65535.0/Math.Max(1,VH-1)); Send(MOVE|ABSOLUTE|VIRTUALDESK,ax,ay); }
  public static void Down(){ Send(RDOWN,0,0); }
  public static void Up(){ Send(RUP,0,0); }
  public static POINT Cursor(){ POINT p; GetCursorPos(out p); return p; }
}
"@
Write-Host "Drawing '${name}' in 4 seconds — switch to MS Paint or the StS2 map now..."
Start-Sleep -Seconds 4
$orig = [SI]::Cursor()
foreach ($s in $strokes) {
  [SI]::MoveTo([int]$s[0], [int]$s[1]); Start-Sleep -Milliseconds 20
  [SI]::Down(); Start-Sleep -Milliseconds 30
  for ($i = 2; $i -lt $s.Length; $i += 2) { [SI]::MoveTo([int]$s[$i], [int]$s[$i+1]); Start-Sleep -Milliseconds 6 }
  Start-Sleep -Milliseconds 15
  [SI]::Up(); Start-Sleep -Milliseconds 60
}
[SI]::MoveTo([int]$orig.X, [int]$orig.Y)
Write-Host "Done."
`

const script = `${arrayLit}\n${PREAMBLE}`
const res = spawnSync('powershell.exe',
  ['-NoProfile', '-NonInteractive', '-Command', '-'],
  { input: script, stdio: ['pipe', 'inherit', 'inherit'] })
process.exit(res.status ?? 0)
