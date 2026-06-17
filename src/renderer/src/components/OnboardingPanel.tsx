import React from 'react'

const STS2MCP_REPO_URL = 'https://github.com/Gennadiyev/STS2MCP'

export interface OnboardingPanelProps {
  errorMessage?: string
}

export function OnboardingPanel({
  errorMessage
}: OnboardingPanelProps): React.JSX.Element {
  const [installing, setInstalling] = React.useState(false)
  const [result, setResult] = React.useState<{
    ok: boolean
    text: string
  } | null>(null)

  const installBundled = async (): Promise<void> => {
    setInstalling(true)
    setResult(null)
    const r = await window.overlay?.installBundledMod()
    setInstalling(false)
    if (!r) {
      setResult({ ok: false, text: 'Install handler did not respond.' })
      return
    }
    setResult(
      r.ok
        ? {
            ok: true,
            text: `Installed to ${r.installedTo}. Launch Slay the Spire 2 and choose Load with Mods.`
          }
        : { ok: false, text: r.reason ?? 'Install failed.' }
    )
  }

  const openReleases = (): void => {
    void window.overlay?.openModInstall()
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4 text-sm text-zinc-200">
      <div>
        <div className="text-base font-semibold text-zinc-100">
          STS2MCP not detected
        </div>
        <div className="mt-1 text-xs text-zinc-400">
          The overlay reads run state from a small mod that exposes the game's
          state on{' '}
          <span className="font-mono text-zinc-300">localhost:15526</span>. The
          Spirebound build also emits hand-card pixel positions for
          auto-calibration — no clicks required.
        </div>
      </div>

      <button
        type="button"
        onClick={() => void installBundled()}
        disabled={installing}
        className="self-start rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-emerald-500 disabled:opacity-60"
      >
        {installing ? 'Installing…' : 'Install bundled mod'}
      </button>

      {result && (
        <div
          className={`rounded-md border px-2 py-1.5 text-[11px] ${
            result.ok
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          }`}
        >
          {result.text}
        </div>
      )}

      <div className="text-[10px] text-zinc-500">
        Already running a different STS2MCP build? You can also{' '}
        <a
          href={STS2MCP_REPO_URL}
          onClick={(e) => {
            e.preventDefault()
            openReleases()
          }}
          className="text-sky-400 underline"
        >
          download upstream STS2MCP
        </a>
        {' '}— positioning will fall back to a window-bounds heuristic in that
        case.
      </div>

      {errorMessage && (
        <div className="mt-auto text-[10px] font-mono text-zinc-500">
          {errorMessage}
        </div>
      )}
    </div>
  )
}
