import React from 'react'
import type {
  MapPathResultView,
  MapStepView
} from '../../../main/types/recommendation'
import type { RoomKind } from '../../../main/types/gameState'

const ROOM_META: Record<RoomKind, { icon: string; label: string; color: string }> = {
  monster: { icon: '👹', label: 'Enemy', color: 'text-zinc-200' },
  elite: { icon: '💀', label: 'Elite', color: 'text-rose-300' },
  rest: { icon: '🔥', label: 'Rest', color: 'text-orange-300' },
  shop: { icon: '🛒', label: 'Merchant', color: 'text-yellow-300' },
  treasure: { icon: '📦', label: 'Treasure', color: 'text-sky-300' },
  event: { icon: '❓', label: 'Unknown', color: 'text-amber-300' },
  boss: { icon: '👑', label: 'Boss', color: 'text-fuchsia-300' },
  start: { icon: '⚑', label: 'Start', color: 'text-zinc-300' },
  unknown: { icon: '·', label: 'Unknown', color: 'text-zinc-300' }
}

const DIR_ARROW: Record<MapStepView['dir'], string> = {
  left: '↖',
  up: '↑',
  right: '↗'
}

const DIR_WORD: Record<MapStepView['dir'], string> = {
  left: 'up-left',
  up: 'up',
  right: 'up-right'
}

function meta(room: RoomKind): { icon: string; label: string; color: string } {
  return ROOM_META[room] ?? ROOM_META.unknown
}

export interface MapPathAdviceProps {
  result: MapPathResultView
}

export function MapPathAdvice({ result }: MapPathAdviceProps): React.JSX.Element {
  const { steps, rationale } = result
  const next = steps[0]
  const later = steps.slice(1)

  return (
    <div className="flex max-h-full w-full flex-col gap-1.5 overflow-y-auto rounded-xl bg-zinc-900/85 p-2.5 shadow-xl ring-1 ring-white/10 backdrop-blur-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
        Map Route
      </div>

      {next ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-400/60 bg-emerald-500/15 px-2 py-1.5">
          <span className="text-4xl font-bold leading-none text-emerald-300">
            {DIR_ARROW[next.dir]}
          </span>
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400/90">
              Go {DIR_WORD[next.dir]}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-base leading-none">{meta(next.room).icon}</span>
              <span className="text-base font-bold text-emerald-200">
                {meta(next.room).label}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm italic text-zinc-400">No path available.</div>
      )}

      {later.length > 0 && (
        <ol className="flex flex-col">
          {later.map((step, i) => (
            <RouteRow key={`${step.id}-${i}`} step={step} n={i + 2} />
          ))}
        </ol>
      )}

      {rationale.length > 0 && (
        <ul className="space-y-0.5 border-t border-white/10 pt-1.5 text-[10px] leading-snug text-zinc-400">
          {rationale.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RouteRow({ step, n }: { step: MapStepView; n: number }): React.JSX.Element {
  const m = meta(step.room)
  return (
    <li className="flex items-center gap-1.5 py-0.5">
      <span className="w-3 shrink-0 text-center font-mono text-[10px] text-zinc-600">
        {n}
      </span>
      <span
        className="w-6 shrink-0 text-center text-2xl font-bold leading-none text-zinc-300"
        title={DIR_WORD[step.dir]}
      >
        {DIR_ARROW[step.dir]}
      </span>
      <span className="text-base leading-none">{m.icon}</span>
      <span className={`text-sm font-semibold ${m.color}`}>{m.label}</span>
    </li>
  )
}
