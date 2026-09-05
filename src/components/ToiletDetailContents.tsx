'use client'

import { useState } from 'react'
import type { ToiletDetailResponse } from '../api/toilets'
import { getDisplayAddress } from '../lib/address'
import { regionLabel } from '../lib/toiletRoute'
import { visibleCounts, hasValue, formatPhoneNumber, formatInstallationDate, formatFacilityLocation, type CountItem } from '../lib/detailFormatting'

export function ToiletDetailContents({ toilet }: { toilet: ToiletDetailResponse }) {
  const maleCounts = visibleCounts([
    { label: '대변기', count: toilet.maleToiletCount },
    { label: '소변기', count: toilet.maleUrinalCount },
    { label: '장애인 대변기', count: toilet.maleDisabledToiletCount },
    { label: '장애인 소변기', count: toilet.maleDisabledUrinalCount },
    { label: '어린이 대변기', count: toilet.maleChildToiletCount },
    { label: '어린이 소변기', count: toilet.maleChildUrinalCount },
  ])
  const femaleCounts = visibleCounts([
    { label: '대변기', count: toilet.femaleToiletCount },
    { label: '장애인 대변기', count: toilet.femaleDisabledToiletCount },
    { label: '어린이 대변기', count: toilet.femaleChildToiletCount },
  ])
  const address = getDisplayAddress(toilet.roadAddress, toilet.jibunAddress)

  return (
    <div className="card-details" tabIndex={0} aria-label="화장실 상세 정보">
      {regionLabel(toilet.region) && <DetailRow label="지역" value={regionLabel(toilet.region)} />}
      {address && <DetailRow className="detail-address" label="주소" value={address} copyable />}
      {hasValue(toilet.openTimeDetail) && <DetailRow label="개방시간 상세" value={toilet.openTimeDetail} />}
      {hasValue(toilet.installationDate) && <DetailRow label="설치연월" value={formatInstallationDate(toilet.installationDate)} />}
      {(maleCounts.length > 0 || femaleCounts.length > 0) && <section className="detail-section">
        <h2>화장실 수</h2>
        <div className="capacity-groups">
          {maleCounts.length > 0 && <CapacityGroup title="남성" items={maleCounts} />}
          {femaleCounts.length > 0 && <CapacityGroup title="여성" items={femaleCounts} />}
        </div>
      </section>}
      <section className="detail-section facility-section">
        <h2>편의·안전</h2>
        <FacilityRow label="비상벨" available={toilet.hasEmergencyBell === 'Y'} location={toilet.emergencyBellLocation} />
        <FacilityRow label="CCTV" available={toilet.hasCctv === 'Y'} />
        <FacilityRow label="기저귀 교환대" available={toilet.hasDiaperTable === 'Y'} location={toilet.diaperTableLocation} />
      </section>
      {hasValue(toilet.agencyName) && <DetailRow label="관리기관" value={toilet.agencyName} />}
      {hasValue(toilet.phoneNumber) && <DetailRow label="전화" value={formatPhoneNumber(toilet.phoneNumber)} />}
      {hasValue(toilet.dataBaseDate) && <DetailRow label="데이터 기준일" value={toilet.dataBaseDate} />}
    </div>
  )
}

function CapacityGroup({ title, items }: { title: string; items: CountItem[] }) {
  return <div className="capacity-group"><h3>{title}</h3><dl>{items.map(({ label, count }) => <div key={label}><dt>{label}</dt><dd>{count}대</dd></div>)}</dl></div>
}

function FacilityRow({ label, available, location }: { label: string; available: boolean; location?: string }) {
  if (!available) {
    return <div className="facility-row"><strong>{label}</strong><span className="facility-status is-unavailable">미설치</span><span className="facility-location-placeholder" aria-hidden="true" /></div>
  }

  if (!hasValue(location ?? '')) {
    return <div className="facility-row"><strong>{label}</strong><span className="facility-status">설치됨</span><span className="facility-location-placeholder" aria-hidden="true" /></div>
  }

  return <details className="facility-row facility-row-expandable">
    <summary><strong>{label}</strong><span className="facility-status">설치됨</span><span className="facility-location-label">위치 보기 <span className="facility-location-arrow" aria-hidden="true" /></span></summary>
    <p>위치: {formatFacilityLocation(location ?? '')}</p>
  </details>
}

export function DetailRow({ label, value, copyable = false, className = '' }: { label: string; value: string; copyable?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false)

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
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
    }
  }

  return <div className={`detail-row ${className}`.trim()}><dt>{label}</dt><dd><span>{value}</span>{copyable && <button type="button" className="copy-address-button" onClick={() => void copyValue()}>{copied ? '복사됨' : '주소 복사'}</button>}</dd></div>
}
