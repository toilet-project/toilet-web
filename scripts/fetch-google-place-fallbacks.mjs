import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'data/place-search/place-search-seed-20260920.ndjson')
const wikidataPath = resolve(root, 'data/place-search/wikidata-localizations-20260921.ndjson')
const outputPath = resolve(root, 'data/place-search/google-translation-fallbacks-20260921.ndjson')
const execute = process.argv.includes('--execute')
const locales = ['ja', 'zh-CN', 'zh-TW', 'zh-HK']
// Cloud Translation NMT uses Traditional Chinese (zh-TW) for the Hong Kong variant.
const targetFor = locale => locale === 'zh-HK' ? 'zh-TW' : locale
const [seedMetadata, ...places] = (await readFile(sourcePath, 'utf8')).trim().split(/\r?\n/).map(JSON.parse)
const [wikidataMetadata, ...wikidataRows] = (await readFile(wikidataPath, 'utf8')).trim().split(/\r?\n/).map(JSON.parse)
if (seedMetadata.sourceHash !== wikidataMetadata.sourceSeedHash) throw new Error('Mismatched source seed')
const authored = new Map(wikidataRows.map(row => [row.id, row.names]))
const missing = places.filter(place => place.searchScope === 'preview').flatMap(place => locales
  .filter(locale => !authored.get(place.id)?.[locale])
  .map(locale => ({ id: place.id, locale, englishName: place.nameEn })))
const chars = missing.reduce((sum, row) => sum + row.englishName.length, 0)
if (chars > 10000) throw new Error('Translation request exceeds the 10,000-character task limit')
if (!execute) {
  console.log(JSON.stringify({ mode: 'dry-run', count: missing.length, charactersBeforeDeduplication: chars,
    byLocale: Object.fromEntries(locales.map(locale => [locale, missing.filter(row => row.locale === locale).length])),
    outputPath }))
  process.exit(0)
}
const key = process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY
if (!key) throw new Error('GOOGLE_CLOUD_TRANSLATION_API_KEY is required for --execute; never put it in the repository or command line')

const decoded = text => text.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, entity => ({
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'",
})[entity])
const translated = new Map()
for (const target of ['ja', 'zh-CN', 'zh-TW']) {
  const inputs = [...new Set(missing.filter(row => targetFor(row.locale) === target).map(row => row.englishName))]
  for (let offset = 0; offset < inputs.length; offset += 50) {
    const batch = inputs.slice(offset, offset + 50)
    const response = await fetch('https://translation.googleapis.com/language/translate/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-goog-api-key': key },
      body: JSON.stringify({ q: batch, source: 'en', target, format: 'text' }),
    })
    if (!response.ok) throw new Error(`Cloud Translation HTTP ${response.status} for ${target} batch ${offset / 50 + 1}`)
    const result = await response.json()
    const outputs = result?.data?.translations
    if (!Array.isArray(outputs) || outputs.length !== batch.length) throw new Error(`Incomplete Cloud Translation response for ${target}`)
    batch.forEach((name, index) => {
      const value = decoded(String(outputs[index]?.translatedText ?? '')).trim()
      if (!value || /[\u0000-\u001f\u007f]/u.test(value) || value.length > 160) {
        throw new Error(`Invalid translated name for ${target} at batch item ${index + 1}`)
      }
      translated.set(`${target}:${name}`, value)
    })
  }
}

const rows = missing.map(row => ({ type: 'placeTranslationFallback', ...row,
  name: translated.get(`${targetFor(row.locale)}:${row.englishName}`),
  sourceLanguage: 'en', requestedLanguage: targetFor(row.locale), provider: 'google-cloud-translation-basic-v2',
  needsReview: translated.get(`${targetFor(row.locale)}:${row.englishName}`).toLocaleLowerCase('en-US')
    === row.englishName.toLocaleLowerCase('en-US'),
}))
const metadata = { type: 'dataset', source: 'https://translation.googleapis.com/language/translate/v2',
  sourceSeedHash: seedMetadata.sourceHash, wikidataSourceSeedHash: wikidataMetadata.sourceSeedHash,
  translatedAt: new Date().toISOString(), sourceLanguage: 'en', provider: 'google-cloud-translation-basic-v2',
  reviewStatus: 'machine_translation_preview_only', count: rows.length,
  byLocale: Object.fromEntries(locales.map(locale => [locale, rows.filter(row => row.locale === locale).length])),
  charactersBeforeDeduplication: chars,
}
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${[metadata, ...rows].map(row => JSON.stringify(row)).join('\n')}\n`)
console.log(JSON.stringify({ outputPath, count: rows.length, needsReview: rows.filter(row => row.needsReview).length }))
