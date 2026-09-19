import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { accountDate, accountError, policyDisplayPath, policyTitle } from '../src/i18n/accountLabels.ts'
import { policyTranslationSourceSha256 } from '../src/i18n/policyTranslation.ts'
import { message } from '../src/i18n/messages.ts'
import { saveLanguageLoginReturn, consumeLanguageLoginReturn } from '../src/i18n/loginReturn.ts'
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n')

test('only current verified policy paths are localized; versions and archives never silently upgrade', () => {
  for (const path of ['/policies/terms', '/policies/terms#age', '/policies/privacy#collection', '/policies/all', '/policies/location']) {
    assert.equal(policyDisplayPath(path, 'en', '1.0'), '/en' + path)
    for (const version of [undefined, '0.9', '2.0', '__proto__']) assert.equal(policyDisplayPath(path, 'en', version), path)
    assert.equal(policyDisplayPath(path, 'ko', '1.0'), path)
  }
  for (const path of ['/policy-history/2026-09-01.html#terms', '/policies/terms?version=old', '/policies/terms#missing', 'https://evil.example/policies/terms', '//evil.example/policies/terms']) assert.equal(policyDisplayPath(path, 'en', '1.0'), path)
  assert.equal(policyTitle('en', 'AGE_14_PLUS', '원문'), 'Confirmation of Age 14 or Older')
  assert.equal(policyTitle('en', 'unknown', '원문'), '원문')
  assert.equal(policyTitle('ko', 'SERVICE_TERMS', '원문'), '원문')
  for (const key of ['menu.terms', 'menu.privacy', 'menu.location', 'policy.terms', 'policy.privacy']) assert.doesNotMatch(message('en', key), /Korean/)
})

test('account dates remain in Korea time and only fixed errors are translated', () => {
  for (const locale of ['ko', 'en']) {
    assert.equal(accountDate('2026-12-20T00:30:00', locale), accountDate('2026-12-19T15:30:00Z', locale))
    assert.equal(accountDate('invalid', locale), '—')
  }
  assert.equal(accountDate('2026-09-01', 'en', true), '01/09/2026')
  assert.match(accountError(new Error('인증 시간이 만료됐어요. 다시 소셜 로그인한 뒤 계정 상태를 확인해 주세요.'), 'en', 'account.withdrawError'), /expired/)
  for (const text of ['private payload', '__proto__']) assert.doesNotMatch(accountError(new Error(text), 'en', 'account.withdrawError'), new RegExp(text))
  assert.match(message('en', 'account.closedPending'), /still pending/)
  assert.match(message('en', 'account.closedErased'), /service database/)
  assert.match(message('en', 'account.retainDetails'), /not retained for recovery/)
})

test('recovery callback returns to a bounded English map route without storing account data', () => {
  const values = new Map(), now = Date.now()
  const store = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  saveLanguageLoginReturn(store, '/en/toilet/123', now)
  assert.equal(consumeLanguageLoginReturn(store, 'recovery', now), '/en/toilet/123')
  assert.equal(consumeLanguageLoginReturn(store, 'recovery', now), null)
  saveLanguageLoginReturn(store, 'https://evil.example/en', now)
  assert.equal(consumeLanguageLoginReturn(store, 'recovery', now), null)
})

test('translation tracks reviewed Korean source, clause structure and policy publication markers', () => {
  const ko = read('src/components/PolicyPage.tsx'), en = read('src/components/EnglishPolicyPage.tsx')
  assert.equal(createHash('sha256').update(ko).digest('hex'), policyTranslationSourceSha256, 'Korean source changed: review translation before updating fingerprint')
  const clauseNumbers = source => [...source.matchAll(/<SectionHeading>(\d+(?:-\d+)?)\./g)].map(x => x[1])
  assert.deepEqual(clauseNumbers(en), clauseNumbers(ko))
  for (const tag of ['<li>', '<dt>', '<dd>']) assert.equal(en.split(tag).length, ko.split(tag).length, tag)
  for (const id of ['age', 'collection', 'analytics', 'profile-photo-overseas', 'erasure-records', 'terms', 'privacy', 'location']) assert.ok(en.includes(`id="${id}"`))
  for (const marker of ['policyPublicationAttributes(accountPolicyPublication)', 'reviewPolicyPublicationAttributes(reviewPolicyPublication)', 'profilePhotoPolicyPublicationAttributes(profilePhotoPolicyPublication)']) assert.ok(en.includes(marker))
  for (const invariant of ['150 m', '50 m', '5 minutes', '24 hours', '7 days', '3 calendar months', '35 days', '32 days', '256×256', '14 days', 'privacy@geupddong.com', 'legal@cloudflare.com', 'Anonymous']) assert.ok(en.includes(invariant), invariant)
  assert.match(en, /not a statutory retention period or automatic deletion date/)
  assert.match(en, /does not mean all existing copies were erased simultaneously/)
  assert.match(en, /does not change the agreement conditions/)
  assert.doesNotMatch(ko, /선택 분석|분석 사용을 허용한 경우/)
  assert.doesNotMatch(en, /Optional analytics|if analytics is allowed/)
  assert.match(ko, /서비스 이용 통계: 페이지 유형/)
  assert.match(en, /Service usage statistics: page types/)
  for (const storage of ['sessionStorage', 'localStorage']) {
    assert.ok(ko.includes(storage))
    assert.ok(en.includes(storage))
    assert.ok(read('src/lib/analytics.ts').includes(storage))
  }
  assert.match(ko, /통계 수집 자체를 중지하는 기능은 아닙니다/)
  assert.match(en, /does not stop statistics collection/)
  assert.match(ko, /Google Analytics 쿠키는 사용하지 않습니다/)
  assert.match(en, /Google Analytics cookies are not used/)
})

test('English policies are preview gated; disclosure fails closed on missing fragments', () => {
  const route = read('src/app/en/policies/[kind]/page.tsx'), disclosure = read('src/components/PolicyDisclosure.tsx')
  assert.match(route, /!ENGLISH_UI_ENABLED \|\| !isKind\(kind\)/)
  assert.match(route, /index: false, follow: false/)
  assert.match(disclosure, /credentials: 'omit', mode: 'same-origin'/)
  assert.match(disclosure, /url.hash \? \(fragment && article\?\.contains\(fragment\) \? fragment : null\)/)
  assert.match(disclosure, /loaded\?\.path === displayPath/)
  assert.doesNotMatch(disclosure, /dangerouslySetInnerHTML/)
  const auth = read('src/api/auth.ts')
  assert.match(auth, /body: JSON.stringify\(\{ policyKeys \}\)/)
  assert.match(auth, /body: JSON.stringify\(\{ retainForRecovery, consentVersion \}\)/)
  assert.match(auth, /body: JSON.stringify\(\{ action \}\)/)
})
