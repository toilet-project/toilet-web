import { useEffect, useRef, useState } from 'react'
import { createToiletReport } from '../api/reports'
import type { ToiletDetailResponse } from '../api/toilets'
import { createKakaoMap, reverseGeocodeKakaoCoordinates, type KakaoMapInstance } from '../lib/kakaoMap'

type ReportType = 'choice' | 'location' | 'locationConfirm' | 'openTime' | 'complete'
type Coordinates = { latitude: number; longitude: number }

export function ToiletReportModal({ toilet, latitude, longitude, onClose }: { toilet: ToiletDetailResponse; latitude: number; longitude: number; onClose: () => void }) {
  const [step, setStep] = useState<ReportType>('choice')
  const [coordinates, setCoordinates] = useState<Coordinates>({ latitude, longitude })
  const [roadAddress, setRoadAddress] = useState(toilet.roadAddress || toilet.jibunAddress || '')
  const [isAddressLoading, setIsAddressLoading] = useState(false)
  const [openTime, setOpenTime] = useState(toilet.openTime || '')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMapInstance | null>(null)
  const geocodeRequestRef = useRef(0)

  const updateAddress = async (next: Coordinates) => {
    const requestId = ++geocodeRequestRef.current
    setIsAddressLoading(true)
    try {
      const address = await reverseGeocodeKakaoCoordinates(next.latitude, next.longitude)
      if (requestId === geocodeRequestRef.current) setRoadAddress(address ?? '')
    } catch {
      if (requestId === geocodeRequestRef.current) setRoadAddress('')
    } finally {
      if (requestId === geocodeRequestRef.current) setIsAddressLoading(false)
    }
  }

  useEffect(() => {
    if (step !== 'location' || !mapElementRef.current) return
    let disposed = false

    void (async () => {
      const map = await createKakaoMap(mapElementRef.current!, { latitude, longitude })
      if (disposed) return
      mapRef.current = map
      const syncCenter = () => {
        const center = map.getCenter()
        const next = { latitude: center.getLat(), longitude: center.getLng() }
        setCoordinates(next)
        void updateAddress(next)
      }
      window.kakao.maps.event.addListener(map, 'idle', syncCenter)
      syncCenter()
    })()

    return () => { disposed = true; mapRef.current = null }
  }, [step, latitude, longitude])

  const openLocationConfirmation = () => {
    setError(null)
    if (!reason.trim()) { setError('제보 사유를 입력해 주세요.'); return }
    if (!roadAddress) { setError('표시된 도로명 주소를 확인해 주세요.'); return }
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
        <button type="button" className="report-back" onClick={() => setStep('choice')}>← 뒤로가기</button>
        <span className="report-modal-eyebrow">위치 제보</span>
        <h1 id="report-modal-title">지도를 움직여 핀을 맞춰 주세요</h1>
        <p className="report-target"><span>제보 대상</span><strong>{toilet.name}</strong></p>
        <div className="report-map-wrap"><div ref={mapElementRef} className="report-map" /><span className="report-map-pin" aria-label="제안 위치" /></div>
        <div className="report-address-box"><span>도로명 주소</span><strong>{isAddressLoading ? '주소를 확인하는 중…' : roadAddress || '도로명 주소를 찾지 못했습니다.'}</strong><small>{coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}</small></div>
        <label className="report-field"><span>제보 사유</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="예: 실제 화장실은 건물 동쪽 출입구 옆에 있습니다." /></label>
        {error && <p className="report-error" role="alert">{error}</p>}
        <button type="button" className="report-submit" disabled={isAddressLoading} onClick={openLocationConfirmation}>위치 제보 접수</button>
      </>}
      {step === 'locationConfirm' && <>
        <button type="button" className="report-back" onClick={() => setStep('location')}>← 수정하기</button>
        <span className="report-modal-eyebrow">위치 제보 확인</span>
        <h1 id="report-modal-title">이 위치와 주소가 맞습니까?</h1>
        <div className="report-confirm-summary">
          <div><span>제보 화장실</span><strong>{toilet.name}</strong></div>
          <div><span>핀을 맞춘 위치</span><strong>{coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}</strong></div>
          <div><span>도로명 주소</span><strong>{roadAddress}</strong></div>
        </div>
        {error && <p className="report-error" role="alert">{error}</p>}
        <div className="report-confirm-actions"><button type="button" className="report-edit-button" onClick={() => setStep('location')}>수정하기</button><button type="button" className="report-submit" disabled={isSubmitting} onClick={() => void submit()}>{isSubmitting ? '접수 중…' : '맞아요, 접수하기'}</button></div>
      </>}
      {step === 'openTime' && <>
        <button type="button" className="report-back" onClick={() => setStep('choice')}>← 뒤로가기</button>
        <span className="report-modal-eyebrow">개방 시간 제보</span>
        <h1 id="report-modal-title">변경된 개방 시간을 알려주세요</h1>
        <p className="report-target"><span>제보 대상</span><strong>{toilet.name}</strong></p>
        <p className="report-modal-description">현재 등록된 시간: <strong>{toilet.openTime || '정보 없음'}</strong></p>
        <label className="report-field"><span>변경할 개방 시간</span><input value={openTime} maxLength={50} onChange={(event) => setOpenTime(event.target.value)} placeholder="예: 09:00 ~ 18:00" /></label>
        <label className="report-field"><span>제보 사유</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="예: 현장 안내문 기준으로 변경되었습니다." /></label>
        {error && <p className="report-error" role="alert">{error}</p>}
        <button type="button" className="report-submit" disabled={isSubmitting} onClick={() => void submit()}>{isSubmitting ? '접수 중…' : '개방 시간 제보 접수'}</button>
      </>}
      {step === 'complete' && <div className="report-complete"><span aria-hidden="true">✓</span><h1 id="report-modal-title">제보를 접수했어요</h1><p>관리자가 확인한 뒤 반영합니다.</p><button type="button" className="report-submit" onClick={onClose}>확인</button></div>}
    </section>
  </div>
}
