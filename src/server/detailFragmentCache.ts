import { createHash } from 'node:crypto'
import type { Locale } from '../i18n/locale'
import { isLocale } from '../i18n/locale'
import type { DetailPresentation } from '../lib/detailPresentation'
import type { R2BucketLike } from './sharedToiletCache'
import { renderDetailFragment } from './detailFragmentTemplate'
import { DETAIL_FRAGMENT_TEMPLATE } from './detailFragmentVersion'

const SCHEMA = 1
const MAX_HTML_BYTES = 100_000
type Record = { schema: number; id: number; locale: Locale; fingerprint: string; html: string; htmlHash: string }
export type LoadedFragment = { etag: string; value: unknown } | null
export type DetailFragment = { html: string; fingerprint: string }
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

export function detailFragmentKey(id: number, locale: Locale) {
  if (!Number.isSafeInteger(id) || id < 1 || !isLocale(locale)) throw Error('Invalid public fragment identity')
  // Overwrite the same slot after a content/template change. No version folders
  // accumulate on WEB deployments, and all URL aliases share this slot.
  return `toilet-content/v${SCHEMA}/${locale}/${id}.json`
}

export async function loadDetailFragment(bucket: R2BucketLike | null, id: number, locale: Locale): Promise<LoadedFragment> {
  if (!bucket) return null
  try {
    const object = await bucket.get(detailFragmentKey(id, locale))
    return object ? { etag: object.etag, value: await object.json<unknown>().catch(() => null) } : null
  } catch { return null }
}

export async function reuseDetailFragment({ bucket, id, locale, model, loaded, template = DETAIL_FRAGMENT_TEMPLATE }: {
  bucket: R2BucketLike | null; id: number; locale: Locale; model: DetailPresentation; loaded: LoadedFragment; template?: string
}): Promise<DetailFragment> {
  const key = detailFragmentKey(id, locale)
  const fingerprint = hash(JSON.stringify({ template, model }))
  const current = loaded?.value as Partial<Record> | null
  if (current?.schema === SCHEMA && current.id === id && current.locale === locale
    && current.fingerprint === fingerprint && typeof current.html === 'string'
    && current.html.length <= MAX_HTML_BYTES && current.htmlHash === hash(current.html))
    return { html: current.html, fingerprint }

  const html = renderDetailFragment(model)
  // This fragment is never used until the current public facility has been
  // loaded and checked. Deleted/private facilities cannot be resurrected by it.
  if (bucket && Buffer.byteLength(html, 'utf8') <= MAX_HTML_BYTES) {
    const value: Record = { schema: SCHEMA, id, locale, fingerprint, html, htmlHash: hash(html) }
    try {
      await bucket.put(key, JSON.stringify(value), {
        onlyIf: loaded ? { etagMatches: loaded.etag } : { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: 'application/json' },
        customMetadata: { schema: String(SCHEMA), fingerprint },
      })
    } catch { /* Storage failure must not hide public content or omit SEO HTML. */ }
  }
  return { html, fingerprint }
}
