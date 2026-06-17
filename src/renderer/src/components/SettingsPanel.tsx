import React from 'react'
import type { UserSettings } from '../../../main/types/settings'
import type { CalibrationSource } from '../../../main/types/recommendation'

export interface SettingsPanelProps {
  settings: UserSettings
  onChange: (partial: Partial<UserSettings>) => void
  onClose: () => void
  calibrationSource?: CalibrationSource
}

export function SettingsPanel({
  settings,
  onChange,
  onClose,
  calibrationSource = 'heuristic'
}: SettingsPanelProps): React.JSX.Element {
  const modProvidesPositions = calibrationSource === 'mod'
  const [advancedOpen, setAdvancedOpen] = React.useState(
    !modProvidesPositions && !!settings.calibration
  )
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Settings
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-700/40"
        >
          Done
        </button>
      </div>

      <SliderRow
        label="UI scale"
        value={settings.uiScale}
        min={0.75}
        max={1.5}
        step={0.05}
        format={(n) => `${Math.round(n * 100)}%`}
        onChange={(uiScale) => onChange({ uiScale })}
      />

      <SliderRow
        label="Background opacity"
        value={settings.opacity}
        min={0.4}
        max={1.0}
        step={0.05}
        format={(n) => `${Math.round(n * 100)}%`}
        onChange={(opacity) => onChange({ opacity })}
      />

      <div className="border-t border-zinc-700/40 pt-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Hand badges
          </div>
          <CalibrationSourcePill source={calibrationSource} />
        </div>
        <div className="mt-1 text-[10px] leading-snug text-zinc-500">
          {modProvidesPositions
            ? 'The mod is reporting card pixel positions directly — no calibration needed.'
            : 'Per-card badges above the in-game hand. Install the Spirebound STS2MCP fork for pixel-perfect auto-positioning.'}
        </div>
      </div>

      <ToggleRow
        label="Show per-card badges"
        value={settings.showPerCardBadges}
        onChange={(showPerCardBadges) => onChange({ showPerCardBadges })}
      />

      <div className="border-t border-zinc-700/40 pt-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Combat
        </div>
        <ToggleRow
          label="Adjust intents for Weak / Strength"
          value={settings.applyIntentModifiers}
          onChange={(applyIntentModifiers) =>
            onChange({ applyIntentModifiers })
          }
        />
        <div className="mt-1 text-[10px] leading-snug text-zinc-500">
          Experimental. The mod usually shows the final intent number already —
          enable only if intent damage looks too low against Weak / Strength
          enemies.
        </div>
      </div>

      {!modProvidesPositions && (
        <div className="rounded-md border border-zinc-700/40 bg-zinc-800/30">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-700/30"
          >
            <span>Advanced calibration</span>
            <span className="text-zinc-500">{advancedOpen ? '▾' : '▸'}</span>
          </button>
          {advancedOpen && (
            <div className="flex flex-col gap-3 px-2 pb-2 pt-1">
              <SliderRow
                label="Vertical offset"
                value={settings.verticalOffsetPct}
                min={-25}
                max={25}
                step={0.5}
                format={(n) => `${n.toFixed(1)}%`}
                onChange={(verticalOffsetPct) => onChange({ verticalOffsetPct })}
              />

              <SliderRow
                label="Horizontal stretch"
                value={settings.horizontalStretchPct}
                min={-30}
                max={30}
                step={1}
                format={(n) => `${n.toFixed(0)}%`}
                onChange={(horizontalStretchPct) =>
                  onChange({ horizontalStretchPct })
                }
              />

              <ToggleRow
                label="Show calibration grid"
                value={settings.showCalibrationGrid}
                onChange={(showCalibrationGrid) =>
                  onChange({ showCalibrationGrid })
                }
              />

              <CalibrationRow
                calibrated={!!settings.calibration}
                capturedAt={settings.calibration?.capturedAt ?? null}
                onClear={() => onChange({ calibration: null })}
              />
            </div>
          )}
        </div>
      )}

      <div className="border-t border-zinc-700/40 pt-2 text-[10px] leading-snug text-zinc-500">
        Ctrl+Alt+S pins the overlay (sky-blue border). Drag the header to
        reposition. Position is saved per monitor.
      </div>
    </div>
  )
}

const SOURCE_LABEL: Record<CalibrationSource, { label: string; color: string }> = {
  mod: { label: 'Mod (auto)', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  manual: { label: 'Manual clicks', color: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  window: { label: 'Window auto', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  heuristic: { label: 'Heuristic', color: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' }
}

function CalibrationSourcePill({
  source
}: {
  source: CalibrationSource
}): React.JSX.Element {
  const { label, color } = SOURCE_LABEL[source]
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${color}`}
      title="Where the current badge positions come from."
    >
      {label}
    </span>
  )
}

function CalibrationRow({
  calibrated,
  capturedAt,
  onClear
}: {
  calibrated: boolean
  capturedAt: number | null
  onClear: () => void
}): React.JSX.Element {
  const [error, setError] = React.useState<string | null>(null)
  const start = async (): Promise<void> => {
    setError(null)
    const res = await window.overlay?.calibrationStart()
    if (res && !res.ok) setError(res.reason ?? 'Could not start calibration.')
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-zinc-700/40 bg-zinc-800/30 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-300">Pixel-accurate calibration</span>
        {calibrated ? (
          <span className="text-[10px] text-emerald-400">Calibrated</span>
        ) : (
          <span className="text-[10px] text-zinc-500">Not calibrated</span>
        )}
      </div>
      <p className="text-[10px] leading-snug text-zinc-500">
        Enter combat, then click Calibrate and follow the prompts — two clicks
        on the centers of your leftmost and rightmost cards. Overrides the
        heuristic estimator.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={start}
          className="rounded-md bg-sky-500/90 px-2 py-1 text-xs font-medium text-white hover:bg-sky-500"
        >
          {calibrated ? 'Re-calibrate' : 'Calibrate'}
        </button>
        {calibrated && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-zinc-700/60 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700/30"
          >
            Clear
          </button>
        )}
      </div>
      {capturedAt && (
        <div className="text-[10px] text-zinc-500">
          Captured {new Date(capturedAt).toLocaleString()}
        </div>
      )}
      {error && <div className="text-[10px] text-rose-400">{error}</div>}
    </div>
  )
}

function ToggleRow({
  label,
  value,
  onChange
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`inline-flex h-4 w-7 items-center rounded-full border ${
          value
            ? 'border-emerald-400 bg-emerald-500/40'
            : 'border-zinc-600 bg-zinc-700/40'
        }`}
      >
        <span
          className={`h-3 w-3 transform rounded-full bg-zinc-100 transition-transform ${
            value ? 'translate-x-3' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (n: number) => string
  onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-xs text-zinc-300">
        <span>{label}</span>
        <span className="font-mono text-zinc-400">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-sky-400"
      />
    </label>
  )
}
