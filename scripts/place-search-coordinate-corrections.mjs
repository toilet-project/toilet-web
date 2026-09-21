const distanceMetres = (a, b) => {
  const radians = Math.PI / 180
  const latitude = (a.latitude + b.latitude) / 2 * radians
  return Math.hypot(
    (a.latitude - b.latitude) * 111_200,
    (a.longitude - b.longitude) * 111_200 * Math.cos(latitude),
  )
}

export function resolvePreviewCoordinateCorrections(metadata, records, config) {
  if (config?.sourceSeedHash !== metadata.sourceHash
    || !Array.isArray(config.entries) || config.entries.length !== 20
    || config.supersededSourceId !== 'incheon-transit-official-pages-20260920'
    || config.source?.url !== 'https://data.kric.go.kr/rips/M_01_01/detail.do?id=214'
    || !/^[a-f0-9]{64}$/.test(config.source?.fileSha256 ?? '')
    || config.source.sheet !== 'Sheet1' || config.source.latitudeColumn !== 'D'
    || config.source.longitudeColumn !== 'E') {
    throw new Error('Invalid preview coordinate correction source')
  }
  const byId = new Map(records.map(place => [place.id, place]))
  const corrections = new Map()
  const usedRows = new Set()
  const usedCoordinates = new Set()
  for (const entry of config.entries) {
    const place = byId.get(entry.id)
    const previous = config.previousCoordinate
    const source = place?.officialCrosschecks?.find(item => item.sourceId === config.supersededSourceId)
    const coordinate = {
      latitude: entry.latitude,
      longitude: entry.longitude,
      precisionDegrees: 0.000001,
      role: 'official_station_location_not_entrance',
    }
    const rowKey = `${entry.line}:${entry.row}`
    const coordinateKey = `${entry.latitude}:${entry.longitude}`
    const nearestCandidateM = Math.min(...(place?.coordinateCandidates ?? [])
      .filter(candidate => candidate.eligible)
      .map(candidate => distanceMetres(coordinate, candidate)))
    if (!place || corrections.has(entry.id) || usedRows.has(rowKey) || usedCoordinates.has(coordinateKey)
      || place.searchScope !== 'preview' || place.productionApproved || place.categoryCode !== 'station'
      || !source || source.coordinate?.latitude !== previous?.latitude
      || source.coordinate?.longitude !== previous?.longitude
      || place.selectedCoordinate?.latitude !== previous.latitude
      || place.selectedCoordinate?.longitude !== previous.longitude
      || !Number.isInteger(entry.row) || entry.row < 2
      || !['인천2호선', '7호선'].includes(entry.line)
      || (entry.currentName ? entry.currentName !== place.nameKo
        || !entry.currentNameSource?.startsWith('https://www.ictr.or.kr/')
        : `${entry.name}역` !== place.nameKo)
      || !Number.isFinite(entry.latitude) || !Number.isFinite(entry.longitude)
      || entry.latitude < 37 || entry.latitude > 38 || entry.longitude < 126 || entry.longitude > 127
      || !Number.isFinite(nearestCandidateM) || nearestCandidateM > 250) {
      throw new Error(`Invalid preview coordinate correction target: ${entry.id}`)
    }
    usedRows.add(rowKey)
    usedCoordinates.add(coordinateKey)
    corrections.set(entry.id, {
      coordinate,
      evidence: {
        sourceName: config.source.name,
        sourceUrl: config.source.url,
        sourceFileSha256: config.source.fileSha256,
        sourceSheet: config.source.sheet,
        sourceRow: entry.row,
        sourceLine: entry.line,
        matchedSourceName: entry.name,
        currentNameSource: entry.currentNameSource ?? null,
        supersededSourceId: config.supersededSourceId,
        previousCoordinate: previous,
        nearestSourceCandidateM: Math.round(nearestCandidateM),
      },
    })
  }
  return corrections
}
