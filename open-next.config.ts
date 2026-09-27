import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from './detail-incremental-cache'
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue'
import d1TagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache'

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  queue: doQueue,
  tagCache: d1TagCache,
  // Use the persisted HTML/RSC lifetime on cold Workers, before Next.js falls
  // back to its process-local cache-control defaults for dynamic routes.
  enableCacheInterception: true,
})
