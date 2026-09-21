import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { DEFAULT_LOCALE, LOCALE_OPTIONS, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, isLocale, readLocalePreference, rememberLocale } from '../src/i18n/locale.ts'
import { isMapPath, isLanguageOnlyNavigation, localeForPath, localizedPublicPath, localizedToiletPaths, parseLocalizedPublicPath } from '../src/i18n/routes.ts'
import { message, messages } from '../src/i18n/messages.ts'
import { mapNavigationPath } from '../src/lib/navigationCache.ts'
import { parseMapResume } from '../src/lib/appUpdate.ts'
import { sanitizeAnalyticsPagePath } from '../src/lib/analytics.ts'
import { englishHomeMetadata, englishHomeData, englishToiletMetadata, englishPlaceData } from '../src/i18n/seo.ts'
import { LANGUAGE_LOGIN_RETURN_KEY, saveLanguageLoginReturn, consumeLanguageLoginReturn } from '../src/i18n/loginReturn.ts'
import { localizeToiletDetail } from '../src/i18n/toiletTranslations.ts'
import { localizeMapLabels, mapSystemNotice } from '../src/i18n/mapLabels.ts'

test('display labels do not replace standards-based locale identifiers', () => {
  assert.equal(DEFAULT_LOCALE, 'ko')
  assert.deepEqual(SUPPORTED_LOCALES, ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'])
  assert.deepEqual(LOCALE_OPTIONS.map(({ label }) => label), ['KOR', 'EN', 'JA', '简', '繁', '繁'])
  for (const invalid of ['KOR', 'EN', 'en-US', 'jp', '__proto__', null, 1]) assert.equal(isLocale(invalid), false)
})

test('KO URLs stay stable and English URLs use a single /en prefix', () => {
  for (const path of ['/', '/toilet/123', '/policies/terms', '/policies/privacy', '/policies/location', '/policies/all']) {
    const en = localizedPublicPath(path, 'en')
    assert.equal(localizedPublicPath(en, 'ko'), path)
    assert.equal(localizedPublicPath(en, 'en'), en)
    assert.equal(parseLocalizedPublicPath(path).locale, 'ko')
    assert.equal(parseLocalizedPublicPath(en).locale, 'en')
  }
  assert.equal(localizedPublicPath('/', 'en'), '/en')
  assert.equal(localizedPublicPath('/en/', 'ko'), '/')
  assert.equal(localizedPublicPath('/toilet/123/', 'en'), '/en/toilet/123')
})

test('language conversion preserves existing query/hash without inventing location parameters', () => {
  assert.equal(localizedPublicPath('/toilet/123?q=park#details', 'en'), '/en/toilet/123?q=park#details')
  assert.equal(localizedPublicPath('/en?query=%EA%B3%B5%EC%9B%90', 'ko'), '/?query=%EA%B3%B5%EC%9B%90')
})

test('Asian locale routes keep Chinese regions and translated policy pages independent', () => {
  for (const [locale, prefix] of [['ja', '/ja'], ['zh-CN', '/zh-cn'], ['zh-TW', '/zh-tw'], ['zh-HK', '/zh-hk']]) {
    assert.equal(localizedPublicPath('/', locale), prefix)
    assert.equal(localizedPublicPath('/toilet/123?q=x#card', locale), `${prefix}/toilet/123?q=x#card`)
    assert.equal(parseLocalizedPublicPath(`${prefix}/toilet/123`).locale, locale)
    assert.equal(localeForPath(`${prefix}/toilet/123`), locale)
    assert.equal(localizedPublicPath(`${prefix}/toilet/123`, 'ko'), '/toilet/123')
    assert.equal(isLanguageOnlyNavigation('/toilet/123', `${prefix}/toilet/123`), true)
    assert.equal(localizedPublicPath('/policies/terms', locale), `${prefix}/policies/terms`)
    assert.equal(localizedPublicPath(`${prefix}/policies/privacy#analytics`, locale), `${prefix}/policies/privacy#analytics`)
    assert.equal(sanitizeAnalyticsPagePath(`${prefix}/toilet/123?secret=x`), '/toilet/:id')
  }
  for (const path of ['/zh', '/zh-CN', '/zh-cn-extra', '/ja-extra', '/zh-hk/../toilet/1']) assert.equal(parseLocalizedPublicPath(path), null)
  assert.notEqual(message('zh-CN', 'detail.title'), message('zh-TW', 'detail.title'))
  assert.notEqual(message('zh-TW', 'metric.paper'), message('zh-HK', 'metric.paper'))
})

test('Asian fixed UI dictionaries are complete while source and user text remain outside the dictionary', () => {
  for (const locale of ['ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
    for (const key of Object.keys(messages.ko)) {
      assert.doesNotMatch(messages[locale][key], /[가-힣]/, `${locale}:${key}`)
      assert.notEqual(messages[locale][key], messages.ko[key], `${locale}:${key}`)
    }
    for (const [key, invariant] of [['auth.ageNote', '14'], ['review.existingQuestion', '24'], ['review.invalidComment', '200'], ['account.retainChoice', '3']]) {
      assert.ok(message(locale, key).includes(invariant), `${locale}:${key}`)
    }
    assert.match(message(locale, 'review.detachDetails'), /匿名/)
  }
  assert.notEqual(message('zh-CN', 'review.paper'), message('zh-HK', 'review.paper'))
})

test('facility translations select the exact Chinese region and keep missing fields in Korean', () => {
  const toilet = { name: '원문 화장실', roadAddress: '원문 도로명', jibunAddress: '원문 지번',
    translations: {
      en: { name: 'English restroom', roadAddress: 'English road', jibunAddress: null },
      ja: { name: '日本語のトイレ', roadAddress: null, jibunAddress: null },
      zh: { name: '通用中文', roadAddress: '通用地址', jibunAddress: null },
      'zh-CN': { name: '简体卫生间', roadAddress: '简体地址', jibunAddress: null },
      'zh_TW': { name: '繁體廁所', roadAddress: null, jibunAddress: null },
    } }
  assert.equal(localizeToiletDetail(toilet, 'ja').name, '日本語のトイレ')
  assert.equal(localizeToiletDetail(toilet, 'ja').roadAddress, '원문 도로명')
  assert.equal(localizeToiletDetail(toilet, 'zh-CN').roadAddress, '简体地址')
  assert.equal(localizeToiletDetail(toilet, 'zh-TW').name, '繁體廁所')
  assert.deepEqual(localizeToiletDetail(toilet, 'zh-HK'), toilet)
  assert.equal(localizeToiletDetail(toilet, 'en').jibunAddress, '원문 지번')
})

test('map notices follow the selected language and Korean reference marker stays Korean', () => {
  const notice = '현재 위치를 확인하지 못했습니다.'
  assert.equal(mapSystemNotice(notice, 'ko'), notice)
  for (const locale of ['ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
    assert.notEqual(mapSystemNotice(notice, locale), notice)
    assert.ok(mapSystemNotice('알 수 없는 오류', locale))
  }
  const label = { textContent: '' }
  const marker = { dataset: { mapLabel: 'reference' }, attributes: {}, setAttribute(key, value) { this.attributes[key] = value }, querySelector() { return label } }
  localizeMapLabels({ querySelectorAll() { return [marker] } }, 'ko')
  assert.equal(marker.attributes['aria-label'], '거리 기준점')
  assert.equal(label.textContent, '기준점')
})

test('admin, API, assets, verification and external/traversal routes cannot be localized', () => {
  for (const path of ['/api/v1/toilets/1', '/admin-toilets-preview/', '/admin-duplicates', '/_next/a.js', '/sitemap.xml', '/review-preview', '/review-verification/1', '/enough', '/en/en', '/ko', '/toilet/01', '/toilet/0', '/toilet/9007199254740992', '/toilet/../123', '/en/../toilet/1', '/en//toilet/1', '/%65n/toilet/1', '/toilet/%31', 'https://evil.example', '//evil.example', '/\\evil.example', '/en\n']) {
    assert.equal(localizedPublicPath(path, 'en'), null, path)
  }
  assert.equal(localizedPublicPath('/', '__proto__'), null)
})

test('facility invalidation paths cover every language without changing raw facility identity', () => {
  assert.deepEqual(localizedToiletPaths(123), ['/toilet/123', '/en/toilet/123', '/ja/toilet/123', '/zh-cn/toilet/123', '/zh-tw/toilet/123', '/zh-hk/toilet/123'])
  for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => localizedToiletPaths(id))
})

test('stored preference is optional, bounded, and cannot override explicit route language', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(readLocalePreference(storage), null)
  assert.equal(rememberLocale(storage, 'en'), true)
  assert.equal(readLocalePreference(storage), 'en')
  assert.equal(parseLocalizedPublicPath('/').locale, 'ko')
  values.set(LOCALE_STORAGE_KEY, 'arbitrary')
  assert.equal(readLocalePreference(storage), null)
  const denied = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
  assert.equal(readLocalePreference(denied), null)
  assert.equal(rememberLocale(denied, 'en'), false)
  assert.equal(rememberLocale(storage, 'KOR'), false)
})

test('initial dictionaries have matching, nonempty keys and fixed UI policy wording only', () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.deepEqual(Object.keys(messages.ko).sort(), Object.keys(messages[locale]).sort())
    for (const key of Object.keys(messages.ko)) {
      assert.ok(message(locale, key).trim())
      const tokens = value => [...value.matchAll(/\{\w+\}/g)].map(match => match[0]).sort()
      assert.deepEqual(tokens(message(locale, key)), tokens(message('ko', key)), `${locale}:${key}`)
    }
  }
  assert.match(message('en', 'review.nearbyRequired'), /150 m/)
})

