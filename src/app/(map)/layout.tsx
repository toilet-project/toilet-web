import type { ReactNode } from 'react'
import { MapShell } from '../../components/MapShell'

// A shared layout owns the map; selection pages must not key or remount it.
export default function MapLayout({ children }: { children: ReactNode }) {
  return <><MapShell />{children}</>
}
