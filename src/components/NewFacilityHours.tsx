'use client'
import type { HoursForm } from '../lib/newFacilityProposal'
import { useLocale } from '../i18n/context'
import { quickReportMessage } from '../i18n/quickReportMessages'

export function NewFacilityHours({value,onChange,disabled}:{value: HoursForm; onChange:(value:HoursForm)=>void; disabled:boolean}) {
  const locale = useLocale(), q = (key: Parameters<typeof quickReportMessage>[1]) => quickReportMessage(locale,key)
  const days = ['mon','tue','wed','thu','fri','sat','sun'] as const
  const update = (index:number, row: Partial<HoursForm['schedules'][number]>) => onChange({...value,schedules:value.schedules.map((item,i)=>i===index?{...item,...row}:item)})
  return <fieldset className="new-report-schedule" disabled={disabled}>
    <div className="new-report-fields"><label className="report-field"><span>{q('hoursPolicy')}</span><select value={value.policy} onChange={event=>onChange({...value,policy:event.target.value as HoursForm['policy']})}>
      <option value="">{q('unknown')}</option>{([['ALWAYS','allDay'],['SCHEDULED','weekly'],['IRREGULAR','irregular'],['CLOSED','notOperating']] as const).map(([policy,key])=><option key={policy} value={policy}>{q(key)}</option>)}</select></label>
      <label className="report-field"><span>{q('holiday')}</span><select value={value.holidayPolicy} disabled={!value.policy || disabled} onChange={event=>onChange({...value,holidayPolicy:event.target.value as HoursForm['holidayPolicy']})}><option value="UNKNOWN">{q('unknown')}</option><option value="OPEN">{q('holidayOpen')}</option><option value="CLOSED">{q('dayOff')}</option></select></label></div>
    {value.policy==='SCHEDULED' && <div className="new-report-slots">{value.schedules.map((row,index)=><div className="new-report-slot" key={index}>
      <select aria-label={q('weekday')} value={row.dayOfWeek} onChange={event=>update(index,{dayOfWeek:Number(event.target.value)})}>{days.map((day,i)=><option key={day} value={i+1}>{q(day)}</option>)}</select>
      <input aria-label={q('startTime')} type="time" disabled={disabled||row.closed} required={!row.closed} value={row.startTime} onInput={event=>update(index,{startTime:event.currentTarget.value})}/><span>–</span>
      <input aria-label={q('endTime')} type="time" disabled={disabled||row.closed} required={!row.closed} value={row.endTime} onInput={event=>update(index,{endTime:event.currentTarget.value})}/>
      <label className="new-report-day-off"><input type="checkbox" checked={row.closed} onChange={event=>update(index,{closed:event.target.checked})}/>{q('dayOff')}</label>
      <button type="button" aria-label={q('removeTime')} onClick={()=>onChange({...value,schedules:value.schedules.filter((_,i)=>i!==index)})}>×</button>
    </div>)}<button className="new-report-add-time" type="button" onClick={()=>onChange({...value,schedules:[...value.schedules,{dayOfWeek:1,startTime:'',endTime:'',closed:false}]})}>+ {q('addTime')}</button><small>{q('overnight')}</small></div>}
  </fieldset>
}
