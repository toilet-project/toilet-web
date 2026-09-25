import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { homeCopy, homeMetadata, homeStructuredData, facilityMetadataText, localizedPlaceData, socialMetadata } from '../src/i18n/pageSeo.ts'
import { SUPPORTED_LOCALES } from '../src/i18n/locale.ts'
import { allDistricts, getProvince, provinces, regionName } from '../src/lib/regions.ts'
import { regionSeoCopy } from '../src/i18n/regionSeoCopy.ts'
import snapshot from '../data/regions/toilet-district.json' with { type: 'json' }

test('every language has matching home title, description, social metadata and server schema', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const metadata = homeMetadata(locale)
    assert.equal(metadata.title.absolute, homeCopy[locale].title)
    assert.equal(metadata.openGraph.title, metadata.title.absolute)
    assert.equal(metadata.twitter.description, metadata.description)
    assert.ok(homeCopy[locale].heading && homeCopy[locale].intro && homeCopy[locale].regions)
    const data = homeStructuredData(locale)['@graph']
    assert.equal(data[0].description, metadata.description)
    assert.equal(data[0].inLanguage, locale)
    assert.equal(new URL(data[0].url).pathname, metadata.alternates.canonical)
  }
})

test('every province and district has distinct localized search copy within its language', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copies = [{}, ...provinces.map(p => ({ province: regionName(p, locale) })),
      ...allDistricts().map(d => ({ province: regionName(getProvince(d.provinceCode), locale), district: regionName(d, locale) }))].map(names => regionSeoCopy(locale, names))
    assert.equal(copies.length, 273)
    assert.equal(new Set(copies.map(copy => copy.title)).size, copies.length)
    for (const copy of copies) assert.ok(copy.description.trim())
  }
})

test('the complete Korean name snapshot yields descriptive metadata without mutating source names', () => {
  let checked = 0
  for (const [id, [, name]] of Object.entries(snapshot)) {
    const source = { id: Number(id), name, region: null, roadAddress: '', jibunAddress: '', latitude: null, longitude: null }
    const before = structuredClone(source)
    const result = facilityMetadataText(source, 'ko')
    assert.match(result.title, /화\s*장\s*실/u, id)
    assert.match(result.description, /위치, 개방시간과 시설 정보/, id)
    assert.doesNotMatch(result.description, /undefined|null/, id)
    assert.deepEqual(source, before)
    checked++
  }
  assert.ok(checked > 50_000)
})

test('all facility languages keep translated visible names/addresses and one physical Place identity', () => {
  const detail = { id: 13144, name: '공학1호관', roadAddress: '대전광역시 유성구 대학로 99', jibunAddress: '', latitude: 36.3, longitude: 127.3,
    translations: Object.fromEntries(SUPPORTED_LOCALES.filter(l => l !== 'ko').map(locale => [locale, { name: `${locale} Building One`, roadAddress: `${locale} University Road 99`, jibunAddress: '' }])) }
  const ko = localizedPlaceData(detail, 'ko')
  for (const locale of SUPPORTED_LOCALES.filter(l => l !== 'ko')) {
    const copy = facilityMetadataText(detail, locale), place = localizedPlaceData(detail, locale)
    assert.ok(copy.title.includes(detail.translations[locale].name))
    assert.ok(copy.description.includes(detail.translations[locale].roadAddress))
    assert.equal(place.name, detail.translations[locale].name)
    assert.equal(place.address.streetAddress, detail.translations[locale].roadAddress)
    assert.equal(place['@id'], ko['@id'])
    assert.deepEqual(place.geo, ko.geo)
    assert.equal('openingHours' in place, false, 'Do not fabricate machine-readable schedules')
  }
})

test('social image dimensions describe the actual asset, not an assumed OG size', () => {
  const png = readFileSync(new URL('../public/og-image.png', import.meta.url))
  const metadata = socialMetadata('Title', 'Description', '/', 'ko')
  const [image] = metadata.openGraph.images
  assert.equal(image.width, png.readUInt32BE(16))
  assert.equal(image.height, png.readUInt32BE(20))
  assert.ok(image.alt)
})
