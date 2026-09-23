import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { toiletTypeLabel } from '../src/i18n/facilityLabels.ts'
import { mapSystemNotice, localizeMapLabels } from '../src/i18n/mapLabels.ts'
import { formatOpenTime, formatInstallationDate, formatFacilityLocation, formatLastUpdatedAt, hasVisibleKoreanOriginal } from '../src/lib/detailFormatting.ts'
import { message } from '../src/i18n/messages.ts'
import { fallbackToiletDisplayLanguages, localizeToilet, localizeToiletMapItem, localizeToiletMapSearch } from '../src/i18n/toiletTranslations.ts'

test('only exact structured categories translate and unreviewed opening hours do not pretend to be translated', () => {
  assert.equal(toiletTypeLabel('공중화장실', 'en'), 'Public')
  assert.equal(toiletTypeLabel('개방화장실', 'en'), 'Open')
  assert.equal(toiletTypeLabel('간이화장실', 'en'), 'Portable')
  assert.equal(toiletTypeLabel('이동화장실', 'en'), 'Portable')
  for (const value of ['사유 시설 이름', '__proto__', '서울 화장실']) assert.equal(toiletTypeLabel(value, 'en'), value)
  assert.equal(toiletTypeLabel(undefined, 'en'), 'Restroom')
  assert.equal(formatOpenTime({ openTime: '평일 오전 9시', openTimeDetail: '이용 제한 원문' }, 'en'), 'Opening hours under review')
  assert.equal(formatOpenTime({ openTime: '평일 오전 9시', openTimeDetail: '이용 제한 원문' }, 'ko'), '평일 오전 9시 · 이용 제한 원문')
  assert.equal(formatOpenTime({}, 'en'), 'Opening hours unavailable')
  assert.equal(formatInstallationDate('202609', 'en'), '2026-09')
  assert.equal(formatInstallationDate('202609'), '2026년 9월')
  assert.equal(formatFacilityLocation('장애인화장실 + 남자화장실 + 여자화장실', 'en'), 'Accessible / Men / Women')
  assert.equal(formatFacilityLocation('장애인화장실 + 남자화장실 + 여자화장실'), '장애인화장실 / 남자화장실 / 여자화장실')
  assert.equal(formatFacilityLocation('여자화장실 입구', 'en'), '여자화장실 입구')
  assert.equal(formatLastUpdatedAt(null, 'en'), 'Unavailable')
  assert.equal(formatLastUpdatedAt(null, 'ko'), '확인할 수 없음')
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /<small>대<\/small>/)
})
test('normalized opening-hour decisions render from the same values in Korean and English', () => {
  const always = { openTime: '정시', openTimeDetail: '24시간', normalizedOpeningHours: {
    openingPolicy: 'ALWAYS', open24h: true, status: 'PARSED', confidence: 1, parserVersion: 'v1',
    holidayPolicy: 'OPEN', manualOverride: false, sourceChanged: false, schedules: [],
  } }
  assert.equal(formatOpenTime(always, 'ko'), '24시간 운영 · 공휴일 운영')
  assert.equal(formatOpenTime(always, 'en'), 'Open 24 hours · Open on public holidays')

  const scheduled = { openTime: '정시', openTimeDetail: '평일 09:00~18:00', normalizedOpeningHours: {
    openingPolicy: 'SCHEDULED', open24h: false, status: 'CONFIRMED', confidence: 1, parserVersion: 'v1',
    holidayPolicy: 'CLOSED', manualOverride: true, sourceChanged: false,
    schedules: [1, 2, 3, 4, 5].map(dayOfWeek => ({ dayOfWeek, slotIndex: 0, startTime: '09:00', endTime: '18:00', crossesMidnight: false, closed: false })),
  } }
  assert.equal(formatOpenTime(scheduled, 'ko'), '평일 09:00–18:00 · 공휴일 휴무')
  assert.equal(formatOpenTime(scheduled, 'en'), 'Weekdays 09:00–18:00 · Closed on public holidays')

  const changed = { ...always, normalizedOpeningHours: { ...always.normalizedOpeningHours, sourceChanged: true } }
  assert.equal(formatOpenTime(changed, 'en'), 'Opening hours under review')
})

