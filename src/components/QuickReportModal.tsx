'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ToiletDetailResponse } from '../api/toilets'
import { QUICK_REPORTS_PREVIEW, submitQuickReport, type QuickReportRequest, type QuickReportType } from '../api/quickReports'
import type { ReportIdentity } from '../lib/quickReportTransport'
import { useLocale, useMessages } from '../i18n/context'
import { quickReportMessage } from '../i18n/quickReportMessages'
import { attachReportViewport } from '../lib/reportViewport'
import { addMapEventListener, createMap, destroyMap } from '../lib/mapProvider'
import { reverseGeocodeKakaoCoordinates } from '../lib/kakaoMap'
import { formatOpenTime } from '../lib/detailFormatting'
import { getDisplayAddress } from '../lib/address'
import { NewFacilityFields } from './NewFacilityFields'
import { emptyFacilityForm, facilityProposal } from '../lib/newFacilityProposal'

type Point = { latitude: number; longitude: number }
type Kind = 'missing' | 'location' | 'closed' | 'new'
const types: Record<Kind, QuickReportType> = { missing: 'FACILITY_MISSING', location: 'COORDINATE_CORRECTION', closed: 'TEMPORARILY_CLOSED', new: 'NEW_FACILITY' }

function ReportIcon({ kind }: { kind: Kind }) {
  return <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'missing' ? <><path d="M4 4h16v16H4zM8 8l8 8M16 8l-8 8" /></>
      : kind === 'closed' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2M5 5l-2-2M19 5l2-2" /></>
      : kind === 'new' ? <><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="9" /></>
      : <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>}
  </svg>
}

