export function resolvePreviewSuppressions(metadata, records, config) {
  if (config?.sourceSeedHash !== metadata.sourceHash || !Array.isArray(config.entries)) {
    throw new Error('Invalid preview suppression source')
  }
  const byId = new Map(records.map(place => [place.id, place]))
  const suppressed = new Map()
  for (const entry of config.entries) {
    if (!entry.sourceId || !entry.reason?.trim() || !Array.isArray(entry.ids) || entry.ids.length === 0
      || !Number.isFinite(entry.latitude) || !Number.isFinite(entry.longitude)) {
      throw new Error('Invalid preview suppression entry')
    }
    for (const id of entry.ids) {
      const place = byId.get(id)
      const source = place?.officialCrosschecks?.find(row => row.sourceId === entry.sourceId)
      if (!place || suppressed.has(id) || place.searchScope !== 'preview' || place.productionApproved
        || !source || place.selectedCoordinate?.latitude !== entry.latitude
        || place.selectedCoordinate?.longitude !== entry.longitude
        || source.coordinate?.latitude !== entry.latitude
        || source.coordinate?.longitude !== entry.longitude) {
        throw new Error(`Invalid preview suppression target: ${id}`)
      }
      suppressed.set(id, { sourceId: entry.sourceId, reason: entry.reason })
    }
  }
  return suppressed
}
