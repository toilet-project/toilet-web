import type { ToiletMapItemResponse } from './toilets'
import type { MapCell } from '../lib/mapCells'

export type MapSourceCellsResponse = { schema: 3; cells: Array<{ cell: MapCell; toilets: ToiletMapItemResponse[] }> }

// Only public cell coordinates cross this boundary. Personal selections stay in memory.
export async function fetchMapSourceCells(cells: MapCell[], signal?: AbortSignal): Promise<MapSourceCellsResponse> {
  const response = await fetch('/api/map-source-cells', { method: 'POST', signal,
    credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cells }) })
  if (!response.ok) throw new Error(`지도 구역 자료를 불러오지 못했습니다. (${response.status})`)
  const payload = await response.json() as Partial<MapSourceCellsResponse>
  if (!payload || payload.schema !== 3 || !Array.isArray(payload.cells)) throw new Error('지도 구역 자료를 확인할 수 없습니다.')
  return payload as MapSourceCellsResponse
}