test('language selector uses fixed local flags, keyboard controls, and no remote translation', async () => {
  const component = await readFile(new URL('../src/components/LanguageSelector.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/components/language-selector.css', import.meta.url), 'utf8')
  assert.match(component, /aria-haspopup="menu"/)
  assert.match(component, /role="menuitemradio"/)
  assert.match(component, /event.key === 'Escape'/)
  assert.match(component, /'ArrowDown', 'ArrowUp', 'Home', 'End'/)
  assert.match(component, /removeEventListener\('pointerdown', outside\)/)
  assert.doesNotMatch(component, /fetch\(|document.cookie|localStorage|location.assign/)
  assert.match(css, /prefers-reduced-motion/)
  assert.match(css, /min-height: 44px/)
  for (const option of LOCALE_OPTIONS) {
    const flag = await readFile(new URL(`../public${option.flag}`, import.meta.url), 'utf8')
    assert.match(flag, /<svg /)
    assert.doesNotMatch(flag, /<script|<image|<foreignObject|href="https?:/)
  }
})

test('locale-only navigation is distinguished from selecting/closing a facility', () => {
  assert.equal(isLanguageOnlyNavigation('/', '/en'), true)
  assert.equal(isLanguageOnlyNavigation('/toilet/123', '/en/toilet/123'), true)
  for (const next of ['/en/toilet/124', '/en', '/toilet/123', '/en/policies/terms']) assert.equal(isLanguageOnlyNavigation('/toilet/123', next), false)
  assert.equal(localeForPath('/enough'), 'ko')
  assert.equal(localeForPath('/en/toilet/1'), 'en')
  assert.equal(localeForPath('/review-verification/1'), 'ko')
  assert.equal(isMapPath('/en/policies/terms'), false)
})

test('English navigation/resume retains the same bounded local map-state rules', () => {
  const origin = 'https://geupddong.com'
  assert.equal(mapNavigationPath('/en/toilet/123?secret=discard', origin), '/en/toilet/123')
  assert.equal(mapNavigationPath('https://evil.example/en/toilet/123', origin), null)
  const now = Date.now(), point = { latitude: 36.3, longitude: 127.3 }
  const value = { path: '/en/toilet/123', center: point, reference: point, currentLocation: null, source: 'point', level: 4, expanded: true, savedAt: now }
  assert.deepEqual(parseMapResume(JSON.stringify(value), value.path, now), value)
  assert.equal(parseMapResume(JSON.stringify(value), '/toilet/123', now), null)
})

test('English analytics do not expose IDs or fragment/query values', () => {
  assert.equal(sanitizeAnalyticsPagePath('/en/toilet/123?token=secret#private'), '/toilet/:id')
  assert.equal(sanitizeAnalyticsPagePath('/en'), '/')
})

test('English metadata keeps facility names and physical-place identity unchanged', () => {
  const detail = { id: 123, name: '시험 화장실', latitude: 36.3, longitude: 127.3, roadAddress: '시험 주소' }
  assert.equal(englishToiletMetadata(detail).title, '시험 화장실 — Restroom in Korea')
  assert.match(englishToiletMetadata(detail).description, /Visiting Korea\?.*Restroom/)
  const place = englishPlaceData(detail)
  assert.equal(place['@id'], 'https://geupddong.com/toilet/123#place')
  assert.equal(place.url, 'https://geupddong.com/en/toilet/123')
  assert.equal(place.name, detail.name)
  assert.equal(place.address.streetAddress, detail.roadAddress)
  assert.equal(place.description, englishToiletMetadata(detail).description)
})

test('English presentation distinguishes restrooms from fixtures and introduces Korea to travelers', () => {
  assert.match(englishHomeMetadata.title, /public restrooms in Korea/)
  assert.match(englishHomeMetadata.description, /travelers in Korea/)
  const home = englishHomeData()
  for (const entity of home['@graph']) {
    assert.equal(entity.url, 'https://geupddong.com/en')
    assert.equal(entity.inLanguage, 'en-US')
    assert.equal(entity.description, englishHomeMetadata.description)
  }
  assert.match(message('en', 'map.subtitle'), /Korea.*travelers/)
  assert.equal(message('en', 'detail.toilets'), 'Toilets')
  const fixtureKeys = new Set(['detail.toilets', 'detail.accessibleToilets', 'detail.childToilets', 'detail.maleToilets', 'detail.femaleToilets'])
  for (const [key, value] of Object.entries(messages.en)) {
    if (!fixtureKeys.has(key)) assert.doesNotMatch(value, /\btoilets?\b(?![- ]paper)/i, key)
    assert.doesNotMatch(value, /restroom[- ]paper/i, key)
  }
  const original = { id: 123, name: 'Original Toilet Name' }
  assert.equal(englishPlaceData(original).name, original.name)
  assert.match(englishToiletMetadata(original).title, /^Original Toilet Name/)
})

test('the same map owns both routes; English preview remains gated and unindexed', async () => {
  const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  const shell = await read('src/components/MapShell.tsx')
  const app = await read('src/App.tsx')
  assert.match(shell, /key=\{testToiletHash\}/)
  assert.doesNotMatch(shell, /key=\{(?:locale|path|route.path)\}/)
  assert.match(app, /if \(languageOnly\) return/)
  assert.match(app, /!snapshot && !initialRouteRef\.current\.detail && !resume && !testToilet/)
  assert.match(await read('next.config.ts'), /SITE_INDEXABLE === 'false' && process.env.ENGLISH_UI_PREVIEW === 'true'/)
  assert.match(await read('next.config.ts'), /SITE_INDEXABLE === 'true' && process.env.ENGLISH_UI_RELEASE === 'true'/)
  assert.match(await read('src/app/(map)/en/layout.tsx'), /robots: \{ index: false, follow: false \}/)
  assert.match(await read('src/app/%255Finternal/cache/revalidate/route.ts'), /for \(const path of localizedToiletPaths\(id\)\) revalidatePath\(path\)/)
})

test('login restores only a recent local English route and never hijacks ordinary visits', () => {
  const values = new Map(), now = Date.now()
  const store = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  saveLanguageLoginReturn(store, '/en/toilet/123', now)
  assert.equal(consumeLanguageLoginReturn(store, null, now), null)
  assert.ok(values.has(LANGUAGE_LOGIN_RETURN_KEY))
  assert.equal(consumeLanguageLoginReturn(store, 'success', now), '/en/toilet/123')
  assert.equal(consumeLanguageLoginReturn(store, 'success', now), null)
  for (const path of ['https://evil.example', '//evil.example/en', '/en?token=x', '/en#location', '/en/policies/terms', '/admin', '/']) {
    saveLanguageLoginReturn(store, path, now)
    assert.equal(consumeLanguageLoginReturn(store, 'success', now), null)
  }
  for (const savedAt of [now - 16 * 60_000, now + 1, 'invalid']) {
    values.set(LANGUAGE_LOGIN_RETURN_KEY, JSON.stringify({ path: '/en', savedAt }))
    assert.equal(consumeLanguageLoginReturn(store, 'success', now), null)
  }
  saveLanguageLoginReturn(store, '/en', now)
  assert.equal(consumeLanguageLoginReturn(store, 'failed', now), '/en')
})
