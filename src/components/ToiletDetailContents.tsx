'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ToiletDetailResponse } from '../api/toilets'
import { getDisplayAddress } from '../lib/address'
import { regionLabel } from '../lib/toiletRoute'
import { districtForToilet, getProvince, regionName, localizedRegionPath } from '../lib/regions'
import { localizedPublicPath } from '../i18n/routes'
import { visibleCounts, hasValue, formatOpenTime, formatPhoneNumber, formatInstallationDate, formatFacilityLocation, type CountItem } from '../lib/detailFormatting'
import { TRANSIENT_NOTICE_MS } from '../lib/uiTiming'
import { useLocale, useMessages } from '../i18n/context'
import { localizeToiletDetail } from '../i18n/toiletTranslations'

export function ToiletDetailContents({ toilet }: { toilet: ToiletDetailResponse }) {
  const t = useMessages()
  const locale = useLocale()
  const display = localizeToiletDetail(toilet, locale)
  const maleCounts = visibleCounts([
    { label: t('detail.toilets'), count: display.maleToiletCount },
    { label: t('detail.urinals'), count: display.maleUrinalCount },
    { label: t('detail.accessibleToilets'), count: display.maleDisabledToiletCount },
    { label: t('detail.accessibleUrinals'), count: display.maleDisabledUrinalCount },
    { label: t('detail.childToilets'), count: display.maleChildToiletCount },
    { label: t('detail.childUrinals'), count: display.maleChildUrinalCount },
  ])
  const femaleCounts = visibleCounts([
    { label: t('detail.toilets'), count: display.femaleToiletCount },
    { label: t('detail.accessibleToilets'), count: display.femaleDisabledToiletCount },
    { label: t('detail.childToilets'), count: display.femaleChildToiletCount },
  ])
  const address = getDisplayAddress(display.roadAddress, display.jibunAddress)
  const district = display.longitude != null && display.latitude != null ? districtForToilet(display.id, display.longitude, display.latitude) : null
  const province = district ? getProvince(district.provinceCode) : null
  const linkedRegion = district && province ? `${regionName(province, locale)} ${regionName(district, locale)}` : null

  return (
    <div className="card-details" tabIndex={0} aria-label={t('detail.title')}>
      {address && <DetailRow className="detail-address" label={t('detail.address')} value={address} copyable />}
      {linkedRegion && district ? <div className="detail-row detail-region-link"><dt>{t('detail.region')}</dt><dd><Link href={localizedPublicPath(localizedRegionPath(locale, district.provinceCode, district.code), locale)!}>{linkedRegion}<span aria-hidden="true">↗</span></Link></dd></div>
        : regionLabel(display.region) && <DetailRow label={t('detail.region')} value={regionLabel(display.region)} />}
      <DetailRow label={t('detail.openingDetails')} value={formatOpenTime(display, locale)} />
      {hasValue(display.installationDate) && <DetailRow label={t('detail.installed')} value={formatInstallationDate(display.installationDate, locale)} />}
      {(maleCounts.length > 0 || femaleCounts.length > 0) && <section className="detail-section">
        <h2>{t('detail.capacity')}</h2>
        <div className="capacity-groups">
          {maleCounts.length > 0 && <CapacityGroup title={t('detail.male')} items={maleCounts} />}
          {femaleCounts.length > 0 && <CapacityGroup title={t('detail.female')} items={femaleCounts} />}
        </div>
      </section>}
      <section className="detail-section facility-section">
        <h2>{t('detail.safety')}</h2>
        <FacilityRow label={t('detail.bell')} available={display.hasEmergencyBell === 'Y'} location={display.emergencyBellLocation} />
        <FacilityRow label="CCTV" available={display.hasCctv === 'Y'} />
        <FacilityRow label={t('detail.diaper')} available={display.hasDiaperTable === 'Y'} location={display.diaperTableLocation} />
      </section>
      {hasValue(display.agencyName) && <DetailRow label={t('detail.agency')} value={display.agencyName} />}
      {hasValue(display.phoneNumber) && <DetailRow label={t('detail.phone')} value={formatPhoneNumber(display.phoneNumber)} />}
      {hasValue(display.dataBaseDate) && <DetailRow label={t('detail.dataDate')} value={display.dataBaseDate} />}
    </div>
  )
}

function CapacityGroup({ title, items }: { title: string; items: CountItem[] }) {
  const locale = useLocale()
  return <div className="capacity-group"><h3>{title}</h3><dl>{items.map(({ label, count }) => <div key={label}><dt>{label}</dt><dd>{count}{locale === 'ko' ? '대' : ''}</dd></div>)}</dl></div>
}

function FacilityRow({ label, available, location }: { label: string; available: boolean; location?: string }) {
  const t = useMessages()
  const locale = useLocale()
  if (!available) {
    return <div className="facility-row"><strong>{label}</strong><span className="facility-status is-unavailable">{t('detail.unavailable')}</span><span className="facility-location-placeholder" aria-hidden="true" /></div>
  }

  if (!hasValue(location ?? '')) {
    return <div className="facility-row"><strong>{label}</strong><span className="facility-status">{t('detail.available')}</span><span className="facility-location-placeholder" aria-hidden="true" /></div>
  }

  return <details className="facility-row facility-row-expandable">
    <summary><strong>{label}</strong><span className="facility-status">{t('detail.available')}</span><span className="facility-location-label">{t('detail.location')} <span className="facility-location-arrow" aria-hidden="true" /></span></summary>
    <p>{t('detail.location')}: {formatFacilityLocation(location ?? '', locale)}</p>
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
