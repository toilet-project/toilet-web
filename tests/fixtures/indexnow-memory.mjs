export function indexNowMemory() {
  const objects = new Map()
  let sequence = 0, time = 1_000_000
  const bucket = {
    async get(key) {
      const value = objects.get(key)
      return value ? { etag: value.etag, json: async () => JSON.parse(value.body) } : null
    },
    async put(key, body, { onlyIf } = {}) {
      const current = objects.get(key)
      if (onlyIf?.etagDoesNotMatch === '*' && current || onlyIf?.etagMatches && current?.etag !== onlyIf.etagMatches)
        return null
      const value = { etag: String(++sequence), body }; objects.set(key, value); return value
    },
    async list({ prefix, limit, cursor }) {
      const keys = [...objects.keys()].filter(key => key.startsWith(prefix)).sort()
      const start = cursor ? Number(cursor) : 0
      return { objects: keys.slice(start, start + limit).map(key => ({ key })),
        truncated: start + limit < keys.length, cursor: String(start + limit) }
    },
  }
  return { bucket, objects, now: () => time, advance: ms => { time += ms },
    records: prefix => [...objects].filter(([key]) => key.startsWith(prefix)).map(([, value]) => JSON.parse(value.body)) }
}
