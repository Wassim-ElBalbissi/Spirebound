import React, { useEffect, useState } from 'react'
import type {
  AnnotationPayload,
  CalibrationStatePayload
} from '../../main/types/recommendation'
import { HandBadge } from './components/HandBadge'

/**
 * Renderer for the fullscreen click-through annotation window.
 *
 * Subscribes to the `annotations:update` IPC channel; when visible and the
 * payload contains a combat hand, paints one HandBadge per slot at the
 * estimated screen coordinates. Renders nothing otherwise.
 */
export function AnnotationRoot(): React.JSX.Element {
  const [payload, setPayload] = useState<AnnotationPayload | null>(null)
  const [calib, setCalib] = useState<CalibrationStatePayload>({
    active: false,
    step: 0,
    handSize: 0
  })

  useEffect(() => {
    const offA = window.overlay?.onAnnotations(setPayload)
    const offC = window.overlay?.onCalibrationState(setCalib)
    return () => {
      offA?.()
      offC?.()
    }
  }, [])

  if (calib.active) {
    return <CalibrationOverlay state={calib} />
  }

  const showGrid =
    !!payload?.showCalibrationGrid && (payload?.slots.length ?? 0) > 0
  const hasBadges =
    !!payload?.visible && (payload?.annotations.length ?? 0) > 0

  if (!payload || (!hasBadges && !showGrid)) {
    return <div className="h-screen w-screen" />
  }

  const scoreMax = hasBadges
    ? Math.max(...payload.annotations.map((a) => a.score), 1)
    : 1

  return (
    <div className="relative h-screen w-screen">
      {showGrid && <CalibrationGrid payload={payload} />}
      {hasBadges &&
        payload.annotations.map((annotation, i) => {
          const slot = payload.slots[i]
          if (!slot) return null
          return (
            <HandBadge
              key={annotation.handIndex}
              slot={slot}
              annotation={annotation}
              scoreMax={scoreMax}
            />
          )
        })}
    </div>
  )
}

function CalibrationOverlay({
  state
}: {
  state: CalibrationStatePayload
}): React.JSX.Element {
  const stepLabel = state.step === 1 ? 'leftmost' : 'rightmost'
  const onClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    void window.overlay?.calibrationClick({
      x: e.clientX,
      y: e.clientY
    })
  }
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') void window.overlay?.calibrationCancel()
  }
  return (
    <div
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKey}
      className="relative h-screen w-screen cursor-crosshair"
      style={{
        pointerEvents: 'auto',
        background:
          'radial-gradient(circle at center 80%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.35) 70%)'
      }}
      autoFocus
    >
      <div className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 rounded-lg border border-sky-400/60 bg-zinc-900/95 px-4 py-3 text-sm text-zinc-100 shadow-2xl">
        <div className="font-semibold text-sky-300">
          Calibration · step {state.step}/2
        </div>
        <div className="mt-1">
          Click the <span className="text-sky-300">center of your {stepLabel} card</span>.
        </div>
        <div className="mt-1 text-[10px] text-zinc-400">
          Hand-size locked at {state.handSize}. Press Esc to cancel.
        </div>
      </div>
      {state.leftCard && (
        <div
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 ring-2 ring-sky-200/60"
          style={{ left: state.leftCard.x, top: state.leftCard.y }}
        />
      )}
    </div>
  )
}

function CalibrationGrid({
  payload
}: {
  payload: AnnotationPayload
}): React.JSX.Element {
  const slot = payload.slots[0]
  if (!slot) return <></>
  return (
    <>
      {/* Card top — primary calibration target. Bright lime, 2px. */}
      <div
        className="pointer-events-none absolute left-0 right-0"
        style={{
          top: slot.y,
          height: 2,
          backgroundColor: 'rgba(132, 204, 22, 0.95)'
        }}
      />
      {/* Card bottom — secondary reference. */}
      <div
        className="pointer-events-none absolute left-0 right-0"
        style={{
          top: slot.y + slot.height,
          height: 1,
          backgroundColor: 'rgba(132, 204, 22, 0.55)'
        }}
      />
      {/* Display center, vertical. */}
      <div
        className="pointer-events-none absolute top-0 bottom-0"
        style={{
          left: payload.display.width / 2 - 0.5,
          width: 1,
          backgroundColor: 'rgba(251, 191, 36, 0.7)'
        }}
      />
      {/* Slot rectangles — one per estimated card position. */}
      {payload.slots.map((s, i) => (
        <div
          key={i}
          className="pointer-events-none absolute"
          style={{
            left: s.x - s.width / 2,
            top: s.y,
            width: s.width,
            height: s.height,
            border: '1px dashed rgba(132, 204, 22, 0.7)'
          }}
        />
      ))}
      {/* Numeric Y label so calibration is easier. */}
      <div
        className="pointer-events-none absolute rounded bg-zinc-900/85 px-1.5 py-0.5 text-[10px] font-mono text-lime-300"
        style={{ top: slot.y - 18, left: 8 }}
      >
        card top Y={Math.round(slot.y)}
      </div>
    </>
  )
}
