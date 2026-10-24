import assert from 'node:assert/strict'
import test from 'node:test'
import { SUPPORTED_LOCALES } from '../src/i18n/locale.ts'
import { reviewModerationGuide, reviewModerationReasonCodes } from '../src/i18n/reviewModerationGuide.ts'
import { reviewModerationPolicyPublication, reviewModerationPolicyPublicationAttributes } from '../src/lib/reviewModerationPolicyPublication.ts'
import { reviewPolicyPublication } from '../src/lib/reviewPolicyPublication.ts'

test('moderation publication cannot overwrite the existing location review policy marker', () => {
  const attributes = reviewModerationPolicyPublicationAttributes(reviewModerationPolicyPublication)
  assert.equal(reviewModerationPolicyPublication.version, 'review-moderation-v1')
  assert.equal(attributes['data-review-moderation-policy-status'], reviewModerationPolicyPublication.status)
  assert.equal(attributes['data-review-policy-status'], undefined)
  assert.equal(reviewPolicyPublication.version, 'location-verified-reviews-v1')
  assert.equal(reviewPolicyPublication.effectiveAt, '2026-09-12T09:30:00Z')
  assert.throws(() => reviewModerationPolicyPublicationAttributes({ ...reviewModerationPolicyPublication, status: 'published', announcedAt: null }))
})

test('all supported languages include all five reasons, protections, consequences and appeals', () => {
  assert.deepEqual(reviewModerationReasonCodes, ['SPAM', 'ABUSE', 'PERSONAL_INFORMATION', 'IRRELEVANT', 'MANIPULATION'])
  for (const locale of SUPPORTED_LOCALES) {
    const copy = reviewModerationGuide[locale]
    assert.deepEqual(Object.keys(copy.reasons), reviewModerationReasonCodes, locale)
    for (const [key, value] of Object.entries(copy)) {
      if (key === 'reasons') for (const pair of Object.values(value)) assert.ok(pair.every(text => text.trim().length > 0), locale)
      else assert.ok(value.trim().length > 0, `${locale}: ${key}`)
    }
    assert.match(copy.effects, /24/, locale)
    if (locale !== 'ko') assert.doesNotMatch(JSON.stringify(copy), /[가-힣]/, locale)
  }
})
