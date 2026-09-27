import type { ReactNode } from 'react'
import { RegionShell } from '../../../components/regions/RegionShell'

export default function Layout({ children }: { children: ReactNode }) {
  return <RegionShell>{children}</RegionShell>
}
