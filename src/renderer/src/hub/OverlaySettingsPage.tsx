import React from 'react'
import { useSettings } from '../hooks/useSettings'

/**
 * Hub settings page. The Hub is where all overlay configuration lives (the
 * in-game HUD itself has no chrome), so this surfaces every UserSettings field:
 * overlay appearance, combat behaviour, and the map-doodle hotkey.
 */
export function OverlaySettingsPage(): React.JSX.Element {
  const { settings, set } = useSettings()

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-50">
            Settings
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Tune the live in-game overlay. Changes apply instantly while you
            play.
          </p>
        </header>

        <Section
          title="Overlay appearance"
          hint="Affects the on-screen HUD that floats over Slay the Spire 2."
        >
          <SliderRow
            label="UI scale"
            value={settings.uiScale}
            min={0.75}
            max={1.5}
            step={0.05}
            format={(n) => `${Math.round(n * 100)}%`}
            onChange={(uiScale) => set({ uiScale })}
          />
        </Section>

        <Section title="Combat">
          <ToggleRow
            label="Adjust intents for Weak / Strength"
            hint="Experimental. The mod usually shows the final intent number already — enable only if intent damage looks too low against Weak / Strength enemies."
            value={settings.applyIntentModifiers}
            onChange={(applyIntentModifiers) => set({ applyIntentModifiers })}
          />
        </Section>

        <Section title="Map doodles">
          <ToggleRow
            label="Enable doodle hotkey"
            hint={
              <>
                Press <Kbd>Ctrl</Kbd>+<Kbd>Alt</Kbd>+<Kbd>D</Kbd> on the map to
                doodle a random shape — the app briefly takes over the mouse and
                draws by holding right-click. Move the mouse to resume control.
              </>
            }
            value={settings.enableMapDoodles}
            onChange={(enableMapDoodles) => set({ enableMapDoodles })}
          />
        </Section>

        <HotkeysCard />
      </div>
    </div>
  )
}

function Section({
  title,
  hint,
  children,
  collapsible = false,
  open = true,
  onToggle
}: {
  title: string
  hint?: React.ReactNode
  children: React.ReactNode
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
}): React.JSX.Element {
  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-surface-800 bg-surface-900">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-2 px-5 py-3.5 text-left hover:bg-surface-800/40"
        >
          <span className="text-sm font-semibold text-zinc-100">{title}</span>
          <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
        </button>
      ) : (
        <div className="px-5 pb-1 pt-4">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        </div>
      )}
      {open && (
        <div className="flex flex-col gap-4 px-5 pb-5 pt-2">
          {hint && (
            <p className="-mt-1 text-xs leading-snug text-zinc-500">{hint}</p>
          )}
          {children}
        </div>
      )}
    </section>
  )
}

function ToggleRow({
  label,
  hint,
  value,
  onChange
}: {
  label: string
  hint?: React.ReactNode
  value: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm text-zinc-200">{label}</div>
        {hint && (
          <p className="mt-0.5 text-xs leading-snug text-zinc-500">{hint}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
          value
            ? 'border-emerald-400 bg-emerald-500/40'
            : 'border-surface-700 bg-surface-800'
        }`}
      >
        <span
          className={`h-4 w-4 transform rounded-full bg-zinc-100 transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
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
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-sm text-zinc-200">
        <span>{label}</span>
        <span className="font-mono text-xs text-zinc-400">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-400"
      />
    </label>
  )
}

/**
 * Live global-hotkey status. Registration can fail when another app — or a
 * leftover Spirebound instance — already holds the combo, so we show whether
 * each shortcut is actually bound rather than just listing them.
 */
type HotkeyRow = { accelerator: string; label: string; registered: boolean }
type HotkeysState = 'loading' | 'error' | HotkeyRow[]

function HotkeysCard(): React.JSX.Element {
  const [state, setState] = React.useState<HotkeysState>('loading')

  React.useEffect(() => {
    let alive = true
    const api = window.overlay
    // Old/foreground builds may not expose getHotkeys yet; don't hang forever.
    if (!api?.getHotkeys) {
      setState('error')
      return
    }
    // Safety net: if the IPC call never settles, fall back to an error state
    // rather than an endless "Loading…".
    const timer = window.setTimeout(() => {
      if (alive) setState((s) => (s === 'loading' ? 'error' : s))
    }, 4000)
    api
      .getHotkeys()
      .then((hk) => {
        if (alive) setState(hk)
      })
      .catch(() => {
        if (alive) setState('error')
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [])

  const hotkeys = Array.isArray(state) ? state : null
  const anyBlocked = !!hotkeys?.some((h) => !h.registered)

  return (
    <div className="mt-6 rounded-xl border border-surface-800 bg-surface-900/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-300">Global hotkeys</span>
        {hotkeys && (
          <span
            className={`text-[11px] font-medium ${
              anyBlocked ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {anyBlocked ? 'Some unavailable' : 'All active'}
          </span>
        )}
      </div>

      {state === 'error' ? (
        <p className="mt-3 text-xs leading-snug text-zinc-500">
          Couldn't read hotkey status. Restart Spirebound — the shortcuts are{' '}
          <span className="text-zinc-400">Ctrl+Alt+S</span> (pin overlay),{' '}
          <span className="text-zinc-400">Ctrl+Alt+B</span> (open Hub) and{' '}
          <span className="text-zinc-400">Ctrl+Alt+D</span> (doodle).
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {(hotkeys ?? []).map((h) => (
            <li
              key={h.accelerator}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-1.5 text-xs text-zinc-300">
                {accelToKeys(h.accelerator).map((k, i) => (
                  <React.Fragment key={k}>
                    {i > 0 && <span className="text-zinc-600">+</span>}
                    <Kbd>{k}</Kbd>
                  </React.Fragment>
                ))}
                <span className="ml-1.5 text-zinc-400">{h.label}</span>
              </span>
              <span
                className={`shrink-0 text-[11px] font-medium ${
                  h.registered ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {h.registered ? '● Active' : '● Unavailable'}
              </span>
            </li>
          ))}
          {state === 'loading' && (
            <li className="text-xs text-zinc-500">Loading…</li>
          )}
        </ul>
      )}

      {anyBlocked && (
        <p className="mt-3 text-xs leading-snug text-amber-400/80">
          A shortcut couldn't be registered — it's held by another app or a
          leftover Spirebound process. Close other instances (or the conflicting
          app) and reopen Spirebound.
        </p>
      )}
    </div>
  )
}

/** 'CmdOrCtrl+Alt+S' → ['Ctrl', 'Alt', 'S'] for display (Windows-flavoured). */
function accelToKeys(accelerator: string): string[] {
  return accelerator.split('+').map((k) => (k === 'CmdOrCtrl' ? 'Ctrl' : k))
}

function Kbd({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <kbd className="rounded border border-surface-700 bg-surface-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
      {children}
    </kbd>
  )
}
