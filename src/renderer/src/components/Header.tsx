import React from 'react'

export interface HeaderProps {
  right?: React.ReactNode
}

export function Header({ right }: HeaderProps): React.JSX.Element {
  return (
    <header className="drag-region flex h-9 shrink-0 items-center justify-between border-b border-zinc-700/50 px-3 text-[11px] uppercase tracking-wider text-zinc-400">
      <span className="font-semibold">Spirebound</span>
      <span className="no-drag">{right}</span>
    </header>
  )
}
