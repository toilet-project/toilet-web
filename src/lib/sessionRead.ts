/** GET-only browser reader. Never replay report submissions or lifecycle mutations. */
export function createSessionReader(refreshUrl: string, request: typeof fetch = (...args) => fetch(...args)) {
  let pendingRefresh: Promise<boolean> | null = null
  let generation = 0

  async function refresh() {
    if (!pendingRefresh) {
      pendingRefresh = (async () => {
        const response = await request(refreshUrl, {
          method: 'POST', credentials: 'include', cache: 'no-store',
        })
        if (response.ok) generation += 1
        return response.ok
      })()
    }
    const current = pendingRefresh
    try {
      return await current
    } finally {
      if (pendingRefresh === current) pendingRefresh = null
    }
  }

  return async function read(url: string): Promise<Response> {
    const startedAtGeneration = generation
    const options: RequestInit = { method: 'GET', credentials: 'include', cache: 'no-store' }
    const response = await request(url, options)
    if (response.status !== 401) return response

    // A concurrent read may already have refreshed while this 401 was in flight.
    if (startedAtGeneration === generation && !await refresh()) return response
    return request(url, options)
  }
}
