import { useEffect, useLayoutEffect, useState } from 'react'
import { readMapFilterSelection, resolveMapFilterOwner, writeMapFilterSelection } from '../lib/mapFilterPreferences'

export function useMapFilterSelection(enabled: boolean, activeOwner: string | null, authLoading: boolean) {
  // App is mounted client-only by MapShell. Read once, before its first map request.
  const [saved] = useState(() => {
    try { if (enabled && typeof window !== 'undefined') return readMapFilterSelection(window.localStorage) } catch { /* Storage access itself can throw. */ }
    return { flags: 0, mine: false }
  })
  const [flags, setFlags] = useState(saved.flags)
  const [owner, setOwner] = useState<string | null | undefined>(saved.mine ? undefined : null)
  const resolvedOwner = resolveMapFilterOwner(owner, activeOwner, authLoading)
  const ready = resolvedOwner !== undefined
  const mine = Boolean(enabled && resolvedOwner && resolvedOwner === activeOwner)

  useLayoutEffect(() => {
    if (owner !== resolvedOwner) setOwner(resolvedOwner)
  }, [owner, resolvedOwner])
  useEffect(() => {
    if (!enabled || !ready) return
    try { writeMapFilterSelection(window.localStorage, { flags, mine }) } catch { /* Filtering remains available without persistence. */ }
  }, [enabled, ready, flags, mine])

  return { flags, setFlags, mine, ready, setMine: (selected: boolean) => setOwner(selected ? activeOwner : null) }
}
