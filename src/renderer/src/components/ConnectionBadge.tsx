import React from 'react'

export type ConnectionState = 'connected' | 'stale' | 'offline'

const COPY: Record<ConnectionState, { color: string; label: string }> = {
  connected: { color: 'bg-emerald-500', label: 'Connected' },
  stale: { color: 'bg-yellow-500', label: 'Stale' },
  offline: { color: 'bg-rose-500', label: 'Mod offline' }
}

export interface ConnectionBadgeProps {
  state: ConnectionState
  version?: string
}

export function ConnectionBadge({
  state,
  version
}: ConnectionBadgeProps): React.JSX.Element {
  const { color, label } = COPY[state]
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span>{label}</span>
      {version ? <span className="opacity-60">v{version}</span> : null}
    </span>
  )
}
