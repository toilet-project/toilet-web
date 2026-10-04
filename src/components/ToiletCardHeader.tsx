'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'

export function ToiletCardHeader({ children, report, share, closeLabel, onClose, closeHref }: {
  children: ReactNode
  report?: ReactNode
  share?: ReactNode
  closeLabel: string
  onClose?: () => void
  closeHref?: string
}) {
  const icon = <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
  return <div className="toilet-card-header">
    <div className="card-label-row">{children}</div>
    <div className="toilet-card-header-actions">
      {report}
      {share}
      {closeHref ? <Link href={closeHref} className="close-button" aria-label={closeLabel}>{icon}</Link>
        : <button type="button" className="close-button" onClick={onClose} aria-label={closeLabel}>{icon}</button>}
    </div>
  </div>
}
