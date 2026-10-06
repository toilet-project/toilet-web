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
