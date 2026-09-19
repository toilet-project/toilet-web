'use client'

import { useEffect, useRef, useState } from 'react'
import type { ToiletDetailResponse } from '../api/toilets'
import { getDisplayAddress } from '../lib/address'
import { regionLabel } from '../lib/toiletRoute'
import { visibleCounts, hasValue, formatPhoneNumber, formatInstallationDate, formatFacilityLocation, type CountItem } from '../lib/detailFormatting'
import { TRANSIENT_NOTICE_MS } from '../lib/uiTiming'
import { useLocale, useMessages } from '../i18n/context'

export function ToiletDetailContents({ toilet }: { toilet: ToiletDetailResponse }) {
  const t = useMessages()
  const maleCounts = visibleCounts([
    { label: t('detail.toilets'), count: toilet.maleToiletCount },
    { label: t('detail.urinals'), count: toilet.maleUrinalCount },
    { label: t('detail.accessibleToilets'), count: toilet.maleDisabledToiletCount },
    { label: t('detail.accessibleUrinals'), count: toilet.maleDisabledUrinalCount },
    { label: t('detail.childToilets'), count: toilet.maleChildToiletCount },
    { label: t('detail.childUrinals'), count: toilet.maleChildUrinalCount },
  ])
  const femaleCounts = visibleCounts([
    { label: t('detail.toilets'), count: toilet.femaleToiletCount },
    { label: t('detail.accessibleToilets'), count: toilet.femaleDisabledToiletCount },
    { label: t('detail.childToilets'), count: toilet.femaleChildToiletCount },
  ])
  const address = getDisplayAddress(toilet.roadAddress, toilet.jibunAddress)

  return (
    <div className="card-details" tabIndex={0} aria-label={t('detail.title')}>
      {address && <DetailRow className="detail-address" label={t('detail.address')} value={address} copyable />}
      {regionLabel(toilet.region) && <DetailRow label={t('detail.region')} value={regionLabel(toilet.region)} />}
      {hasValue(toilet.openTimeDetail) && <DetailRow label={t('detail.openingDetails')} value={toilet.openTimeDetail} />}
      {hasValue(toilet.installationDate) && <DetailRow label={t('detail.installed')} value={formatInstallationDate(toilet.installationDate)} />}
      {(maleCounts.length > 0 || femaleCounts.length > 0) && <section className="detail-section">
        <h2>{t('detail.capacity')}</h2>
        <div className="capacity-groups">
          {maleCounts.length > 0 && <CapacityGroup title={t('detail.male')} items={maleCounts} />}
          {femaleCounts.length > 0 && <CapacityGroup title={t('detail.female')} items={femaleCounts} />}
        </div>
      </section>}
      <section className="detail-section facility-section">
        <h2>{t('detail.safety')}</h2>
        <FacilityRow label={t('detail.bell')} available={toilet.hasEmergencyBell === 'Y'} location={toilet.emergencyBellLocation} />
        <FacilityRow label="CCTV" available={toilet.hasCctv === 'Y'} />
        <FacilityRow label={t('detail.diaper')} available={toilet.hasDiaperTable === 'Y'} location={toilet.diaperTableLocation} />
      </section>
      {hasValue(toilet.agencyName) && <DetailRow label={t('detail.agency')} value={toilet.agencyName} />}
      {hasValue(toilet.phoneNumber) && <DetailRow label={t('detail.phone')} value={formatPhoneNumber(toilet.phoneNumber)} />}
      {hasValue(toilet.dataBaseDate) && <DetailRow label={t('detail.dataDate')} value={toilet.dataBaseDate} />}
    </div>
  )
}

function CapacityGroup({ title, items }: { title: string; items: CountItem[] }) {
  const locale = useLocale()
  return <div className="capacity-group"><h3>{title}</h3><dl>{items.map(({ label, count }) => <div key={label}><dt>{label}</dt><dd>{count}{locale === 'ko' ? '대' : ''}</dd></div>)}</dl></div>
}

function FacilityRow({ label, available, location }: { label: string; available: boolean; location?: string }) {
  const t = useMessages()
  if (!available) {
    return <div className="facility-row"><strong>{label}</strong><span className="facility-status is-unavailable">{t('detail.unavailable')}</span><span className="facility-location-placeholder" aria-hidden="true" /></div>
  }

  if (!hasValue(location ?? '')) {
    return <div className="facility-row"><strong>{label}</strong><span className="facility-status">{t('detail.available')}</span><span className="facility-location-placeholder" aria-hidden="true" /></div>
  }

  return <details className="facility-row facility-row-expandable">
    <summary><strong>{label}</strong><span className="facility-status">{t('detail.available')}</span><span className="facility-location-label">{t('detail.location')} <span className="facility-location-arrow" aria-hidden="true" /></span></summary>
    <p>{t('detail.location')}: {formatFacilityLocation(location ?? '')}</p>
  </details>
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
