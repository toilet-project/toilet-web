import { useLocale, useMessages } from '../i18n/context'
import { useEffect, useRef, useState } from 'react'
import { createToiletReport } from '../api/reports'
import type { ToiletDetailResponse } from '../api/toilets'
import { createKakaoMap, reverseGeocodeKakaoCoordinates, type KakaoMapInstance } from '../lib/kakaoMap'
import { getDisplayAddress } from '../lib/address'
import { attachReportViewport } from '../lib/reportViewport'
import { trackEvent } from '../lib/analytics'

type ReportType = 'choice' | 'location' | 'locationConfirm' | 'openTime' | 'complete'
type Coordinates = { latitude: number; longitude: number }

export function ToiletReportModal({ toilet, latitude, longitude, onClose, onViewMyReports }: { toilet: ToiletDetailResponse; latitude: number; longitude: number; onClose: () => void; onViewMyReports: () => void }) {
  const locale = useLocale(), t = useMessages()
  const [step, setStep] = useState<ReportType>('choice')
  const [coordinates, setCoordinates] = useState<Coordinates>({ latitude, longitude })
  // 지도 이동 중에는 재생성하지 않고, 확인 단계로 전환할 때만 중심을 확정한다.
  const [confirmedCoordinates, setConfirmedCoordinates] = useState<Coordinates | null>(null)
  const [roadAddress, setRoadAddress] = useState(getDisplayAddress(toilet.roadAddress, toilet.jibunAddress))
  const [isAddressLoading, setIsAddressLoading] = useState(false)
  const [openTime, setOpenTime] = useState(toilet.openTime || '')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mapLevel, setMapLevel] = useState(4)
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMapInstance | null>(null)
  const geocodeRequestRef = useRef(0)
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (backdropRef.current) return attachReportViewport(backdropRef.current)
  }, [])

  useEffect(() => { contentRef.current?.scrollTo(0, 0) }, [step])

  useEffect(() => {
    if ((step !== 'location' && step !== 'locationConfirm') || !mapElementRef.current) return
    let disposed = false
    let resizeObserver: ResizeObserver | undefined

    const updateAddress = async (next: Coordinates) => {
      const requestId = ++geocodeRequestRef.current
      setIsAddressLoading(true)
      try {
        const address = await reverseGeocodeKakaoCoordinates(next.latitude, next.longitude)
        if (!disposed && requestId === geocodeRequestRef.current) setRoadAddress(address ?? '')
      } catch {
        if (!disposed && requestId === geocodeRequestRef.current) setRoadAddress('')
      } finally {
        if (!disposed && requestId === geocodeRequestRef.current) setIsAddressLoading(false)
      }
    }

    void (async () => {
      const map = await createKakaoMap(mapElementRef.current!, confirmedCoordinates ?? { latitude, longitude }, 4)
      if (disposed) return
      mapRef.current = map
      resizeObserver = new ResizeObserver(() => map.relayout())
      resizeObserver.observe(mapElementRef.current!)
      if (step === 'locationConfirm') {
        map.setDraggable(false)
        map.setZoomable(false)
        return
      }
      const syncCenter = () => {
        if (disposed) return
        const center = map.getCenter()
        const next = { latitude: center.getLat(), longitude: center.getLng() }
        setCoordinates(next)
        if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current)
        geocodeTimerRef.current = setTimeout(() => { void updateAddress(next) }, 280)
      }
      const syncLevel = () => { if (!disposed) setMapLevel(map.getLevel()) }
      window.kakao.maps.event.addListener(map, 'idle', syncCenter)
      window.kakao.maps.event.addListener(map, 'zoom_changed', syncLevel)
      syncLevel()
      syncCenter()
    })()

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current)
      mapRef.current = null
    }
  }, [step, latitude, longitude, confirmedCoordinates])

  const openLocationConfirmation = () => {
    setError(null)
    if (!reason.trim()) { setError(t('report.reasonRequired')); return }
    if (!roadAddress) { setError(t('report.checkAddress')); return }
    setConfirmedCoordinates(coordinates)
    setStep('locationConfirm')
  }

  const submit = async () => {
    setError(null)
    if (!reason.trim()) { setError(t('report.reasonRequired')); return }
    if (step === 'locationConfirm' && !roadAddress) { setError(t('report.checkAddress')); return }
    if (step === 'openTime' && !openTime.trim()) { setError(t('report.hoursRequired')); return }

    setIsSubmitting(true)
    const reportKind = step === 'locationConfirm' ? 'coordinate' : 'open_time'
    try {
      await createToiletReport(step === 'locationConfirm'
        ? { toiletId: toilet.id, reportType: 'COORDINATE_CORRECTION', latitude: coordinates.latitude, longitude: coordinates.longitude, roadAddress, reason: reason.trim() }
        : { toiletId: toilet.id, reportType: 'OPEN_TIME_CORRECTION', openTime: openTime.trim(), reason: reason.trim() })
      trackEvent('report_submit', { report_kind: reportKind, success: true })
      setStep('complete')
    } catch (submissionError) {
      trackEvent('report_submit', { report_kind: reportKind, success: false })
      setError(locale === 'ko' && submissionError instanceof Error ? submissionError.message : submissionError instanceof Error && submissionError.message === '제보하려면 먼저 로그인해 주세요.' ? t('auth.required') : t('report.submitFailed'))
    } finally { setIsSubmitting(false) }
  }

  return <div ref={backdropRef} className="report-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
      <header className="report-modal-toolbar">
        {step !== 'choice' && step !== 'complete' && <button type="button" className="report-back" onClick={() => setStep(step === 'locationConfirm' ? 'location' : 'choice')} aria-label={t('common.back')}>‹</button>}
        <span className="report-modal-step-title">{t(({ choice: 'report.title', location: 'report.location', locationConfirm: 'report.confirmLocation', openTime: 'report.hours', complete: 'report.received' } as const)[step])}</span>
        <button type="button" className="report-modal-close" onClick={onClose} aria-label={t('report.close')}>×</button>
      </header>
      <div ref={contentRef} className="report-modal-content">
      {step === 'choice' && <>
        <h1 id="report-modal-title">{t('report.question')}</h1>
        <p className="report-target"><span>{t('report.target')}</span><strong>{toilet.name}</strong></p>
        <p className="report-modal-description">{t('report.reviewHint')}</p>
        <div className="report-type-options">
          <button type="button" onClick={() => setStep('location')}><strong>{t('report.location')}</strong><span>{t('report.locationHint')}</span></button>
          <button type="button" onClick={() => setStep('openTime')}><strong>{t('report.hours')}</strong><span>{t('report.hoursHint')}</span></button>
        </div>
      </>}
      {step === 'location' && <>
        <h1 id="report-modal-title">{t('report.moveMap')}</h1>
        <p className="report-target"><span>{t('report.target')}</span><strong>{toilet.name}</strong></p>
        <div className="report-map-wrap"><div ref={mapElementRef} className="report-map" /><span className="report-map-pin" aria-label={t('report.proposedLocation')} />{mapLevel > 3 && <span className="report-map-zoom-guide">{t('report.zoomHint')}</span>}</div>
        <div className="report-address-box"><span>{t('detail.address')}</span><strong>{isAddressLoading ? t('report.addressLoading') : roadAddress || t('report.noAddress')}</strong></div>
        <label className="report-field"><span>{t('report.reason')}</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={t('report.locationExample')} /></label>
        {error && <p className="report-error" role="alert">{error}</p>}
        <button type="button" className="report-submit" disabled={isAddressLoading} onClick={openLocationConfirmation}>{t('report.submitLocation')}</button>
      </>}
      {step === 'locationConfirm' && <>
        <h1 id="report-modal-title">{t('report.confirmQuestion')}</h1>
        <p className="report-modal-description">{t('report.confirmHint')}</p>
        <div className="report-map-wrap report-confirm-map"><div ref={mapElementRef} className="report-map" /><span className="report-map-pin" aria-label={t('report.proposedLocation')} /></div>
        <div className="report-confirm-summary">
          <div><span>{t('report.target')}</span><strong>{toilet.name}</strong></div>
          <div><span>{t('detail.address')}</span><strong>{roadAddress}</strong></div>
        </div>
        {error && <p className="report-error" role="alert">{error}</p>}
        <div className="report-confirm-actions"><button type="button" className="report-edit-button" onClick={() => setStep('location')}>{t('common.edit')}</button><button type="button" className="report-submit" disabled={isSubmitting} onClick={() => void submit()}>{t(isSubmitting ? 'report.submitting' : 'report.confirmSubmit')}</button></div>
      </>}
      {step === 'openTime' && <>
        <h1 id="report-modal-title">{t('report.hoursHeading')}</h1>
        <p className="report-target"><span>{t('report.target')}</span><strong>{toilet.name}</strong></p>
        <p className="report-modal-description">{t('report.currentHours')} <strong>{toilet.openTime || t('common.noInfo')}</strong></p>
        <label className="report-field"><span>{t('report.updatedHours')}</span><input value={openTime} maxLength={50} onChange={(event) => setOpenTime(event.target.value)} placeholder={t('report.hoursExample')} /></label>
        <label className="report-field"><span>{t('report.reason')}</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={t('report.reasonExample')} /></label>
        {error && <p className="report-error" role="alert">{error}</p>}
        <button type="button" className="report-submit" disabled={isSubmitting} onClick={() => void submit()}>{t(isSubmitting ? 'report.submitting' : 'report.submitHours')}</button>
      </>}
      {step === 'complete' && <div className="report-complete"><span aria-hidden="true">✓</span><h1 id="report-modal-title">{t('report.complete')}</h1><p>{t('report.completeHint')}</p><div className="report-complete-actions"><button type="button" className="report-edit-button" onClick={onClose}>{t('detail.back')}</button><button type="button" className="report-submit" onClick={onViewMyReports}>{t('report.viewMine')}</button></div></div>}
      </div>
    </section>
  </div>
}
