import type { ToiletMapItemResponse } from '../api/toilets.ts'
import { SUPPORTED_LOCALES } from '../i18n/locale.ts'
import { localizedPublicPath } from '../i18n/routes.ts'
import { regionDirectoryEntries } from '../lib/regionDirectory.ts'
import { getDistrict, localizedRegionPath } from '../lib/regions.ts'
import { indexNowEnabled, indexNowFailureInfo, logIndexNowResult, submitIndexNow } from './indexNow.ts'

export type RegionDirectorySnapshots = Map<string, ToiletMapItemResponse[]>
// A signed cache delivery may cover 24 districts. waitUntil is too short for
// that many origin reads plus IndexNow retries; broad deliveries stay cache-only.
const MAX_INDEXNOW_DISTRICTS_PER_DELIVERY = 4

export function canNotifyIndexNowDistricts(codes: readonly string[] | null) {
  return codes !== null && codes.length > 0 && codes.length <= MAX_INDEXNOW_DISTRICTS_PER_DELIVERY
}

/** Compare only the server-rendered directory, not unrelated marker fields. */
export function changedDistrictIndexNowPaths(districtCode: string,
  before: readonly ToiletMapItemResponse[], after: readonly ToiletMapItemResponse[]) {
  if (!/^\d{5}$/.test(districtCode) || !getDistrict(districtCode.slice(0, 2), districtCode))
    throw new Error('Unknown district code')
  return SUPPORTED_LOCALES.flatMap(locale => {
    const previous = regionDirectoryEntries(before, locale, districtCode)
    const current = regionDirectoryEntries(after, locale, districtCode)
    if (JSON.stringify(previous) === JSON.stringify(current)) return []
    return [localizedPublicPath(localizedRegionPath(locale, districtCode.slice(0, 2), districtCode), locale)!]
  })
}

export async function notifyIndexNowForRegionChanges(snapshots: RegionDirectorySnapshots,
  loadCurrent: (code: string) => Promise<ToiletMapItemResponse[]>, fetchImpl: typeof fetch = fetch) {
  const entries = [...snapshots]
  const changes: string[][] = new Array(entries.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (cursor < entries.length) {
      const index = cursor++
      const [code, previous] = entries[index]
      try {
        const current = await loadCurrent(code)
        changes[index] = changedDistrictIndexNowPaths(code, previous, current)
      } catch (error) {
        // A failed refresh must not turn an unknown district into an empty one.
        console.error('IndexNow district comparison skipped', { districtCode: code,
          errorName: error instanceof Error ? error.name : typeof error })
        changes[index] = []
      }
    }
  }))
  return submitIndexNow(changes.flat(), fetchImpl)
}

export async function scheduleIndexNowRegionNotification(snapshots: RegionDirectorySnapshots) {
  if (!indexNowEnabled() || snapshots.size === 0) return false
  try {
    const [{ getCloudflareContext }, { getCurrentDistrictToiletsForIndexNow }] = await Promise.all([
      import('@opennextjs/cloudflare'), import('./regions.ts'),
    ])
    const { ctx } = await getCloudflareContext({ async: true })
    const startedAt = Date.now()
    ctx.waitUntil(notifyIndexNowForRegionChanges(snapshots,
      code => getCurrentDistrictToiletsForIndexNow(code.slice(0, 2), code)).then(result => {
      logIndexNowResult('district URL', result, startedAt)
    }).catch(error => {
      console.error('IndexNow district URL update failed', { ...indexNowFailureInfo(error), elapsedMs: Date.now() - startedAt })
    }))
    return true
  } catch (error) {
    console.error('IndexNow district scheduling failed', { errorName: error instanceof Error ? error.name : typeof error })
    return false
  }
}
