import 'server-only'
import { cache } from 'react'
import { connection } from 'next/server'
import type { Locale } from '../i18n/locale'
import { parseToiletId } from '../lib/toiletRoute'
import { detailPresentation } from '../lib/detailPresentation'
import { getToilet } from './toilets'
import type { R2BucketLike } from './sharedToiletCache'
import { loadDetailFragment, reuseDetailFragment } from './detailFragmentCache'

async function fragmentBucket(): Promise<R2BucketLike | null> {
  if (process.env.CACHE_RUNTIME !== 'workers') return null
  // Synthetic acceptance fixtures must never read/write a live R2 bucket.
  if (process.env.NEXT_PUBLIC_API_BASE_URL === 'https://preview.geupddong.com/__review-verification') return null
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    return (env as Record<string, unknown>).PUBLIC_TOILET_DATA_CACHE_R2 as R2BucketLike | null ?? null
  } catch { return null }
}

export const getToiletPage = cache(async (rawId: string, locale: Locale) => {
  // Render current shell/metadata/Flight references per request. Only the plain
  // public body fragment persists; no old deployment document is re-served.
  await connection()
  const id = parseToiletId(rawId)
  if (id === null) return null
  const detailPromise = getToilet(rawId)
  const bucket = await fragmentBucket()
  const [detail, loaded] = await Promise.all([detailPromise, loadDetailFragment(bucket, id, locale)])
  if (!detail) return null
  const fragment = await reuseDetailFragment({ bucket, id, locale, loaded, model: detailPresentation(detail, locale) })
  return { detail, fragment }
})
