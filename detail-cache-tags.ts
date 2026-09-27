// R2 hits do not execute a tagged Next fetch. Derive the facility tag from the
// public HTML route so canonical pages still expire when that facility changes.
export function withToiletDetailTag<T>(key: string, value: T): T {
  const match = key.match(/^\/?(?:(?:en|ja|zh-cn|zh-tw|zh-hk)\/)?(?:toilet\/([1-9]\d*)|regions\/[^/]+\/[^/]+\/toilet\/([1-9]\d*)-[^/]+)$/)
  const id = match?.[1] || match?.[2]
  if (!id || !Number.isSafeInteger(Number(id)) || !value || typeof value !== 'object'
    || !('type' in value) || value.type !== 'app') return value
  const cached = value as { meta?: { headers?: Record<string, unknown>; [key: string]: unknown } }
  const existing = cached.meta?.headers?.['x-next-cache-tags']
  const tags = new Set(typeof existing === 'string' ? existing.split(',').filter(Boolean) : [])
  tags.add(`toilet:${id}`)
  return { ...value, meta: { ...cached.meta, headers: { ...cached.meta?.headers,
    'x-next-cache-tags': [...tags].join(',') } } }
}
