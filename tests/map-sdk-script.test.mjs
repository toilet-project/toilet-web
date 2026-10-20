import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transpileModule, ModuleKind } from 'typescript'
import { loadMapSdkScript } from '../src/lib/mapSdkScript.ts'
import * as providerSelection from '../src/lib/mapProviderSelection.ts'

function fakeDocument(t) {
  const scripts = []
  class Script extends EventTarget {
    dataset = {}
    remove() { const index = scripts.indexOf(this); if (index !== -1) scripts.splice(index, 1) }
  }
  const previous = globalThis.document
  globalThis.document = {
    querySelector(selector) { return scripts.find(script => selector.includes(`"${script.dataset.geupddongMapProvider}"`)) ?? null },
    createElement() { return new Script() },
    head: { append(script) { scripts.push(script) } },
  }
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous })
  return scripts
}
const settings = { provider: 'kakao', src: 'https://sdk.example/map.js', errorMessage: 'SDK unavailable' }

async function kakaoModule(t) {
  const previous = globalThis.window
  globalThis.window = {}
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous })
  const source = await readFile(new URL('../src/lib/kakaoMap.ts', import.meta.url), 'utf8')
  const { outputText } = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } })
  const exports = {}
  new Function('require', 'exports', outputText)(name => {
    if (name === '../config/kakao') return { kakaoJavascriptKey: 'test-browser-key' }
    if (name === './mapSdkScript') return { loadMapSdkScript }
    if (name === './address') return { getDisplayAddress: () => '' }
    throw new Error(`unexpected dependency: ${name}`)
  }, exports)
  return exports
}

test('SDK preparation waits for secondary initialization and reuses an existing tag', async t => {
  const scripts = fakeDocument(t)
  let ready = false, initialize
  const first = loadMapSdkScript({ ...settings, ready: () => ready, initialize: () => new Promise(resolve => { initialize = resolve }) })
  assert.equal(scripts.length, 1)
  const second = loadMapSdkScript({ ...settings, ready: () => ready, initialize: () => Promise.resolve() })
  assert.equal(scripts.length, 1)
  scripts[0].dispatchEvent(new Event('load'))
  ready = true; initialize()
  await Promise.all([first, second])
  await loadMapSdkScript({ ...settings, ready: () => ready })
  assert.equal(scripts.length, 1)
})

test('failed SDK tag is removed and a subsequent attempt can succeed', async t => {
  const scripts = fakeDocument(t)
  let ready = false
  const first = loadMapSdkScript({ ...settings, ready: () => ready })
  const failed = assert.rejects(first, /SDK unavailable/)
  scripts[0].dispatchEvent(new Event('error')); await failed
  assert.equal(scripts.length, 0)
  const retry = loadMapSdkScript({ ...settings, provider: 'naver', language: 'ja', ready: () => ready })
  assert.equal(scripts[0].dataset.geupddongMapLanguage, 'ja')
  ready = true; scripts[0].dispatchEvent(new Event('load')); await retry
})

test('a silent or unfinished secondary SDK load times out, cleans up and remains retryable', async t => {
  const scripts = fakeDocument(t)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const first = loadMapSdkScript({ ...settings, ready: () => false, initialize: () => new Promise(() => {}) })
  const failed = assert.rejects(first, /SDK unavailable/)
  scripts[0].dispatchEvent(new Event('load'))
  t.mock.timers.tick(20_000); await failed
  assert.equal(scripts.length, 0)
  await loadMapSdkScript({ ...settings, ready: () => true })
  assert.equal(scripts.length, 0)
})

test('early Kakao preparation and map creation share one script; failure resets the shared loader', async t => {
  const scripts = fakeDocument(t), sdk = await kakaoModule(t)
  const first = sdk.loadKakaoSdk(), duplicate = sdk.loadKakaoSdk()
  assert.equal(first, duplicate)
  assert.equal(scripts.length, 1)
  const rejected = assert.rejects(first, /SDK/)
  scripts[0].dispatchEvent(new Event('error')); await rejected
  assert.equal(scripts.length, 0)
  const retried = sdk.loadKakaoSdk()
  assert.notEqual(retried, first)
  assert.equal(scripts.length, 1)
  let mapsCreated = 0
  globalThis.window.kakao = { maps: {
    load(callback) { this.Map = class { constructor() { mapsCreated++ } }; callback() },
    LatLng: class {},
  } }
  const map = sdk.createKakaoMap({}, { latitude: 37, longitude: 127 })
  assert.equal(scripts.length, 1)
  scripts[0].dispatchEvent(new Event('load'))
  await Promise.all([retried, map])
  assert.equal(mapsCreated, 1)
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(sdk.createKakaoMap({}, { latitude: 37, longitude: 127 }, 6, aborted.signal), { name: 'AbortError' })
  assert.equal(mapsCreated, 1)
})

test('early Naver preparation shares configuration/script work and retains the requested label language', async t => {
  const scripts = fakeDocument(t), kakao = await kakaoModule(t)
  const source = await readFile(new URL('../src/lib/mapProvider.ts', import.meta.url), 'utf8')
  const { outputText } = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } })
  const exports = {}
  new Function('require', 'exports', outputText)(name => {
    if (name === './kakaoMap') return kakao
    if (name === './mapSdkScript') return { loadMapSdkScript }
    if (name === './mapProviderSelection') return providerSelection
    throw new Error(`unexpected dependency: ${name}`)
  }, exports)
  let configurationRequests = 0
  t.mock.method(globalThis, 'fetch', async () => {
    configurationRequests++
    return Response.json({ provider: 'naver', clientId: 'test-browser-id' })
  })
  const early = exports.prepareMapSdk('ja'), duplicate = exports.prepareMapSdk('ja')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(configurationRequests, 1)
  assert.equal(scripts.length, 1)
  assert.equal(scripts[0].dataset.geupddongMapLanguage, 'ja')
  globalThis.window.naver = { maps: { Map: class {}, LatLng: class {} } }
  scripts[0].dispatchEvent(new Event('load')); await Promise.all([early, duplicate])
  await exports.createMap({}, { latitude: 37, longitude: 127 }, 6, 'ja')
  assert.equal(configurationRequests, 1)
  await assert.rejects(exports.createMap({}, { latitude: 37, longitude: 127 }, 6, 'en'), exports.NaverMapLanguageReloadRequired)
})
