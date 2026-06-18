; Custom NSIS steps for Spirebound, included by electron-builder via
; build.nsis.include. After the app's files are laid down, run a headless,
; one-shot setup that:
;   1. installs the STS2MCP mod + its dependencies into the game's mods folder, and
;   2. migrates the player's unmodded save profile into the modded save scope
;      so their progress isn't lost when they choose "Load with Mods".
;
; This delegates to the app itself (Spirebound.exe --spirebound-setup) because
; the Steam-library scan and the safe save copy live in the app's Node code and
; would be brittle to reimplement in NSIS.
;
; Best-effort by design: we ExecWait but do not check the exit code, and the
; setup process always exits 0. If the game/Steam isn't installed yet, or the
; mods folder needs elevation we don't have, this is a no-op and the in-app
; "Install bundled mod" button remains as the fallback.

!macro customInstall
  DetailPrint "Setting up the Slay the Spire 2 mod and migrating saves..."
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --spirebound-setup'
!macroend
