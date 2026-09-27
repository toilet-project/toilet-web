'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ToiletDetailResponse } from '../api/toilets'
import { detailPresentation } from '../lib/detailPresentation'
import { TRANSIENT_NOTICE_MS } from '../lib/uiTiming'
import { useLocale, useMessages } from '../i18n/context'

export function ToiletDetailContents({ toilet }: { toilet: ToiletDetailResponse }) {
  const model = detailPresentation(toilet, useLocale())
  return <div className="card-details" tabIndex={0} aria-label={model.title}>
    {model.address.value && <DetailRow className="detail-address" {...model.address} copyable />}
    {model.region.value && (model.region.href
      ? <div className="detail-row detail-region-link"><dt>{model.region.label}</dt><dd><Link href={model.region.href}>{model.region.value}<span aria-hidden="true">↗</span></Link></dd></div>
      : <DetailRow label={model.region.label} value={model.region.value} />)}
    <DetailRow {...model.opening} />
    {model.installed && <DetailRow {...model.installed} />}
    {model.capacity.groups.length > 0 && <section className="detail-section"><h2>{model.capacity.title}</h2>
      <div className="capacity-groups">{model.capacity.groups.map(group => <div className="capacity-group" key={group.title}>
        <h3>{group.title}</h3><dl>{group.items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.count}{model.countSuffix}</dd></div>)}</dl>
      </div>)}</div>
    </section>}
    <section className="detail-section facility-section"><h2>{model.safety.title}</h2>
      {model.safety.items.map(item => item.location === null
        ? <div className="facility-row" key={item.label}><strong>{item.label}</strong><span className={'facility-status' + (item.available ? '' : ' is-unavailable')}>{item.available ? model.safety.available : model.safety.unavailable}</span><span className="facility-location-placeholder" aria-hidden="true" /></div>
        : <details className="facility-row facility-row-expandable" key={item.label}>
          <summary><strong>{item.label}</strong><span className="facility-status">{model.safety.available}</span><span className="facility-location-label">{model.safety.location} <span className="facility-location-arrow" aria-hidden="true" /></span></summary>
          <p>{model.safety.location}: {item.location}</p>
        </details>)}
    </section>
    {model.other.map(row => <DetailRow key={row.label} {...row} />)}
  </div>
}

export function DetailRow({ label, value, copyable = false, className = '' }: { label: string; value: string; copyable?: boolean; className?: string }) {
  const t = useMessages()
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!copied) return
    const dismiss = () => { setCopied(false); if (copiedTimer.current) clearTimeout(copiedTimer.current); copiedTimer.current = null }
    document.addEventListener('pointerdown', dismiss, { once: true })
    document.addEventListener('keydown', dismiss, { once: true })
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss) }
  }, [copied])
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }, [])

  const copyValue = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.append(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      setCopied(true)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => { setCopied(false); copiedTimer.current = null }, TRANSIENT_NOTICE_MS)
    } catch {
      setCopied(false)
    }
  }

  return <div className={`detail-row ${className}`.trim()}><dt>{label}</dt><dd><span>{value}</span>{copyable && <button type="button" className="copy-address-button" onClick={() => void copyValue()}>{t(copied ? 'detail.copied' : 'detail.copy')}</button>}</dd></div>
}
