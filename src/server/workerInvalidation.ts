import { getCloudflareContext } from '@opennextjs/cloudflare'
import tagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache'

export async function persistWorkerInvalidation(ids: number[]) {
  if (process.env.CACHE_RUNTIME !== 'workers') return
  const { env } = getCloudflareContext()
  if (!('NEXT_TAG_CACHE_D1' in env) || !env.NEXT_TAG_CACHE_D1) throw new Error('Tag cache binding missing')
  const now = Date.now()
  await tagCache.writeTags(ids.map(id => ({tag:`toilet:${id}`, stale:now, expire:now})))
}
