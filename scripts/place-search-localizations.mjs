export const asianLocales = ['ja', 'zh-CN', 'zh-TW', 'zh-HK']

export function mergePlaceLocalizations(wikidataText, googleText = null, heldPairs = new Set(), officialOverrides = []) {
  if (heldPairs.size && !googleText?.trim()) throw new Error('Missing Google translation fallback dataset for holds')
  const [wikidataMetadata, ...wikidataRows] = wikidataText.trim().split(/\r?\n/).map(JSON.parse)
  if (wikidataMetadata.type !== 'dataset' || !wikidataMetadata.sourceSeedHash) throw new Error('Invalid Wikidata localizations')
  const rows = new Map()
  for (const row of wikidataRows) {
    if (row.type !== 'placeLocalization' || !row.id || rows.has(row.id)) throw new Error('Invalid Wikidata localization row')
    rows.set(row.id, { id: row.id, revision: row.revision ?? null, names: { ...row.names } })
  }
  if (googleText?.trim()) {
    const [googleMetadata, ...googleRows] = googleText.trim().split(/\r?\n/).map(JSON.parse)
    if (googleMetadata.type !== 'dataset' || googleMetadata.provider !== 'google-cloud-translation-basic-v2'
      || googleMetadata.sourceSeedHash !== wikidataMetadata.sourceSeedHash || googleMetadata.count !== googleRows.length) {
      throw new Error('Invalid Google translation fallback dataset')
    }
    const seen = new Set()
    for (const row of googleRows) {
      const key = `${row.id}:${row.locale}`
      if (row.type !== 'placeTranslationFallback' || !row.id || !asianLocales.includes(row.locale)
        || !row.name?.trim() || !row.englishName?.trim()
        || row.sourceLanguage !== 'en' || row.provider !== googleMetadata.provider
        || seen.has(key) || rows.get(row.id)?.names[row.locale]) {
        throw new Error(`Invalid or overriding Google translation fallback: ${key}`)
      }
      seen.add(key)
      if (row.needsReview || heldPairs.has(key)) continue
      const entry = rows.get(row.id) ?? { id: row.id, revision: null, names: {} }
      entry.names[row.locale] = { name: row.name.trim(), aliases: [], sourceLanguage: 'en',
        sourceEnglish: row.englishName.trim(), resolvedLanguage: row.requestedLanguage }
      rows.set(row.id, entry)
    }
    for (const key of heldPairs) {
      if (!seen.has(key)) throw new Error(`Unknown Google translation hold: ${key}`)
    }
  }
  const overridden = new Set()
  for (const override of officialOverrides) {
    const key = `${override.id}:${override.locale}`
    const entry = rows.get(override.id)
    const previous = entry?.names?.[override.locale]
    if (overridden.has(key) || !asianLocales.includes(override.locale)
      || !previous || previous.name !== override.previousName
      || typeof override.name !== 'string' || !override.name.trim()
      || !Array.isArray(override.aliases) || override.aliases.some(alias => typeof alias !== 'string' || !alias.trim())
      || !['ja', 'zh'].includes(override.sourceLanguage)
      || !override.sourceUrl?.startsWith('https://www.ictr.or.kr/')) {
      throw new Error(`Invalid official localization override: ${key}`)
    }
    overridden.add(key)
    entry.names[override.locale] = {
      name: override.name.trim(), aliases: override.aliases.map(alias => alias.trim()),
      sourceLanguage: override.sourceLanguage, sourceUrl: override.sourceUrl,
    }
  }
  return { metadata: wikidataMetadata, rows }
}
