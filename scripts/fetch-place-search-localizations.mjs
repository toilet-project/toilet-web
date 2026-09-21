import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'data/place-search/place-search-seed-20260920.ndjson')
const outputPath = resolve(root, 'data/place-search/wikidata-localizations-20260921.ndjson')
const [metadata, ...records] = (await readFile(sourcePath, 'utf8')).trim().split(/\r?\n/).map(JSON.parse)
const ids = records.filter(place => place.searchScope === 'preview').map(place => place.id)
const languageMap = { ja: ['ja'], 'zh-CN': ['zh-cn', 'zh-hans'], 'zh-TW': ['zh-tw', 'zh-hant'], 'zh-HK': ['zh-hk', 'zh-hant'] }
const rows = []

for (let offset = 0; offset < ids.length; offset += 50) {
  const batch = ids.slice(offset, offset + 50)
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.search = new URLSearchParams({
    action: 'wbgetentities', ids: batch.join('|'), props: 'labels|aliases',
    languages: [...new Set(Object.values(languageMap).flat())].join('|'), languagefallback: '0', format: 'json',
  }).toString()
  let response
  for (let attempt = 0; attempt < 4; attempt++) {
    response = await fetch(url, { headers: { 'User-Agent': 'GeupddongPlaceSearch/1.0 (https://geupddong.com; public Wikidata label audit)' } })
    if (response.ok) break
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) throw new Error(`Wikidata ${response.status} at ${offset}`)
    await new Promise(done => setTimeout(done, 1000 * (attempt + 1)))
  }
  const body = await response.json()
  if (body.error || !body.entities || batch.some(id => !body.entities[id])) throw new Error(`Incomplete Wikidata batch at ${offset}`)
  for (const id of batch) {
    const entity = body.entities[id]
    const names = Object.fromEntries(Object.entries(languageMap).flatMap(([locale, keys]) => {
      // The API synthesizes Chinese regional variants even with languagefallback=0.
      // Permit an authored script-level label, never a different region's label.
      const key = keys.find(candidate => entity.labels?.[candidate]?.language === candidate
        && !entity.labels[candidate]['source-language'])
      const name = key ? entity.labels[key].value?.trim() : ''
      const hasLocaleScript = locale === 'ja'
        ? /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name)
        : /\p{Script=Han}/u.test(name)
      if (!name || name === id || !hasLocaleScript) return []
      const aliases = [...new Set((entity.aliases?.[key] ?? [])
        .filter(alias => alias.language === key && !alias['source-language'])
        .map(alias => alias.value?.trim()).filter(value => value && value !== name))]
      return [[locale, { name, aliases, sourceLanguage: key }]]
    }))
    if (Object.keys(names).length) rows.push({ type: 'placeLocalization', id, revision: entity.lastrevid, names })
  }
  process.stdout.write(`Wikidata labels ${Math.min(offset + batch.length, ids.length)}/${ids.length}\n`)
  await new Promise(done => setTimeout(done, 150))
}

const counts = Object.fromEntries(Object.keys(languageMap).map(locale => [locale, rows.filter(row => row.names[locale]).length]))
const header = {
  type: 'dataset', source: 'https://www.wikidata.org/w/api.php', license: 'CC0-1.0',
  regionalFallback: false, scriptFallback: true, sourceSeedHash: metadata.sourceHash,
  fetchedAt: new Date().toISOString(), eligibleCount: ids.length, counts,
}
await writeFile(outputPath, `${[header, ...rows].map(row => JSON.stringify(row)).join('\n')}\n`)
process.stdout.write(`${JSON.stringify({ outputPath, counts })}\n`)
