import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('map remains owned by a shared layout and browser-only shell', async () => {
  const layout = await read('src/app/(map)/layout.tsx')
  assert.match(layout, /<MapShell>\{children\}<\/MapShell>/)
  assert.doesNotMatch(layout, /key=|usePathname|useParams/)
  assert.match(await read('src/components/MapShell.tsx'), /ssr: false/)
})

test('root and policy pages remain server components', async () => {
  for (const file of ['src/app/layout.tsx', 'src/app/policies/[kind]/page.tsx']) {
    assert.doesNotMatch(await read(file), /['"]use client['"]|window\.|document\./)
  }
})

test('preview configuration cannot claim the production domain', async () => {
  const config = JSON.parse(await read('wrangler.jsonc'))
  assert.equal(config.name, 'geupddong-web-preview')
  assert.equal(config.routes, undefined)
  assert.equal(config.route, undefined)
  assert.equal(config.services[0].service, config.name)
  assert.equal(config.r2_buckets[0].bucket_name, 'geupddong-next-preview-cache')
  assert.equal(config.limits.cpu_ms, 1000)
})

test('marker image preserves the existing SVG asset', async () => {
  assert.equal((await read('public/toilet-marker-logo.svg')).replace(/\r/g, '').trim(),
    (await read('src/assets/toilet-marker-logo.svg')).replace(/\r/g, '').trim())
})

test('only policy pages are pre-generated; no nationwide detail build', async () => {
  const policy = await read('src/app/policies/[kind]/page.tsx')
  assert.match(policy, /Object.keys\(titles\)/)
  assert.doesNotMatch(await read('src/app/(map)/page.tsx'), /generateStaticParams/)
})
