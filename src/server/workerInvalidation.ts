import { getCloudflareContext } from '@opennextjs/cloudflare'
import tagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache'

export async function persistWorkerInvalidation(ids: number[], catalogChanged = false) {
  if (process.env.CACHE_RUNTIME !== 'workers') return
  const { env } = getCloudflareContext()
  if (!('NEXT_TAG_CACHE_D1' in env) || !env.NEXT_TAG_CACHE_D1) throw new Error('Tag cache binding missing')
  const now = Date.now()
  const tags = ids.map(id => ({tag:`toilet:${id}`, stale:now, expire:now}))
  if (ids.length) tags.push({tag:'region-markers', stale:now, expire:now})
  if (catalogChanged) tags.push({tag:'toilet-catalog', stale:now, expire:now})
  await tagCache.writeTags(tags)
}
