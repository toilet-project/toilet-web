import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { BRAND_ASSET_BASE, BRAND_SOCIAL_IMAGE } from '../src/lib/brand.ts'

const root = new URL('../', import.meta.url)
const source = new URL('assets/brand/hangul-point-v1/', root)
const output = new URL(`public${BRAND_ASSET_BASE}/`, root)
const green = '#17683A'
await mkdir(output, { recursive: true })
const read = name => readFile(new URL(name, source), 'utf8')
const app = await read('app-icon-square.svg')
const favicon = await read('favicon-micro.svg')
const body = svg => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>.*?<\/title>/gs, '')
const png = async (name, svg, size) => sharp(Buffer.from(svg)).resize(size, size).flatten({ background: green }).removeAlpha().png().toFile(fileURLToPath(new URL(name, output)))

for (const name of ['symbol-green.svg', 'lockup-ko.svg']) await copyFile(new URL(name, source), new URL(name, output))
await writeFile(new URL('favicon.svg', output), favicon)
// Keep the former public URLs useful for old bookmarks and previously shared links.
await writeFile(new URL('public/favicon.svg', root), favicon)
for (const size of [16, 32, 48]) await png(`favicon-${size}.png`, favicon, size)
await png('apple-touch-icon.png', app, 180)
for (const size of [192, 512]) await png(`icon-${size}.png`, app, size)
// A maskable icon must keep every meaningful pixel inside the central 80% circle.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${green}"/><g transform="translate(51.2 51.2) scale(.9)">${body(app)}</g></svg>`
await png('icon-maskable-512.png', maskable, 512)

// Language-neutral, vector-authored card: one approved symbol for all six locales.
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="${BRAND_SOCIAL_IMAGE.width}" height="${BRAND_SOCIAL_IMAGE.height}" viewBox="0 0 1730 909">
<rect width="1730" height="909" fill="#F6F8F1"/>
<g fill="#E4EBD8"><path d="M1250 0h480v190c-110 45-204 22-253-36-56-66-160-41-227-154Z"/><path d="M0 586c118-38 186 7 231 82 40 68 145 112 241 103v138H0Z"/></g>
<g fill="none" stroke="#FFFFFF" stroke-width="32"><path d="M-70 50 530 510 1120 960M290-70 820 390 1660 960M950-60 400 920M1680-50 1210 425 720 960M-60 385 520 355 1120 105 1800 470"/></g>
<g fill="none" stroke="#DCE6CE" stroke-width="3" stroke-dasharray="13 17"><path d="M50 0c360 370-150 530 450 930M1290-40c-350 520 570 120 370 910"/></g>
<defs><clipPath id="app-mask"><rect x="625" y="215" width="480" height="480" rx="106"/></clipPath></defs>
<g clip-path="url(#app-mask)"><g transform="translate(625 215) scale(.46875)">${body(app)}</g></g>
</svg>`
await writeFile(new URL('social-card.svg', output), social)
await sharp(Buffer.from(social)).removeAlpha().png().toFile(fileURLToPath(new URL('og-image.png', output)))
await copyFile(new URL('og-image.png', output), new URL('public/og-image.png', root))

const manifest = JSON.parse(await readFile(new URL('public/site.webmanifest', root), 'utf8'))
manifest.icons = [
  ...[192, 512].map(size => ({ src: `${BRAND_ASSET_BASE}/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
  { src: `${BRAND_ASSET_BASE}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]
await writeFile(new URL('public/site.webmanifest', root), `${JSON.stringify(manifest, null, 2)}\n`)
const sources = Object.fromEntries(await Promise.all(['symbol-green.svg', 'lockup-ko.svg', 'app-icon-square.svg', 'favicon-micro.svg'].map(async name => [name, createHash('sha256').update(await readFile(new URL(name, source))).digest('hex')])))
await writeFile(new URL('provenance.json', output), `${JSON.stringify({ brand: 'Hangul Point', version: '1.0.0', selected: 'C / HANGUL POINT: paired ㄷ, lower circle, right location point', sourceDirectory: 'assets/brand/hangul-point-v1', sources }, null, 2)}\n`)
console.log(`Generated ${BRAND_ASSET_BASE}: favicon, touch/PWA icons and ${BRAND_SOCIAL_IMAGE.width}×${BRAND_SOCIAL_IMAGE.height} social card`)
