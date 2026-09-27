import r2 from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import { withToiletDetailTag } from './detail-cache-tags'

const cache: Pick<typeof r2, 'name' | 'get' | 'set' | 'delete'> = {
  name: r2.name,
  async get(key, cacheType) {
    const entry = await r2.get(key, cacheType)
    // Add on read as well so already-stored HTML gets the same invalidation
    // protection without purging or regenerating every page.
    return entry ? { ...entry, value: withToiletDetailTag(key, entry.value) } : null
  },
  async set(key, value, cacheType) {
    return r2.set(key, withToiletDetailTag(key, value), cacheType)
  },
  async delete(key) { return r2.delete(key) },
}
export default cache
