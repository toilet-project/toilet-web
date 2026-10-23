// Numeric, request-local diagnostics only. Never retain keys, SQL, rows or URLs.
// Workers clocks advance after IO, so these are observed IO elapsed durations,
// not synchronous CPU/JSON parsing measurements. A zero duration does not imply
// zero CPU work, and decimal formatting does not imply sub-millisecond accuracy.
// https://developers.cloudflare.com/workers/runtime-apis/performance/
const HOME_PATHS = new Set(['/', '/en', '/ja', '/zh-cn', '/zh-tw', '/zh-hk'])
const METRICS = ['r2-get', 'r2-json', 'd1']

function enabled(request, env) {
  if (env.SITE_INDEXABLE !== 'false' || request.method !== 'GET') return false
  const url = new URL(request.url)
  if (url.origin !== 'https://preview.geupddong.com' || !HOME_PATHS.has(url.pathname)
    || url.searchParams.getAll('map-server-timing').length !== 1
    || url.searchParams.get('map-server-timing') !== '1' || url.searchParams.has('_rsc')) return false
  return !['RSC', 'Next-Action', 'Next-Router-Prefetch', 'Next-Router-Segment-Prefetch',
    'X-Prerender-Revalidate', 'Authorization', 'Upgrade'].some(name => request.headers.has(name))
    && !/prefetch/i.test(`${request.headers.get('Purpose') ?? ''} ${request.headers.get('Sec-Purpose') ?? ''}`)
}

function createMeasurements() {
  const started = performance.now()
  const metrics = new Map(METRICS.map(name => [name, { duration: 0, count: 0 }]))
  const pending = new Set()
  let background = 0, sealed = false
  const elapsed = start => Math.max(0, performance.now() - start)
  return {
    async measure(name, operation) {
      if (sealed) return operation()
      const span = { name, started: performance.now() }
      metrics.get(name).count++
      pending.add(span)
      try { return await operation() }
      finally {
        if (!sealed) {
          metrics.get(name).duration += elapsed(span.started)
          pending.delete(span)
        }
      }
    },
    background(operation, register) {
      if (sealed) return register(operation)
      background++
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        if (!sealed) background--
      }
      try {
        // Preserve the exact promise passed to the native execution context.
        const result = register(operation)
        void Promise.resolve(operation).then(finish, finish)
        return result
      } catch (error) { finish(); throw error }
    },
    seal() {
      if (sealed) return ''
      sealed = true
      // Include only the observed portion of in-flight IO, ending at headers.
      for (const span of pending) metrics.get(span.name).duration += elapsed(span.started)
      const parts = [`home-handler;dur=${elapsed(started).toFixed(1)}`]
      for (const [name, metric] of metrics)
        parts.push(`home-${name};dur=${metric.duration.toFixed(1)};desc="${metric.count}"`)
      parts.push(`home-pending;desc="${pending.size}"`, `home-background;desc="${background}"`)
      pending.clear()
      return parts.join(', ')
    },
  }
}

function forward(target, property) {
  const value = Reflect.get(target, property, target)
  return typeof value === 'function' ? value.bind(target) : value
}

function facade(target, get) {
  // A separate target permits wrapping frozen native bindings/objects without
  // violating Proxy invariants for their non-writable own method properties.
  return new Proxy(Object.create(Object.getPrototypeOf(target)), {
    get(_facade, property) { return get(target, property) },
  })
}

function measuredR2(bucket, measurements) {
  return facade(bucket, (target, property) => {
    if (property !== 'get') return forward(target, property)
    return async (...args) => {
      const object = await measurements.measure('r2-get', () => target.get(...args))
      if (!object) return object
      return facade(object, (body, name) => {
        if (name === 'json') return (...options) => measurements.measure('r2-json', () => body.json(...options))
        return forward(body, name)
      })
    }
  })
}

function measuredD1(database, measurements) {
  const originals = new WeakMap()
  const wrapStatement = statement => {
    const wrapped = facade(statement, (target, property) => {
      if (property === 'bind') return (...args) => wrapStatement(target.bind(...args))
      if (['raw', 'all', 'first', 'run'].includes(property))
        return (...args) => measurements.measure('d1', () => target[property](...args))
      return forward(target, property)
    })
    originals.set(wrapped, statement)
    return wrapped
  }
  return facade(database, (target, property) => {
    if (property === 'prepare') return (...args) => wrapStatement(target.prepare(...args))
    if (property === 'batch') return (statements, ...args) => measurements.measure('d1',
      () => target.batch(Array.isArray(statements)
        ? statements.map(statement => originals.get(statement) ?? statement) : statements, ...args))
    return forward(target, property)
  })
}

export async function withHomeServerTiming(request, env, ctx, fetchHandler) {
  if (!enabled(request, env)) return fetchHandler(request, env, ctx)
  const measurements = createMeasurements()
  const measuredEnv = { ...env }
  if (env.NEXT_INC_CACHE_R2_BUCKET?.get)
    measuredEnv.NEXT_INC_CACHE_R2_BUCKET = measuredR2(env.NEXT_INC_CACHE_R2_BUCKET, measurements)
  if (env.NEXT_TAG_CACHE_D1?.prepare)
    measuredEnv.NEXT_TAG_CACHE_D1 = measuredD1(env.NEXT_TAG_CACHE_D1, measurements)
  const measuredContext = ctx && facade(ctx, (target, property) => {
    if (property === 'waitUntil') return operation => measurements.background(operation, promise => target.waitUntil(promise))
    return forward(target, property)
  })
  let response
  try { response = await fetchHandler(request, measuredEnv, measuredContext) }
  catch (error) { measurements.seal(); throw error }
  // Never await the body or waitUntil work to produce timing headers. This is
  // the pre-header boundary, not CPU time or complete streaming request time.
  const timing = measurements.seal()
  if (!(response.headers.get('Content-Type') ?? '').startsWith('text/html')) return response
  const headers = new Headers(response.headers)
  headers.append('Server-Timing', timing)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
