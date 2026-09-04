import { useEffect, useRef, useState } from 'react'
import { createToiletReport } from '../api/reports'
import type { ToiletDetailResponse } from '../api/toilets'
import { createKakaoMap, reverseGeocodeKakaoCoordinates, type KakaoMapInstance } from '../lib/kakaoMap'

type ReportType = 'choice' | 'location' | 'locationConfirm' | 'openTime' | 'complete'
type Coordinates = { latitude: number; longitude: number }

export function ToiletReportModal({ toilet, latitude, longitude, onClose, onViewMyReports }: { toilet: ToiletDetailResponse; latitude: number; longitude: number; onClose: () => void; onViewMyReports: () => void }) {
  const [step, setStep] = useState<ReportType>('choice')
  const [coordinates, setCoordinates] = useState<Coordinates>({ latitude, longitude })
  // 지도 이동 중에는 재생성하지 않고, 확인 단계로 전환할 때만 중심을 확정한다.
  const [confirmedCoordinates, setConfirmedCoordinates] = useState<Coordinates | null>(null)
  const [roadAddress, setRoadAddress] = useState(toilet.roadAddress || toilet.jibunAddress || '')
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

  useEffect(() => {
    if ((step !== 'location' && step !== 'locationConfirm') || !mapElementRef.current) return
    let disposed = false

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
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current)
      mapRef.current = null
    }
  }, [step, latitude, longitude, confirmedCoordinates])

  const openLocationConfirmation = () => {
    setError(null)
    if (!reason.trim()) { setError('제보 사유를 입력해 주세요.'); return }
    if (!roadAddress) { setError('표시된 도로명 주소를 확인해 주세요.'); return }
    setConfirmedCoordinates(coordinates)
    setStep('locationConfirm')
  }

  const submit = async () => {
    setError(null)
    if (!reason.trim()) { setError('제보 사유를 입력해 주세요.'); return }
    if (step === 'locationConfirm' && !roadAddress) { setError('표시된 도로명 주소를 확인해 주세요.'); return }
    if (step === 'openTime' && !openTime.trim()) { setError('변경할 개방 시간을 입력해 주세요.'); return }

    setIsSubmitting(true)
    try {
      await createToiletReport(step === 'locationConfirm'
        ? { toiletId: toilet.id, reportType: 'COORDINATE_CORRECTION', latitude: coordinates.latitude, longitude: coordinates.longitude, roadAddress, reason: reason.trim() }
        : { toiletId: toilet.id, reportType: 'OPEN_TIME_CORRECTION', openTime: openTime.trim(), reason: reason.trim() })
      setStep('complete')
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : '제보를 접수하지 못했습니다.')
    } finally { setIsSubmitting(false) }
  }

  return <div className="report-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
      <button type="button" className="report-modal-close" onClick={onClose} aria-label="제보 닫기">×</button>
      {step === 'choice' && <>
        <span className="report-modal-eyebrow">정보 제보</span>
        <h1 id="report-modal-title">어떤 정보를 알려주실 건가요?</h1>
        <p className="report-target"><span>제보 대상</span><strong>{toilet.name}</strong></p>
        <p className="report-modal-description">관리자가 확인한 뒤 서비스 정보에 반영합니다.</p>
        <div className="report-type-options">
          <button type="button" onClick={() => setStep('location')}><strong>위치 제보</strong><span>지도에서 실제 위치를 지정하고 주소를 확인해요.</span></button>
          <button type="button" onClick={() => setStep('openTime')}><strong>개방 시간 제보</strong><span>변경된 운영 시간을 알려주세요.</span></button>
        </div>
      </>}
      {step === 'location' && <>
        <button type="button" className="report-back" onClick={() => setStep('choice')} aria-label="이전 화면으로">‹</button>
        <span className="report-modal-eyebrow report-modal-step-title">위치 제보</span>
        <h1 id="report-modal-title">지도를 움직여 핀을 맞춰 주세요</h1>
        <p className="report-target"><span>제보 대상</span><strong>{toilet.name}</strong></p>
        <div className="report-map-wrap"><div ref={mapElementRef} className="report-map" /><span className="report-map-pin" aria-label="제안 위치" />{mapLevel > 3 && <span className="report-map-zoom-guide">정확한 위치는 지도를 조금 더 확대해 맞춰 주세요</span>}</div>
        <div className="report-address-box"><span>도로명 주소</span><strong>{isAddressLoading ? '주소를 확인하는 중…' : roadAddress || '도로명 주소를 찾지 못했습니다.'}</strong></div>
        <label className="report-field"><span>제보 사유</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="예: 실제 화장실은 건물 동쪽 출입구 옆에 있습니다." /></label>
        {error && <p className="report-error" role="alert">{error}</p>}
        <button type="button" className="report-submit" disabled={isAddressLoading} onClick={openLocationConfirmation}>위치 제보 접수</button>
      </>}
      {step === 'locationConfirm' && <>
        <button type="button" className="report-back" onClick={() => setStep('location')} aria-label="위치 수정 화면으로">‹</button>
        <span className="report-modal-eyebrow report-modal-step-title">위치 제보 확인</span>
        <h1 id="report-modal-title">이 위치와 주소가 맞습니까?</h1>
        <p className="report-modal-description">핀을 맞춘 위치를 마지막으로 확인해 주세요.</p>
        <div className="report-map-wrap report-confirm-map"><div ref={mapElementRef} className="report-map" /><span className="report-map-pin" aria-label="제안 위치" /></div>
        <div className="report-confirm-summary">
          <div><span>제보 화장실</span><strong>{toilet.name}</strong></div>
          <div><span>도로명 주소</span><strong>{roadAddress}</strong></div>
        </div>
        {error && <p className="report-error" role="alert">{error}</p>}
        <div className="report-confirm-actions"><button type="button" className="report-edit-button" onClick={() => setStep('location')}>수정하기</button><button type="button" className="report-submit" disabled={isSubmitting} onClick={() => void submit()}>{isSubmitting ? '접수 중…' : '맞아요, 접수하기'}</button></div>
      </>}
      {step === 'openTime' && <>
        <button type="button" className="report-back" onClick={() => setStep('choice')} aria-label="이전 화면으로">‹</button>
        <span className="report-modal-eyebrow report-modal-step-title">개방 시간 제보</span>
        <h1 id="report-modal-title">변경된 개방 시간을 알려주세요</h1>
        <p className="report-target"><span>제보 대상</span><strong>{toilet.name}</strong></p>
        <p className="report-modal-description">현재 등록된 시간: <strong>{toilet.openTime || '정보 없음'}</strong></p>
        <label className="report-field"><span>변경할 개방 시간</span><input value={openTime} maxLength={50} onChange={(event) => setOpenTime(event.target.value)} placeholder="예: 09:00 ~ 18:00" /></label>
        <label className="report-field"><span>제보 사유</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="예: 현장 안내문 기준으로 변경되었습니다." /></label>
        {error && <p className="report-error" role="alert">{error}</p>}
        <button type="button" className="report-submit" disabled={isSubmitting} onClick={() => void submit()}>{isSubmitting ? '접수 중…' : '개방 시간 제보 접수'}</button>
      </>}
      {step === 'complete' && <div className="report-complete"><span aria-hidden="true">✓</span><h1 id="report-modal-title">제보를 접수했어요</h1><p>처리 상태는 내 제보에서 언제든 확인할 수 있어요.</p><div className="report-complete-actions"><button type="button" className="report-edit-button" onClick={onClose}>지도 돌아가기</button><button type="button" className="report-submit" onClick={onViewMyReports}>내 제보 보기</button></div></div>}
    </section>
  </div>
}
