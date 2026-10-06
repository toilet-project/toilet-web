import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyFacilityForm, facilityProposal, hoursProposal } from '../src/lib/newFacilityProposal.ts'
import { quickReportMessage } from '../src/i18n/quickReportMessages.ts'
import { readFileSync } from 'node:fs'

test('unknown stays null, explicit no stays false and known zero stays zero', () => {
  const input = { ...emptyFacilityForm, openTime: ' 24시간 ', emergencyBell: 'true', cctv: 'false', femaleDisabledToiletCount: '0' }
  const info = facilityProposal(input)
  assert.equal(info.openTime, '24시간'); assert.equal(info.emergencyBell, true)
  assert.equal(info.cctv, false); assert.equal(info.diaperTable, null)
  assert.equal(info.maleDisabledToiletCount, null); assert.equal(info.femaleDisabledToiletCount, 0)
  assert.equal(emptyFacilityForm.openTime, '')
})
test('weekly hours retain holidays, day off, multiple slots and overnight semantics', () => {
  const result = hoursProposal({policy:'SCHEDULED',holidayPolicy:'CLOSED',schedules:[{dayOfWeek:1,startTime:'20:00',endTime:'02:00',closed:false},{dayOfWeek:1,startTime:'09:00',endTime:'12:00',closed:false},{dayOfWeek:7,startTime:'',endTime:'',closed:true}]})
  assert.equal(result.holidayPolicy,'CLOSED'); assert.equal(result.schedules[0].crossesMidnight,true)
  assert.equal(result.schedules[1].slotIndex,1); assert.equal(result.schedules[2].startTime,null)
  assert.equal(hoursProposal(emptyFacilityForm.openingHours),null)
  for (const policy of ['ALWAYS','IRREGULAR','CLOSED']) assert.deepEqual(hoursProposal({policy,holidayPolicy:'OPEN',schedules:[]}).schedules,[])
  assert.throws(()=>hoursProposal({policy:'SCHEDULED',holidayPolicy:'UNKNOWN',schedules:[]}),/invalidHours/)
  assert.throws(()=>hoursProposal({policy:'SCHEDULED',holidayPolicy:'UNKNOWN',schedules:[{dayOfWeek:1,startTime:'09:00',endTime:'09:00',closed:false}]}),/invalidHours/)
})
test('every supported locale has basic info labels, never a Korean fallback', () => {
  for (const locale of ['en','ja','zh-CN','zh-TW','zh-HK']) {
    for (const key of ['newHours','basicInfo','facilityType','hoursDetail','diaper','facilityPhone','unknown','invalidInfo']) {
      assert.ok(quickReportMessage(locale,key)); assert.doesNotMatch(quickReportMessage(locale,key), /[가-힣]/)
    }
  }
})
test('new proposal fields are frozen during submission and keep existing report transport', () => {
  const source = readFileSync(new URL('../src/components/QuickReportModal.tsx',import.meta.url),'utf8')
  assert.match(source, /facilityInfo: facilityProposal\(facility\)/)
  assert.match(source, /<NewFacilityFields[^>]+disabled=\{busy\}/)
  assert.match(source, /checkValidity\(\)/)
})
