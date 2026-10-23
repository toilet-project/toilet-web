import assert from 'node:assert/strict'
import test from 'node:test'

async function withBrowser(hostname, query, run) {
  const previous = Object.fromEntries(['window', 'document', 'performance', 'PerformanceObserver'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const children = []
  let clock = 10
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: { location: { hostname, origin: `https://${hostname}`, href: `https://${hostname}/?${query}` }, addEventListener() {} } },
    document: { configurable: true, value: { createElement: () => ({ textContent: '' }), body: { append: child => children.push(child) } } },
    performance: { configurable: true, value: { now: () => clock++, getEntriesByType: type => type === 'resource' ? [
      { name: `https://${hostname}/api/map-area?private-coordinate=SECRET`, transferSize: 5, startTime: 2, responseEnd: 9, duration: 7 },
      { name: `https://${hostname}/unknown?account=PRIVATE`, transferSize: 8, startTime: 1, responseEnd: 3, duration: 2 },
    ] : [] } },
    PerformanceObserver: { configurable: true, value: undefined },
  })
  try { await run(await import(`../src/lib/mapTiming.ts?browser=${hostname}-${query}`), children) }
  finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

test('map timing is disabled on production and on ordinary preview visits', async () => {
  for (const [host, query] of [['geupddong.com', 'map-timing=1'], ['preview.geupddong.com', '']]) {
    await withBrowser(host, query, (timing, children) => {
      assert.equal(timing.mapTimingEnabled(), false)
      timing.installMapTimingOutput()
      timing.markMapTiming('app-mounted')
      timing.beginMapTiming('map-data')()
      assert.equal(children.length, 0)
    })
  }
})

test('opt-in map timing exposes bounded numeric phases without resource URLs or query contents', async () => {
  await withBrowser('preview.geupddong.com', 'map-timing=1', (timing, children) => {
    timing.installMapTimingOutput()
    timing.installMapTimingOutput()
    const finish = timing.beginMapTiming('map-data')
    finish(); finish()
    for (let n = 0; n < 200; n++) timing.markMapTiming('result-frame')
    assert.equal(children.length, 1)
    assert.equal(children[0].hidden, true)
    const text = children[0].textContent
    assert.equal(/SECRET|PRIVATE|https:|account|coordinate/.test(text), false)
    const result = JSON.parse(text)
    assert.equal(result.samples.length, 160)
    assert.equal(result.resourceGroups.find(group => group.kind === 'map-data').count, 1)
    assert.ok(result.samples.every(sample => typeof sample.startMs === 'number'))
  })
})
