'use client'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { clampCropOffset, clampPhotoZoom, createCropGeometry, MAX_PHOTO_ZOOM, MIN_PHOTO_ZOOM, PROFILE_PHOTO_CROP_SIZE, type CropOffset } from '../lib/profilePhotoCrop'
import { useDialogFocus } from '../lib/useDialogFocus'

type Point = { x: number; y: number }
type Gesture =
  | { kind: 'drag'; pointer: number; start: Point; offset: CropOffset }
  | { kind: 'pinch'; distance: number; center: Point; zoom: number; offset: CropOffset }

function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y) }
function midpoint(a: Point, b: Point) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }

export function ProfilePhotoCropDialog({ file, onClose, onApply }: {
  file: File
  onClose: () => void
  onApply: (cropped: Blob) => Promise<boolean>
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [stageSize, setStageSize] = useState(0)
  const [zoom, setZoom] = useState(MIN_PHOTO_ZOOM)
  const [offset, setOffset] = useState<CropOffset>({ x: 0, y: 0 })
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const zoomRef = useRef(zoom), offsetRef = useRef(offset)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  const dialog = useDialogFocus(true, () => { if (!exporting) onClose() })

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const next = new Image()
    next.decoding = 'async'
    next.onload = () => { setImage(next); setZoom(MIN_PHOTO_ZOOM); setOffset({ x: 0, y: 0 }); setError('') }
    next.onerror = () => setError('사진을 불러오지 못했어요. 다른 사진을 선택해 주세요.')
    next.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!stage.current) return
    const measure = () => setStageSize(stage.current?.clientWidth ?? 0)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage.current)
    return () => observer.disconnect()
  }, [])

  function applyTransform(nextZoom: number, nextOffset: CropOffset) {
    const safeZoom = clampPhotoZoom(nextZoom)
    const safeOffset = image ? clampCropOffset(image.naturalWidth, image.naturalHeight, stageSize, safeZoom, nextOffset) : { x: 0, y: 0 }
    zoomRef.current = safeZoom; offsetRef.current = safeOffset
    setZoom(safeZoom); setOffset(safeOffset)
  }

  useEffect(() => {
    if (!image || !canvas.current || stageSize <= 0) return
    const target = canvas.current
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1)
    target.width = Math.max(1, Math.round(stageSize * pixelRatio))
    target.height = target.width
    const context = target.getContext('2d')
    if (!context) { setError('사진 편집 화면을 준비하지 못했어요.'); return }
    const geometry = createCropGeometry(image.naturalWidth, image.naturalHeight, stageSize, zoom, offset)
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, stageSize, stageSize)
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
    context.drawImage(image, geometry.drawX, geometry.drawY, geometry.drawWidth, geometry.drawHeight)
  }, [image, offset, stageSize, zoom])

  useEffect(() => {
    if (image && stageSize > 0) applyTransform(zoomRef.current, offsetRef.current)
    // Re-clamp after orientation or viewport changes without resetting the chosen crop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, stageSize])

  function startGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!image || exporting) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const active = [...pointers.current.entries()]
    if (active.length === 1) gesture.current = { kind: 'drag', pointer: event.pointerId, start: active[0][1], offset: offsetRef.current }
    else if (active.length >= 2) {
      const a = active[0][1], b = active[1][1]
      gesture.current = { kind: 'pinch', distance: Math.max(1, distance(a, b)), center: midpoint(a, b), zoom: zoomRef.current, offset: offsetRef.current }
    }
  }

  function moveGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const active = [...pointers.current.entries()]
    if (gesture.current.kind === 'drag' && active.length === 1 && gesture.current.pointer === event.pointerId) {
      const point = active[0][1]
      applyTransform(zoomRef.current, { x: gesture.current.offset.x + point.x - gesture.current.start.x, y: gesture.current.offset.y + point.y - gesture.current.start.y })
    } else if (gesture.current.kind === 'pinch' && active.length >= 2) {
      const a = active[0][1], b = active[1][1], center = midpoint(a, b)
      const nextZoom = gesture.current.zoom * distance(a, b) / gesture.current.distance
      applyTransform(nextZoom, { x: gesture.current.offset.x + center.x - gesture.current.center.x, y: gesture.current.offset.y + center.y - gesture.current.center.y })
    }
  }

  function endGesture(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const active = [...pointers.current.entries()]
    gesture.current = active.length === 1 ? { kind: 'drag', pointer: active[0][0], start: active[0][1], offset: offsetRef.current } : null
  }

  async function save() {
    if (!image || stageSize <= 0 || exporting) return
    setExporting(true); setError('')
    try {
      const geometry = createCropGeometry(image.naturalWidth, image.naturalHeight, stageSize, zoomRef.current, offsetRef.current)
      const output = document.createElement('canvas')
      output.width = PROFILE_PHOTO_CROP_SIZE; output.height = PROFILE_PHOTO_CROP_SIZE
      const context = output.getContext('2d')
      if (!context) throw new Error('canvas')
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
      context.drawImage(image, geometry.sourceX, geometry.sourceY, geometry.sourceSize, geometry.sourceSize, 0, 0, output.width, output.height)
      const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, 'image/webp', .9))
      if (!blob || blob.type !== 'image/webp' || blob.size <= 0 || blob.size > 2 * 1024 * 1024) throw new Error('blob')
      if (await onApply(blob)) onClose()
      else setError('사진을 저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    } catch { setError('사진을 자르지 못했어요. 다른 사진으로 다시 시도해 주세요.') }
    finally { setExporting(false) }
  }

  return <div className="photo-crop-backdrop" onPointerDown={event => { if (!exporting && event.target === event.currentTarget) onClose() }}>
    <section ref={dialog} className="photo-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-crop-title" aria-describedby="photo-crop-help" tabIndex={-1}>
      <header><button type="button" onClick={onClose} disabled={exporting}>취소</button><h2 id="photo-crop-title">사진 맞추기</h2><button type="button" className="photo-crop-apply" onClick={() => void save()} disabled={!image || exporting}>{exporting ? '저장 중…' : '이대로 사용'}</button></header>
      <div ref={stage} className="photo-crop-stage" onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture}>
        <canvas ref={canvas} role="img" aria-label="선택한 프로필 사진의 잘라낼 영역 미리보기" />
        <div className="photo-crop-grid" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="photo-crop-avatar-guide" aria-hidden="true" />
        {!image && !error && <p role="status">사진을 불러오는 중…</p>}
      </div>
      <p id="photo-crop-help">사진을 움직이고 확대해 원 안에 표시할 부분을 맞춰 주세요. 격자 안의 정사각형 영역만 전송됩니다.</p>
      <div className="photo-crop-zoom">
        <button type="button" aria-label="사진 축소" disabled={!image || exporting || zoom <= MIN_PHOTO_ZOOM} onClick={() => applyTransform(zoom - .1, offset)}>−</button>
        <label htmlFor="profile-photo-zoom">확대</label>
        <input id="profile-photo-zoom" type="range" aria-label="사진 확대" min={MIN_PHOTO_ZOOM} max={MAX_PHOTO_ZOOM} step="0.01" value={zoom} disabled={!image || exporting} onChange={event => applyTransform(Number(event.target.value), offsetRef.current)} />
        <button type="button" aria-label="사진 확대" disabled={!image || exporting || zoom >= MAX_PHOTO_ZOOM} onClick={() => applyTransform(zoom + .1, offset)}>＋</button>
      </div>
      <button type="button" className="photo-crop-reset" disabled={!image || exporting} onClick={() => applyTransform(MIN_PHOTO_ZOOM, { x: 0, y: 0 })}>가운데로 다시 맞추기</button>
      {error && <p className="photo-crop-error" role="alert">{error}</p>}
    </section>
  </div>
}