test('Japanese and regional Chinese detail labels use the selected language without translating free-form source fields', () => {
  const always = { openTime: '24시간 원문', normalizedOpeningHours: {
    openingPolicy: 'ALWAYS', open24h: true, status: 'PARSED', sourceChanged: false, holidayPolicy: 'OPEN', schedules: [],
  } }
  const scheduled = { openTime: '평일 원문', normalizedOpeningHours: {
    openingPolicy: 'SCHEDULED', open24h: false, status: 'CONFIRMED', sourceChanged: false, holidayPolicy: 'CLOSED',
    schedules: [1, 2, 3, 4, 5].map(dayOfWeek => ({ dayOfWeek, slotIndex: 0, startTime: '09:00', endTime: '18:00', crossesMidnight: false, closed: false })),
  } }
  const expected = {
    ja: ['24時間利用可 · 祝日も利用可', '平日 09:00–18:00 · 祝日は利用不可', 'バリアフリー / 男性用 / 女性用'],
    'zh-CN': ['24小时开放 · 节假日开放', '工作日 09:00–18:00 · 节假日不开放', '无障碍 / 男用 / 女用'],
    'zh-TW': ['24小時開放 · 國定假日開放', '平日 09:00–18:00 · 國定假日不開放', '無障礙 / 男用 / 女用'],
    'zh-HK': ['24小時開放 · 公眾假期開放', '平日 09:00–18:00 · 公眾假期休息', '無障礙 / 男用 / 女用'],
  }
  for (const [locale, [allDay, weekdays, facilities]] of Object.entries(expected)) {
    assert.equal(formatOpenTime(always, locale), allDay)
    assert.equal(formatOpenTime(scheduled, locale), weekdays)
    assert.equal(formatOpenTime({ openTime: '평일 원문' }, locale), '평일 원문')
    assert.equal(formatFacilityLocation('장애인화장실 + 남자화장실 + 여자화장실', locale), facilities)
    assert.equal(formatFacilityLocation('여자화장실 입구', locale), '여자화장실 입구')
    assert.equal(formatInstallationDate('202609', locale), '2026年9月')
    assert.doesNotMatch(formatLastUpdatedAt(null, locale), /[가-힣]/)
  }
})
test('Korean source notice reflects only Korean text still visible after field-level translations', () => {
  const translated = {
    name: 'Seoul Station Restroom', roadAddress: '405 Hangang-daero, Seoul', jibunAddress: '',
    agencyName: '', openTime: '', openTimeDetail: '', hasEmergencyBell: 'N', emergencyBellLocation: '',
    hasDiaperTable: 'N', diaperTableLocation: '', region: null,
  }
  assert.equal(hasVisibleKoreanOriginal(translated, 'ko'), false)
  assert.equal(hasVisibleKoreanOriginal(translated, 'ja'), false)
  assert.equal(hasVisibleKoreanOriginal({ ...translated, openTime: '정시', openTimeDetail: '09:00~18:00' }, 'ja'), true)
  assert.equal(hasVisibleKoreanOriginal({ ...translated, agencyName: '서울특별시' }, 'zh-CN'), true)
  assert.equal(hasVisibleKoreanOriginal({ ...translated, region: { sidoName: '서울특별시', sigunguName: '중구' } }, 'zh-TW'), true)
  assert.equal(hasVisibleKoreanOriginal({ ...translated, emergencyBellLocation: '안내실', hasEmergencyBell: 'Y' }, 'zh-HK'), true)
  const korean = { ...translated, name: '서울역 화장실', translations: { ja: { name: 'ソウル駅トイレ', roadAddress: null, jibunAddress: null } } }
  assert.equal(hasVisibleKoreanOriginal(korean, 'ja'), false)
  assert.equal(korean.name, '서울역 화장실')
})
test('system notices have safe English fallbacks without leaking arbitrary server errors', () => {
  assert.equal(mapSystemNotice('검색 결과가 없습니다.', 'en'), 'No places found.')
  for (const value of ['private-error-value', '__proto__']) assert.doesNotMatch(mapSystemNotice(value, 'en'), /private-error-value|__proto__/)
  assert.equal(mapSystemNotice('검색 결과가 없습니다.', 'ko'), '검색 결과가 없습니다.')
})
test('current API translations are selected by locale with field-level display fallback', () => {
  const canonical = {
    id: 1, name: '서울역 화장실', roadAddress: '서울특별시 중구 한강대로 405', jibunAddress: '서울특별시 중구 봉래동2가',
    translations: { en: { name: 'Seoul Station Restroom', roadAddress: '405 Hangang-daero, Jung-gu, Seoul', jibunAddress: null } },
  }
  const english = localizeToilet(canonical, 'en')
  assert.equal(english.name, 'Seoul Station Restroom')
  assert.equal(english.roadAddress, '405 Hangang-daero, Jung-gu, Seoul')
  assert.equal(english.jibunAddress, canonical.jibunAddress)
  assert.strictEqual(localizeToilet(canonical, 'ko'), canonical)
  const untranslated = { ...canonical, translations: {} }
  assert.strictEqual(localizeToilet(untranslated, 'en'), untranslated)
  const blankName = { ...canonical, translations: {
    en: { name: ' ', roadAddress: '405 Hangang-daero, Jung-gu, Seoul', jibunAddress: null },
  } }
  assert.equal(localizeToilet(blankName, 'en').name, canonical.name)
  assert.equal(localizeToilet(blankName, 'en').roadAddress, '405 Hangang-daero, Jung-gu, Seoul')

  const regional = { ...canonical, translations: {
    zh: { name: 'Generic Chinese - must not leak' },
    'zh-CN': { name: '简体名称' }, 'zh-TW': { name: '繁體名稱' },
  } }
  assert.equal(localizeToilet(regional, 'zh-CN').name, '简体名称')
  assert.equal(localizeToilet(regional, 'zh-TW').name, '繁體名稱')
  assert.equal(localizeToilet(regional, 'zh-HK').name, '简体名称')
  assert.strictEqual(localizeToilet({ ...canonical, translations: { zh: regional.translations.zh } }, 'zh-CN').name, canonical.name)

  const partial = { ...canonical, translations: {
    'zh-TW': { name: '臺灣名稱', roadAddress: ' ', jibunAddress: null },
    'zh-CN': { name: '简体名称', roadAddress: '简体道路地址', jibunAddress: ' ' },
    en: { name: 'English name', roadAddress: 'English road address', jibunAddress: 'English lot address' },
  } }
  const taiwan = localizeToilet(partial, 'zh-TW')
  assert.deepEqual([taiwan.name, taiwan.roadAddress, taiwan.jibunAddress],
    ['臺灣名稱', '简体道路地址', 'English lot address'])
  assert.deepEqual(fallbackToiletDisplayLanguages(partial, 'zh-TW'), ['zh-CN'])
  const hongKong = localizeToilet(partial, 'zh-HK')
  assert.deepEqual([hongKong.name, hongKong.roadAddress, hongKong.jibunAddress],
    ['简体名称', '简体道路地址', 'English lot address'])
  assert.deepEqual(fallbackToiletDisplayLanguages(partial, 'zh-HK'), ['zh-CN'])
  const englishOnly = { ...canonical, translations: { en: partial.translations.en } }
  assert.equal(localizeToilet(englishOnly, 'zh-HK').name, 'English name')
  assert.deepEqual(fallbackToiletDisplayLanguages(englishOnly, 'zh-HK'), ['en'])
  const mixed = { ...canonical, translations: {
    'zh-CN': { name: '简体名称', roadAddress: null, jibunAddress: null },
    en: { name: 'English name', roadAddress: 'English road address', jibunAddress: null },
  } }
  assert.deepEqual([localizeToilet(mixed, 'zh-HK').name, localizeToilet(mixed, 'zh-HK').roadAddress],
    ['简体名称', 'English road address'])
  assert.deepEqual(fallbackToiletDisplayLanguages(mixed, 'zh-HK'), ['zh-CN', 'en'])
  const exactHongKong = { ...mixed, translations: { ...mixed.translations,
    'zh-HK': { name: '香港名稱', roadAddress: '香港地址', jibunAddress: null },
  } }
  assert.equal(localizeToilet(exactHongKong, 'zh-HK').name, '香港名稱')
  assert.deepEqual(fallbackToiletDisplayLanguages(exactHongKong, 'zh-HK'), [])
  assert.strictEqual(localizeToilet(untranslated, 'zh-HK'), untranslated)
  assert.deepEqual(fallbackToiletDisplayLanguages(untranslated, 'zh-HK'), [])
  assert.deepEqual(fallbackToiletDisplayLanguages(partial, 'en'), [])

  const response = { meta: { map_level: 3, display_type: 'MARKER', total_count: 1, result_count: 1 }, toilets: [{ ...canonical, latitude: 37.5, longitude: 127 }], clusters: [] }
  assert.equal(localizeToiletMapSearch(response, 'en').toilets[0].name, 'Seoul Station Restroom')
  assert.equal(localizeToiletMapSearch(response, 'ko').toilets[0].name, '서울역 화장실')
})
test('administrator display-group names use a locale translation with Korean fallback', () => {
  const translated = localizeToiletMapItem({
    id: 11, name: '문화원 1층', latitude: 37, longitude: 127,
    displayGroupId: 7, displayGroupName: '우리문화원', displayGroupTranslations: { en: 'Woori Cultural Center' },
  }, 'en')
  assert.equal(translated.displayGroupName, 'Woori Cultural Center')

  const fallback = localizeToiletMapItem({
    id: 12, name: '문화원 2층', latitude: 37, longitude: 127,
    displayGroupId: 7, displayGroupName: '우리문화원',
  }, 'en')
  assert.equal(fallback.displayGroupName, '우리문화원')

  const regional = { ...fallback, displayGroupTranslations: {
    'zh-CN': '简体文化院', en: 'Cultural Center', 'zh-TW': '臺灣文化院',
  } }
  assert.equal(localizeToiletMapItem(regional, 'zh-TW').displayGroupName, '臺灣文化院')
  assert.equal(localizeToiletMapItem(regional, 'zh-HK').displayGroupName, '简体文化院')
  assert.equal(localizeToiletMapItem({ ...regional, displayGroupTranslations: { ...regional.displayGroupTranslations, 'zh-HK': ' ' } }, 'zh-HK').displayGroupName, '简体文化院')
  assert.equal(localizeToiletMapItem({ ...regional, displayGroupTranslations: { en: 'Cultural Center' } }, 'zh-HK').displayGroupName, 'Cultural Center')
  assert.equal(localizeToiletMapItem(fallback, 'zh-HK').displayGroupName, '우리문화원')
})
test('map overlays relabel in place and preserve original named groups', () => {
  const nodes = [
    { dataset: { mapLabel: 'group', mapCount: '2', mapName: '관리자 원문 장소' }, textContent: '원문 표시' },
    { dataset: { mapLabel: 'group', mapCount: '3', mapName: '' }, textContent: '동일 위치 3' },
  ].map(node => ({ ...node, attributes: {}, setAttribute(key, value) { this.attributes[key] = value } }))
  const root = { querySelectorAll: () => nodes }
  localizeMapLabels(root, 'en')
  assert.equal(nodes[0].textContent, '원문 표시')
  assert.equal(nodes[0].attributes['aria-label'], 'View 2 restrooms at 관리자 원문 장소')
  assert.equal(nodes[1].textContent, 'Same location 3')
  localizeMapLabels(root, 'ko')
  assert.equal(nodes[1].textContent, '동일 위치 3')
})
test('public review identity is translated only for removed authors; text and anonymous nicknames stay original', () => {
  const source = readFileSync(new URL('../src/components/reviews/PublicReviews.tsx', import.meta.url), 'utf8')
  assert.match(source, /item.authorRemoved \? t\('public.anonymous'\) : item.authorDisplayName/)
  assert.match(source, /className="public-review-comment">\{locale !== 'ko' && <small className="original-text-tag">\{t\('content.original'\)\}<\/small>\}\{comment\}/)
  assert.match(source, /timeZone: 'Asia\/Seoul'/)
  assert.equal(message('en', 'public.summary', { rating: '4.5', count: 2 }), 'Overall rating 4.5 out of 5, 2 reviews')
})
test('CI enables multilingual UI only for the approved preview and production targets', () => {
  const source = readFileSync(new URL('../.github/workflows/workers-validation.yml', import.meta.url), 'utf8')
  assert.match(source, /ENGLISH_UI_PREVIEW:.*matrix.target == 'preview' && 'true' \|\| 'false'/)
  assert.match(source, /ENGLISH_UI_RELEASE:.*matrix.target == 'production-candidate' && 'true' \|\| 'false'/)
})
