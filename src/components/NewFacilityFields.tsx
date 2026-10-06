'use client'
import type { FacilityForm } from '../lib/newFacilityProposal'
import { useLocale } from '../i18n/context'
import { quickReportMessage } from '../i18n/quickReportMessages'

export function NewFacilityFields({ value, onChange, disabled }: { value: FacilityForm; onChange: (value: FacilityForm) => void; disabled: boolean }) {
  const locale = useLocale(), q = (key: Parameters<typeof quickReportMessage>[1]) => quickReportMessage(locale, key)
  const set = (key: keyof FacilityForm, next: string) => onChange({ ...value, [key]: next })
  const text = (key: keyof FacilityForm, label: Parameters<typeof quickReportMessage>[1], max: number, tel = false) =>
    <label className="report-field" key={key}><span>{q(label)}</span><input value={value[key]} maxLength={max} type={tel ? 'tel' : 'text'} disabled={disabled} onChange={event => set(key, event.target.value)} /></label>
  return <>
    <div className="new-report-hours"><label className="report-field"><span>{q('newHours')}</span><input value={value.openTime} maxLength={50} placeholder="09:00–18:00" disabled={disabled} onChange={event => set('openTime', event.target.value)} /></label>
      <button className="new-report-24h" type="button" aria-pressed={value.openTime === '24시간'} disabled={disabled} onClick={() => set('openTime', value.openTime === '24시간' ? '' : '24시간')}>{q('allDay')}</button></div>
    <details className="new-report-extra"><summary>{q('basicInfo')}</summary><div className="new-report-fields">
      <label className="report-field"><span>{q('facilityType')}</span><select value={value.toiletType} disabled={disabled} onChange={event => set('toiletType', event.target.value)}>
        <option value="">{q('unknown')}</option>{([['공중','public'], ['개방','open'], ['이동','portable'], ['간이','temporary'], ['기타','other']] as const).map(([type,label]) => <option key={type} value={type}>{q(label)}</option>)}</select></label>
      {text('openTimeDetail', 'hoursDetail', 255)}
      {([['emergencyBell','bell'], ['cctv','cctv'], ['diaperTable','diaper']] as const).map(([key,label]) => <label className="report-field" key={key}><span>{q(label)}</span><select value={value[key]} disabled={disabled} onChange={event => set(key, event.target.value)}><option value="">{q('unknown')}</option><option value="true">{q('available')}</option><option value="false">{q('unavailable')}</option></select></label>)}
      {(['maleDisabledToiletCount','femaleDisabledToiletCount'] as const).map((key,index) => <label className="report-field" key={key}><span>{q(index === 0 ? 'maleAccessibleCount' : 'femaleAccessibleCount')}</span><input type="number" min="0" max="999" step="1" inputMode="numeric" placeholder={q('unknown')} value={value[key]} disabled={disabled} onChange={event => set(key, event.target.value)} /></label>)}
      {text('agencyName', 'agency', 100)}{text('phoneNumber', 'facilityPhone', 20, true)}
    </div></details>
  </>
}
