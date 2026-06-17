import React from 'react'

/** The Spirebound mark — an ascending spire with a binding band. */
export function Logo({ size = 22 }: { size?: number }): React.JSX.Element {
  const id = React.useId()
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      {/* spire */}
      <path d="M50 8 L86 88 L14 88 Z" fill={`url(#${id}-g)`} />
      {/* left facet shading */}
      <path d="M50 8 L14 88 L50 88 Z" fill="#000" opacity="0.16" />
      {/* binding band */}
      <path d="M29 60 L71 60 L74.5 67 L25.5 67 Z" fill="#0b0b0f" opacity="0.55" />
      {/* center seam highlight */}
      <path d="M50 8 L50 88" stroke="#eafff7" strokeWidth="2" opacity="0.5" />
    </svg>
  )
}
