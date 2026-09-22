import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const districts = JSON.parse(await readFile(resolve(root, 'data/regions/sgg-precise.json'), 'utf8')).features
const simplified = JSON.parse(await readFile(resolve(root, 'data/regions/sgg.json'), 'utf8')).features

function ringContains(ring, x, y) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function polygonContains(rings, x, y) {
  return ringContains(rings[0], x, y) && !rings.slice(1).some(ring => ringContains(ring, x, y))
}

function boundsOf(feature) {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
  const coordinates = polygons.flat(2)
  const longitudes = coordinates.map(point => point[0])
  const latitudes = coordinates.map(point => point[1])
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)]
}

function index(features) { return features.map(feature => ({
  code: feature.properties.sgg,
  geometry: feature.geometry,
  bounds: boundsOf(feature),
})) }

const indexed = index(districts)
const simplifiedIndex = index(simplified)

function districtAt(longitude, latitude, regions = indexed) {
  for (const item of regions) {
    const [west, south, east, north] = item.bounds
    if (longitude < west || longitude > east || latitude < south || latitude > north) continue
    const polygons = item.geometry.type === 'Polygon' ? [item.geometry.coordinates] : item.geometry.coordinates
    if (polygons.some(rings => polygonContains(rings, longitude, latitude))) return item.code
  }
  return null
}

const endpoint = process.env.REGION_SOURCE_API ?? 'https://api.geupddong.com'
const url = new URL('/api/v1/toilets', endpoint)
for (const [name, value] of Object.entries({ southLat: 33, northLat: 39, westLng: 124, eastLng: 132, zoom: 8, includeList: true })) url.searchParams.set(name, String(value))
const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
if (!response.ok) throw new Error(`Public toilet read failed: HTTP ${response.status}`)
const result = await response.json()
if (result.meta?.display_type !== 'MARKER' || !Array.isArray(result.toilets)) throw new Error('Incomplete public toilet response')
if (result.toilets.length !== result.meta.total_count) throw new Error('Public toilet list was truncated')

const counts = Object.fromEntries(indexed.map(item => [item.code, 0]))
const toiletDistrict = {}
const boundaryOverrides = {}
let unassigned = 0
for (const toilet of result.toilets) {
  if (!Number.isSafeInteger(toilet.id) || !Number.isFinite(toilet.latitude) || !Number.isFinite(toilet.longitude)) continue
  const code = districtAt(toilet.longitude, toilet.latitude)
  const simplifiedCode = districtAt(toilet.longitude, toilet.latitude, simplifiedIndex)
  if (code !== simplifiedCode) boundaryOverrides[toilet.id] = [code, toilet.latitude, toilet.longitude]
  if (!code) { unassigned++; continue }
  counts[code]++
  toiletDistrict[toilet.id] = [code, toilet.name]
}

const directory = resolve(root, 'data/regions')
await mkdir(directory, { recursive: true })
const generatedAt = new Date().toISOString()
await writeFile(resolve(directory, 'counts.json'), JSON.stringify({ generatedAt, sourceCount: result.toilets.length, unassigned, counts }) + '\n')
await writeFile(resolve(directory, 'toilet-district.json'), JSON.stringify(toiletDistrict) + '\n')
await writeFile(resolve(directory, 'toilet-boundary-overrides.json'), JSON.stringify(boundaryOverrides) + '\n')
console.log(`Assigned ${Object.keys(toiletDistrict).length}/${result.toilets.length} public toilets to precise district boundaries; ${unassigned} outside known boundaries, ${Object.keys(boundaryOverrides).length} client-link corrections.`)
