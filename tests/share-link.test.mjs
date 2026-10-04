import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFacilityShareLink } from '../src/lib/shareLink.ts'
import { buildAnalyticsAcquisition } from '../src/lib/analytics.ts'

test('shared links preserve all languages and carry only fixed referral categories', () => {
  for (const [locale, prefix] of [['ko', ''], ['en', '/en'], ['ja', '/ja'], ['zh-CN', '/zh-cn'], ['zh-TW', '/zh-tw'], ['zh-HK', '/zh-hk']]) {
    for (const method of ['copy', 'share']) {
      const link = new URL(buildFacilityShareLink(123, locale, method))
      assert.equal(link.origin, 'https://geupddong.com')
      assert.equal(link.pathname, `${prefix}/toilet/123`)
      assert.deepEqual([...link.searchParams.keys()], ['utm_source', 'utm_medium'])
      assert.equal(link.searchParams.get('utm_source'), `${method}_link`)
      assert.equal(link.searchParams.get('utm_medium'), 'referral')
      assert.equal(link.hash, '')
      const acquisition = buildAnalyticsAcquisition(link.href, '')
      assert.equal(acquisition.utmSource, `${method}_link`)
      assert.equal(acquisition.utmMedium, 'referral')
      assert.equal(acquisition.acquisitionEvidence, 'UTM')
    }
  }
  for (const id of [0, -1, NaN, 1.2, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => buildFacilityShareLink(id, 'ko', 'copy'))
})
