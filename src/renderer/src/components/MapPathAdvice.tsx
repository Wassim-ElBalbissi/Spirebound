import React from 'react'
import type { MapPathView } from '../../../main/types/recommendation'
import type { RoomKind } from '../../../main/types/gameState'

export interface MapPathAdviceProps {
  paths: MapPathView[]
}

const ROOM_SYMBOL: Record<RoomKind, string> = {
  monster: '⚔',
  elite: '★',
  event: '?',
  rest: 'z',
  shop: '$',
  treasure: '◆',
  boss: 'B',
  start: '○',
  unknown: '·'
}

const ROOM_COLOR: Record<RoomKind, string> = {
  monster: 'text-zinc-400',
  elite: 'text-amber-400',
  event: 'text-violet-400',
  rest: 'text-emerald-400',
  shop: 'text-sky-400',
  treasure: 'text-yellow-400',
  boss: 'text-rose-400',
  start: 'text-zinc-500',
  unknown: 'text-zinc-600'
}

const PATH_COLOR = ['border-emerald-500/70', 'border-sky-500/70', 'border-amber-500/70']
const PATH_ACCENT = ['text-emerald-400', 'text-sky-400', 'text-amber-400']

interface Step {
  col: number
  row: number
  room: RoomKind
}

function parseStep(nodeId: string, room: RoomKind): Step {
  const [c, r] = nodeId.split(',').map(Number)
  return { col: c ?? 0, row: r ?? 0, room }
}

export function MapPathAdvice({ paths }: MapPathAdviceProps): React.JSX.Element {
  if (paths.length === 0) {
    return (
      <div className="p-3 text-sm text-zinc-400">
        No reachable paths from this node.
      </div>
    )
  }

  // The first nodeId on every path is the current position. Build the union of
  // all column positions used by any path so the ladder is consistent.
  const stepsPerPath: Step[][] = paths.map((p) =>
    p.nodeIds.map((id, i) => parseStep(id, p.rooms[i] ?? 'unknown'))
  )

  const currentStep = stepsPerPath[0]?.[0]
  const cols = new Set<number>()
  for (const steps of stepsPerPath) {
    for (const s of steps) cols.add(s.col)
  }
  const sortedCols = [...cols].sort((a, b) => a - b)

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Best Paths
        </span>
        {currentStep && (
          <span className="text-[10px] font-mono text-zinc-500">
            you · col {currentStep.col}
          </span>
        )}
      </div>

      {paths.map((path, i) => {
        const steps = stepsPerPath[i] ?? []
        const nextStep = steps[1]
        const direction =
          currentStep && nextStep
            ? Math.sign(nextStep.col - currentStep.col)
            : 0
        return (
          <div
            key={i}
            className={`rounded-md border bg-zinc-800/40 p-2 ${
              PATH_COLOR[i] ?? 'border-zinc-700/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm">
                <span
                  className={`text-[10px] font-mono ${
                    PATH_ACCENT[i] ?? 'text-zinc-400'
                  }`}
                >
                  #{i + 1}
                </span>
                <DirectionArrow direction={direction} />
                {nextStep && (
                  <span
                    className={`text-[11px] uppercase tracking-wider ${
                      PATH_ACCENT[i] ?? 'text-zinc-300'
                    }`}
                  >
                    {directionLabel(direction)} ·{' '}
                    <span className={ROOM_COLOR[nextStep.room]}>
                      {ROOM_SYMBOL[nextStep.room]} {nextStep.room}
                    </span>
                  </span>
                )}
              </span>
              <span className="font-mono text-xs text-zinc-400">
                {Math.round(path.score)}
              </span>
            </div>

            <ColumnLadder
              steps={steps.slice(1)}
              cols={sortedCols}
              currentCol={currentStep?.col}
            />

            {path.rationale.length > 0 && (
              <div className="mt-1 text-[10px] leading-tight text-zinc-400">
                {path.rationale.join(' · ')}
              </div>
            )}
          </div>
        )
      })}

      <Legend />
    </div>
  )
}

function DirectionArrow({
  direction
}: {
  direction: number
}): React.JSX.Element {
  const c =
    direction < 0 ? '↖' : direction > 0 ? '↗' : '↑'
  return <span className="font-mono text-base text-zinc-100">{c}</span>
}

function directionLabel(direction: number): string {
  if (direction < 0) return 'left'
  if (direction > 0) return 'right'
  return 'straight'
}

function ColumnLadder({
  steps,
  cols,
  currentCol
}: {
  steps: Step[]
  cols: number[]
  currentCol?: number
}): React.JSX.Element {
  if (steps.length === 0) return <></>
  return (
    <div className="mt-1.5 flex flex-col gap-0.5">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          {cols.map((c) => {
            const here = c === s.col
            const isCurrentCol = c === currentCol
            return (
              <span
                key={c}
                className={`inline-flex h-3.5 w-4 items-center justify-center text-[10px] font-mono ${
                  here
                    ? `${ROOM_COLOR[s.room]} bg-zinc-900/80 rounded`
                    : isCurrentCol
                      ? 'text-zinc-600/70'
                      : 'text-zinc-700/50'
                }`}
              >
                {here ? ROOM_SYMBOL[s.room] : '·'}
              </span>
            )
          })}
          <span className="ml-1 text-[9px] font-mono text-zinc-500">
            r{s.row}
          </span>
        </div>
      ))}
    </div>
  )
}

function Legend(): React.JSX.Element {
  const items: { kind: RoomKind; label: string }[] = [
    { kind: 'elite', label: 'elite' },
    { kind: 'rest', label: 'rest' },
    { kind: 'shop', label: 'shop' },
    { kind: 'event', label: 'event' },
    { kind: 'treasure', label: 'treasure' },
    { kind: 'monster', label: 'monster' }
  ]
  return (
    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
      {items.map((it) => (
        <span key={it.kind} className="flex items-center gap-1">
          <span className={`font-mono ${ROOM_COLOR[it.kind]}`}>
            {ROOM_SYMBOL[it.kind]}
          </span>
          <span>{it.label}</span>
        </span>
      ))}
    </div>
  )
}
