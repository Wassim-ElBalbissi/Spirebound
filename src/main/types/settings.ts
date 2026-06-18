/**
 * Registration status of one global hotkey, surfaced in the Hub settings page
 * so the user can tell whether a shortcut is live or being blocked (held by
 * another app, or by a stale instance).
 */
export interface HotkeyInfo {
  /** Electron accelerator, e.g. 'CmdOrCtrl+Alt+S'. */
  accelerator: string
  /** Human-readable action label. */
  label: string
  /** False when registration failed (the OS refused / something else holds it). */
  registered: boolean
}

export interface UserSettings {
  /** Multiplier applied to root font size. 0.75–1.5. */
  uiScale: number
  /**
   * Adjust enemy intent damage by Weak / Strength in the threat panel.
   * Off by default — the mod's intent label is believed to already show the
   * final post-modifier number, so this would double-count until verified.
   */
  applyIntentModifiers: boolean
  /**
   * Enable the Ctrl+Alt+D "doodle on the map" hotkey, which briefly takes over
   * the mouse to trace a random shape with the in-game pen (hold right-click).
   */
  enableMapDoodles: boolean
}

export const DEFAULT_SETTINGS: UserSettings = {
  uiScale: 1.0,
  applyIntentModifiers: false,
  enableMapDoodles: true
}
