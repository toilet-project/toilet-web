import assert from 'node:assert/strict'
import test from 'node:test'
import { mergePlaceLocalizations } from '../scripts/place-search-localizations.mjs'

const wikidata = [
  { type: 'dataset', sourceSeedHash: 'test-seed' },
  { type: 'placeLocalization', id: 'Q1', revision: 3, names: {
    ja: { name: '既存名', aliases: [], sourceLanguage: 'ja', resolvedLanguage: 'ja' },
  } },
].map(JSON.stringify).join('\n')
const fallback = [
  { type: 'dataset', sourceSeedHash: 'test-seed', provider: 'google-cloud-translation-basic-v2', count: 2 },
  { type: 'placeTranslationFallback', id: 'Q1', locale: 'zh-CN', name: '补充名', englishName: 'Supplement', sourceLanguage: 'en',
    requestedLanguage: 'zh-CN', provider: 'google-cloud-translation-basic-v2' },
  { type: 'placeTranslationFallback', id: 'Q2', locale: 'ja', name: '翻訳名', englishName: 'Translation', sourceLanguage: 'en',
    requestedLanguage: 'ja', provider: 'google-cloud-translation-basic-v2' },
].map(JSON.stringify).join('\n')

test('adds machine translations only for missing place and locale pairs', () => {
  const { rows } = mergePlaceLocalizations(wikidata, fallback)
  assert.equal(rows.get('Q1').names.ja.name, '既存名')
  assert.equal(rows.get('Q1').names['zh-CN'].name, '补充名')
  assert.equal(rows.get('Q1').names['zh-CN'].sourceLanguage, 'en')
  assert.equal(rows.get('Q2').names.ja.name, '翻訳名')
  assert.equal(rows.get('Q2').revision, null)
})

test('rejects machine translations that overwrite source-authored names', () => {
  const lines = fallback.split('\n').map(JSON.parse)
  lines[1].locale = 'ja'
  assert.throws(() => mergePlaceLocalizations(wikidata, lines.map(JSON.stringify).join('\n')), /overriding/)
})

test('keeps English fallback for a held or unchanged machine translation', () => {
  const lines = fallback.split('\n').map(JSON.parse)
  lines[2].needsReview = true
  const { rows } = mergePlaceLocalizations(wikidata, lines.map(JSON.stringify).join('\n'), new Set(['Q1:zh-CN']))
  assert.equal(rows.get('Q1').names['zh-CN'], undefined)
  assert.equal(rows.get('Q2'), undefined)
  assert.throws(() => mergePlaceLocalizations(wikidata, fallback, new Set(['Q9:ja'])), /Unknown Google translation hold/)
  assert.throws(() => mergePlaceLocalizations(wikidata, null, new Set(['Q1:zh-CN'])), /Missing Google translation fallback/)
})