function ReportMap({ initial, fixed, onPoint, onReady }: { initial: Point; fixed: boolean; onPoint?: (point: Point) => void; onReady: () => void }) {
  const locale = useLocale()
  const element = useRef<HTMLDivElement>(null)
  const callback = useRef(onPoint)
  const ready = useRef(onReady)
  const [failed, setFailed] = useState(false)
  useEffect(() => { callback.current = onPoint }, [onPoint])
  useEffect(() => { ready.current = onReady }, [onReady])
  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined
    void createMap(element.current!, initial, 3, locale).then(map => {
      if (cancelled) { destroyMap(map); return }
      map.setDraggable(!fixed); map.setZoomable(!fixed)
      const observer = new ResizeObserver(() => map.relayout())
      observer.observe(element.current!)
      const sync = () => { const center = map.getCenter(); callback.current?.({ latitude: center.getLat(), longitude: center.getLng() }) }
      const remove = fixed ? () => {} : addMapEventListener(map, 'idle', sync)
      cleanup = () => { remove(); observer.disconnect(); destroyMap(map) }
      sync()
      ready.current()
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; cleanup?.() }
    // The initial center is deliberately frozen until this map step unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixed, locale])
  return <div className="report-map-wrap quick-report-map"><div ref={element} className="report-map" />
    {!failed && <span className="report-map-pin" aria-hidden="true" />}
    {failed && <p className="quick-map-error" role="alert">{quickReportMessage(locale, 'mapFailed')}</p>}
  </div>
}

export function QuickReportModal({ toilet, latitude, longitude, identity, onClose }: { toilet: ToiletDetailResponse; latitude: number; longitude: number; identity: ReportIdentity; onClose: () => void }) {
  const locale = useLocale(), t = useMessages()
  const q = (key: Parameters<typeof quickReportMessage>[1]) => quickReportMessage(locale, key)
  const [kind, setKind] = useState<Kind | null>(null)
  const [confirmed, setConfirmed] = useState<Point | null>(null)
  const [start, setStart] = useState<Point>({ latitude, longitude })
  const [mapReady, setMapReady] = useState(false)
  const [name, setName] = useState('')
  const [facility, setFacility] = useState(emptyFacilityForm)
  const [reason, setReason] = useState('')
  const [address, setAddress] = useState(getDisplayAddress(toilet.roadAddress, toilet.jibunAddress))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<number | null>(null)
  const [now, setNow] = useState(() => new Date())
  const dialog = useRef<HTMLDialogElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const point = useRef<Point>({ latitude, longitude })
  const flight = useRef(false)
  const submission = useRef<{ body: string; id: string } | null>(null)

  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    const detach = attachReportViewport(node)
    return () => { detach(); node.close() }
  }, [])
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer) }, [])
  useEffect(() => { content.current?.scrollTo(0, 0) }, [kind, confirmed, receipt])
  useEffect(() => {
    if (!confirmed) return
    let active = true
    void reverseGeocodeKakaoCoordinates(confirmed.latitude, confirmed.longitude).then(value => {
      if (active) setAddress(value || '')
    }).catch(() => { if (active) setAddress('') })
    return () => { active = false }
  }, [confirmed])

  const choose = (next: Kind) => {
    setKind(next); setConfirmed(null); setError(null); setReason(''); setName('')
    setFacility(emptyFacilityForm)
    setAddress(getDisplayAddress(toilet.roadAddress, toilet.jibunAddress))
    point.current = { latitude, longitude }; setStart({ latitude, longitude }); setMapReady(false); submission.current = null
  }
  const back = () => { if (busy) return; setError(null); setMapReady(false); if (confirmed) { setStart(confirmed); setConfirmed(null) } else setKind(null) }
  const submit = async () => {
    if (!kind || flight.current || (kind !== 'closed' && !mapReady)) return
    if (kind === 'new' && !name.trim()) { setError(q('nameRequired')); return }
    if (kind === 'new' && [...(content.current?.querySelectorAll<HTMLInputElement>('input, select') || [])].some(input => !input.checkValidity())) { setError(q('invalidInfo')); return }
    if ((kind === 'new' || kind === 'location') && !confirmed) return
    const request: QuickReportRequest = { reportType: types[kind], ...(kind === 'new' ? { name: name.trim(), facilityInfo: facilityProposal(facility) } : { toiletId: toilet.id }),
      ...(confirmed ? { ...confirmed, roadAddress: address, reason: reason.trim() } : {}) }
    const body = JSON.stringify(request)
    // Preserve the key when a response is lost; edited proposals receive a fresh key.
    if (submission.current?.body !== body) submission.current = { body, id: crypto.randomUUID() }
    flight.current = true; setBusy(true); setError(null)
    try { const result = await submitQuickReport(request, submission.current!.id, identity); setReceipt(result.id) }
    catch (failure) {
      const status = (failure as { status?: number }).status
      setError(status === 429 ? q('limited') : locale === 'ko' && failure instanceof Error && !/^[A-Z_]+$/.test(failure.message) ? failure.message : q('failed'))
    } finally { flight.current = false; setBusy(false) }
  }
  const moving = (kind === 'location' || kind === 'new') && !confirmed
  const close = () => { if (!flight.current) onClose() }
  if (typeof document === 'undefined') return null
  return createPortal(<dialog ref={dialog} className="report-modal-backdrop" aria-labelledby="quick-report-title" aria-modal="true"
    onCancel={event => { event.preventDefault(); close() }} onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <section className="report-modal quick-report">
      <header className="report-modal-toolbar">
        {kind && !receipt && <button type="button" className="report-back" disabled={busy} onClick={back} aria-label={t('common.back')}>‹</button>}
        <h2 id="quick-report-title" className="report-modal-step-title">{receipt ? q('complete') : kind ? q(kind) : q('title')}</h2>
        <button type="button" className="report-modal-close" disabled={busy} onClick={close} aria-label={t('report.close')}>×</button>
      </header>
      <div className="report-modal-content" ref={content} aria-busy={busy}>
        {!receipt && kind !== 'new' && <div className="quick-report-target"><span>{q('target')}</span><strong>{toilet.name}</strong></div>}
        {!kind && <div className="quick-report-options">{(['missing', 'location', 'closed', 'new'] as const).map(item =>
          <button type="button" key={item} onClick={() => choose(item)}><ReportIcon kind={item} /><strong>{q(item)}</strong><span>{q(`${item}Hint`)}</span></button>)}</div>}
        {!receipt && kind === 'missing' && <><ReportMap key="missing" initial={{ latitude, longitude }} fixed onReady={() => setMapReady(true)} /><h3 className="quick-report-question">{q('missingQuestion')}</h3></>}
        {!receipt && kind === 'closed' && <><dl className="quick-report-hours"><div><dt>{q('hours')}</dt><dd>{formatOpenTime(toilet, locale)}</dd></div>
          <div><dt>{q('now')}</dt><dd><time dateTime={now.toISOString()}>{new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(now)}</time><small>KST</small></dd></div></dl><h3 className="quick-report-question">{q('closedQuestion')}</h3></>}
        {!receipt && moving && <><p className="quick-report-guide">{q('move')}</p><ReportMap key={`${kind}-move`} initial={start} fixed={false} onPoint={value => { point.current = value }} onReady={() => setMapReady(true)} /><button type="button" className="report-submit" disabled={!mapReady} onClick={() => { setAddress(''); setMapReady(false); setConfirmed({ ...point.current }) }}>{q('next')}</button></>}
        {!receipt && confirmed && <><ReportMap key={`${kind}-confirm`} initial={confirmed} fixed onReady={() => setMapReady(true)} />
          <p className="quick-report-address">{address || `${confirmed.latitude.toFixed(6)}, ${confirmed.longitude.toFixed(6)}`}</p>
          {kind === 'new' ? <><label className="report-field"><span>{q('name')}</span><input value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)} placeholder={q('namePlaceholder')} autoComplete="off" /></label><NewFacilityFields value={facility} onChange={setFacility} disabled={busy} /></>
            : <h3 className="quick-report-question">{q('confirm')}</h3>}
          <label className="report-field"><span>{q('note')}</span><input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
          <button type="button" className="report-submit" disabled={busy || !mapReady || (kind === 'new' && !name.trim())} onClick={() => void submit()}>{q(busy ? 'sending' : 'submit')}</button></>}
        {!receipt && (kind === 'missing' || kind === 'closed') && <div className="report-confirm-actions"><button type="button" className="report-edit-button" disabled={busy} onClick={back}>{q('no')}</button><button type="button" className="report-submit" disabled={busy || (kind === 'missing' && !mapReady)} onClick={() => void submit()}>{q(busy ? 'sending' : 'yes')}</button></div>}
        {error && <p className="report-error" role="alert">{error}</p>}
        {receipt && <div className="report-complete"><span aria-hidden="true">✓</span><h3>{q('complete')}</h3><p>{q('review')}</p><small>#{receipt}</small><button type="button" className="report-submit" onClick={close}>{q('done')}</button></div>}
        {QUICK_REPORTS_PREVIEW && <p className="quick-report-preview">{q('preview')}</p>}
      </div>
    </section>
  </dialog>, document.body)
}
