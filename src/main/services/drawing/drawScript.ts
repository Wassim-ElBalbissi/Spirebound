/**
 * Builds the PowerShell script that traces pixel polylines with the right
 * mouse button held, via Win32 SendInput. Shared by the live hotkey
 * (mouseDraw.ts) and the standalone `npm run draw:probe` test so both exercise
 * the exact same input path.
 *
 * SendInput is used (not SetCursorPos / mouse_event) because only SendInput
 * with MOUSEEVENTF_MOVE|ABSOLUTE injects real motion events; a game reading the
 * mouse via Raw Input ignores SetCursorPos teleports and so draws nothing.
 */
import type { Point } from './shapes'

/** The interop + draw loop. Expects `$strokes` (array of flat int arrays). */
export const DRAW_PREAMBLE = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SI {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {
    public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public MOUSEINPUT mi; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] p, int cb);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  public const uint MOVE = 0x0001, ABSOLUTE = 0x8000, VIRTUALDESK = 0x4000, RDOWN = 0x0008, RUP = 0x0010;
  static int VX = GetSystemMetrics(76); // SM_XVIRTUALSCREEN
  static int VY = GetSystemMetrics(77); // SM_YVIRTUALSCREEN
  static int VW = GetSystemMetrics(78); // SM_CXVIRTUALSCREEN
  static int VH = GetSystemMetrics(79); // SM_CYVIRTUALSCREEN
  static void Send(uint flags, int ax, int ay) {
    INPUT[] inp = new INPUT[1];
    inp[0].type = 0; // INPUT_MOUSE
    inp[0].mi.dx = ax; inp[0].mi.dy = ay; inp[0].mi.dwFlags = flags;
    SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
  }
  // Move the cursor to a screen pixel (mapped to 0..65535 virtual-desktop space).
  public static void MoveTo(int px, int py) {
    int ax = (int)Math.Round((px - VX) * 65535.0 / Math.Max(1, VW - 1));
    int ay = (int)Math.Round((py - VY) * 65535.0 / Math.Max(1, VH - 1));
    Send(MOVE | ABSOLUTE | VIRTUALDESK, ax, ay);
  }
  public static void Down() { Send(RDOWN, 0, 0); }
  public static void Up() { Send(RUP, 0, 0); }
  public static POINT Cursor() { POINT p; GetCursorPos(out p); return p; }
}
"@
$orig = [SI]::Cursor()
foreach ($s in $strokes) {
  [SI]::MoveTo([int]$s[0], [int]$s[1]); Start-Sleep -Milliseconds 20
  [SI]::Down(); Start-Sleep -Milliseconds 30
  for ($i = 2; $i -lt $s.Length; $i += 2) {
    [SI]::MoveTo([int]$s[$i], [int]$s[$i + 1]); Start-Sleep -Milliseconds 6
  }
  Start-Sleep -Milliseconds 15
  [SI]::Up(); Start-Sleep -Milliseconds 60
}
[SI]::MoveTo([int]$orig.X, [int]$orig.Y)
`.trim()

/** Encode strokes as a PowerShell array-of-arrays literal (`,@(x,y,...)`). */
export function strokesToPowershellArray(strokes: Point[][]): string {
  const data = strokes
    .map((s) => '  ,@(' + s.map((p) => `${p.x},${p.y}`).join(',') + ')')
    .join('\n')
  return `$strokes = @(\n${data}\n)`
}

/** Full script: stroke data + the SendInput draw loop. */
export function buildDrawScript(strokes: Point[][]): string {
  return `${strokesToPowershellArray(strokes)}\n${DRAW_PREAMBLE}`
}
