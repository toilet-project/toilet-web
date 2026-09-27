import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import sharp from 'sharp'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transpileModule, ModuleKind, JsxEmit } from 'typescript'
import { BRAND_ASSET_BASE, BRAND_MANIFEST_URL, BRAND_SOCIAL_IMAGE } from '../src/lib/brand.ts'
import { SUPPORTED_LOCALES } from '../src/i18n/locale.ts'
import { socialMetadata } from '../src/i18n/pageSeo.ts'

const read = path => readFile(new URL(`../${path}`, import.meta.url))
const asset = path => read(`public${path}`)

test('headers keep existing text while large auth lockups opt into the approved symbol', async () => {
  const source = (await read('src/components/BrandWordmark.tsx')).toString()
  const { outputText } = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } })
  const require = createRequire(import.meta.url)
  const component = { exports: {} }
  const load = id => id === '../lib/brand' ? { BRAND_ASSET_BASE } : require(id)
  new Function('require', 'module', 'exports', outputText)(load, component, component.exports)
  for (const locale of SUPPORTED_LOCALES) {
    const html = renderToStaticMarkup(createElement(component.exports.BrandWordmark, { locale }))
    assert.match(html, /aria-hidden="true"/)
    assert.doesNotMatch(html, /<img/)
    if (locale === 'ko') assert.match(html, /class="brand-wordmark is-korean" aria-hidden="true">급똥<\/span>/)
    else assert.match(html, /class="brand-wordmark is-english" aria-hidden="true"><span>GEUP<\/span><span>DDONG<\/span>/)
    const lockup = renderToStaticMarkup(createElement(component.exports.BrandWordmark, { locale, withSymbol: true }))
    assert.match(lockup, /alt=""/)
    if (locale === 'ko') {
      assert.ok(lockup.includes(`${BRAND_ASSET_BASE}/lockup-ko.svg`))
      assert.doesNotMatch(lockup, /GEUP|DDONG/)
    } else {
      assert.ok(lockup.includes(`${BRAND_ASSET_BASE}/symbol-green.svg`))
      assert.match(lockup, /class="brand-wordmark is-english" aria-hidden="true"><span>GEUP<\/span><span>DDONG<\/span>/)
    }
  }
})

test('approved source artwork is retained verbatim, standalone and font independent', async () => {
  const hashes = {
    'symbol-green.svg': '02f40e3b00088348291dd55a1561015cfea6b1556550bd1672b6870dc3a34a7f',
    'lockup-ko.svg': '9e85dd490845b8d74e490b7e9c666d5741b6e19150b4b4e8ef973161ea96a4d6',
    'app-icon-square.svg': 'dd3e55a36c04fdd789eba2c4393a4d742444e4eebf001513531a9551c99175e1',
    'favicon-micro.svg': '9d41ff15f04a020156273574af57d97f618d27a1028493dc404dc6ab369b7b92',
  }
  for (const [name, hash] of Object.entries(hashes)) {
    const source = await read(`assets/brand/hangul-point-v1/${name}`)
    assert.equal(createHash('sha256').update(source).digest('hex'), hash, name)
    assert.doesNotMatch(source.toString(), /<text\b|<image\b|@import|@font-face|<script\b/)
  }
  for (const name of ['symbol-green.svg', 'lockup-ko.svg']) assert.deepEqual(await asset(`${BRAND_ASSET_BASE}/${name}`), await read(`assets/brand/hangul-point-v1/${name}`))
  assert.deepEqual(await read('public/favicon.svg'), await asset(`${BRAND_ASSET_BASE}/favicon.svg`))
})

test('PWA and Apple icons are opaque PNGs, with distinct maskable safe-area artwork', async () => {
  const manifest = JSON.parse(await read('public/site.webmanifest'))
  assert.equal(manifest.name, '급똥 | 내 주변 공중화장실 찾기')
  assert.equal(manifest.short_name, '급똥')
  assert.equal(manifest.start_url, '/')
  assert.match(BRAND_MANIFEST_URL, /\?v=hangul-point-v1$/)
  assert.deepEqual(manifest.icons.map(icon => icon.purpose), ['any', 'any', 'maskable'])
  for (const icon of [...manifest.icons, { src: `${BRAND_ASSET_BASE}/apple-touch-icon.png`, sizes: '180x180' }]) {
    assert.ok(icon.src.startsWith(`${BRAND_ASSET_BASE}/`))
    const metadata = await sharp(await asset(icon.src)).metadata()
    assert.equal(`${metadata.width}x${metadata.height}`, icon.sizes)
    assert.equal(metadata.format, 'png')
    assert.equal(metadata.hasAlpha, false)
  }
  const { data, info } = await sharp(await asset(`${BRAND_ASSET_BASE}/icon-maskable-512.png`)).raw().toBuffer({ resolveWithObject: true })
  let whitePixels = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels
    if (data[i] > 180 && data[i + 1] > 180 && data[i + 2] > 180) {
      whitePixels++
      assert.ok(Math.hypot(x + .5 - 256, y + .5 - 256) <= 512 * .4, `maskable content clipped at ${x},${y}`)
    }
  }
  assert.ok(whitePixels > 10_000)
})

test('all locale share cards use the new asset and describe its actual dimensions', async () => {
  const png = await asset(BRAND_SOCIAL_IMAGE.url)
  const metadata = await sharp(png).metadata()
  for (const locale of SUPPORTED_LOCALES) {
    const social = socialMetadata('title', 'description', '/', locale)
    assert.equal(social.openGraph.images[0].url, BRAND_SOCIAL_IMAGE.url)
    assert.equal(social.twitter.images[0].url, BRAND_SOCIAL_IMAGE.url)
    assert.equal(social.openGraph.images[0].width, metadata.width)
    assert.equal(social.openGraph.images[0].height, metadata.height)
    assert.equal(social.openGraph.siteName, locale === 'ko' ? '급똥' : 'Geupddong')
  }
  assert.deepEqual(await read('public/og-image.png'), png)
})
