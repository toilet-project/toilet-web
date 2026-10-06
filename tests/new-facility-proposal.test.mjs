import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyFacilityForm, facilityProposal } from '../src/lib/newFacilityProposal.ts'
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
test('free text preserves the original wording without inventing a confirmed policy', () => {
  const note = '평일 09:00~18:00, 주말·공휴일 휴무\n행사일 불규칙 운영, 기저귀 교환대 있음'
  const result = facilityProposal({...emptyFacilityForm, openTimeDetail: ` ${note} `})
  assert.equal(result.openTimeDetail, note)
  assert.equal(result.openTime, null)
  assert.equal(result.openingHours, null)
  assert.equal(result.diaperTable, null)
  assert.equal(facilityProposal(emptyFacilityForm).openTimeDetail, null)
})
test('every supported locale has basic info labels, never a Korean fallback', () => {
  for (const locale of ['en','ja','zh-CN','zh-TW','zh-HK']) {
    for (const key of ['newInfo','newInfoGuide','basicInfo','facilityType','hoursDetail','diaper','facilityPhone','unknown','invalidInfo']) {
      assert.ok(quickReportMessage(locale,key)); assert.doesNotMatch(quickReportMessage(locale,key), /[가-힣]/)
    }
  }
})

test('public intake uses one optional guided textarea, not a policy editor or duplicate note', () => {
  const fields = readFileSync(new URL('../src/components/NewFacilityFields.tsx',import.meta.url),'utf8')
  assert.match(fields, /<textarea[^>]+maxLength=\{255\}[^>]+disabled=\{disabled\}/)
  assert.match(fields, /placeholder=\{q\('newInfoGuide'\)\}/)
  assert.doesNotMatch(fields, /NewFacilityHours|hoursPolicy|type="time"/)
  assert.equal((fields.match(/<textarea/g) || []).length, 1)
  const modal = readFileSync(new URL('../src/components/QuickReportModal.tsx',import.meta.url),'utf8')
  assert.match(modal, /kind !== 'new' && <label[^>]+>[\s\S]*?q\('note'\)/)
  assert.match(modal, /input, select, textarea/)
})
test('new proposal fields are frozen during submission and keep existing report transport', () => {
  const source = readFileSync(new URL('../src/components/QuickReportModal.tsx',import.meta.url),'utf8')
  assert.match(source, /facilityInfo: facilityProposal\(facility\)/)
  assert.match(source, /<NewFacilityFields[^>]+disabled=\{busy\}/)
  assert.match(source, /checkValidity\(\)/)
})
