// Public, read-only audit: enumerate every sitemap URL, then inspect each route
// family/language. Never crawl hundreds of thousands of detail pages to warm ISR.
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'parse5'

const origin = process.argv[2] || 'https://geupddong.com'
const out = resolve(process.argv[3] || '.artifacts/sitewide-seo')
await mkdir(out, { recursive: true })
const locations = xml => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replaceAll('&amp;', '&'))
async function read(path) {
  const url = new URL(path, origin)
  url.host = new URL(origin).host; url.protocol = new URL(origin).protocol
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'Geupddong-SEO-Audit/1.0' } })
  return { status: response.status, url: response.url, html: await response.text(), robotsHeader: response.headers.get('x-robots-tag') }
}
function family(path) {
  const parts = decodeURI(path).split('/').filter(Boolean)
  const locale = /^(en|ja|zh-cn|zh-tw|zh-hk)$/.test(parts[0]) ? parts.shift() : 'ko'
  return `${locale}:${parts.includes('toilet') ? 'detail' : parts[0] === 'regions' ? `region-${parts.length - 1}` : parts.join('/') || 'home'}`
}
const cachedUrls = process.argv[4] ? JSON.parse(await readFile(process.argv[4], 'utf8')) : null
const index = cachedUrls ? null : await read('/sitemap.xml')
if (index && (index.status !== 200 || !index.html.includes('<sitemapindex'))) throw Error('Sitemap index unavailable')
const sitemaps = cachedUrls ? ['https://geupddong.com/cached-inventory'] : locations(index.html)
const urls = new Set(), duplicates = [], malformed = [], groups = {}, samples = new Map()
const inventory = []
for (const sitemap of sitemaps) {
  const result = cachedUrls ? { status: 200, html: '<urlset></urlset>' } : await read(sitemap)
  if (result.status !== 200 || !result.html.includes('<urlset')) throw Error(`Unavailable sitemap: ${sitemap}`)
  const entries = cachedUrls || locations(result.html)
  if (!cachedUrls && (entries.length > 50_000 || Buffer.byteLength(result.html) > 50 * 1024 * 1024)) throw Error(`Oversize sitemap: ${sitemap}`)
  for (const url of entries) {
    if (urls.has(url)) duplicates.push(url)
    urls.add(url)
    const parsed = new URL(url)
    if (parsed.origin !== 'https://geupddong.com' || parsed.hash || parsed.search) malformed.push(url)
    const key = family(parsed.pathname)
    groups[key] = (groups[key] || 0) + 1
    if (!samples.has(key)) samples.set(key, parsed.pathname)
  }
  inventory.push({ sitemap, count: entries.length, bytes: Buffer.byteLength(result.html) })
  console.log(`${new URL(sitemap).pathname}: ${entries.length}`)
}
await writeFile(resolve(out, 'urls.json'), JSON.stringify([...urls]))
await writeFile(resolve(out, 'inventory.json'), JSON.stringify({ at: new Date().toISOString(), origin, total: urls.size, duplicates, malformed, groups, sitemaps: inventory }, null, 2))
for (const locale of ['', '/en', '/ja', '/zh-cn', '/zh-tw', '/zh-hk']) {
  samples.set(`${locale || 'ko'}:home`, locale || '/')
  for (const kind of ['terms', 'privacy', 'location', 'all']) samples.set(`${locale}:policy-${kind}`, `${locale}/policies/${kind}`)
  samples.set(`${locale}:legacy-detail`, `${locale}/toilet/13144`)
  samples.set(`${locale}:account`, `${locale}/account`)
}
samples.set('not-found', '/seo-audit-page-that-does-not-exist')
const pages = []
const attr = (node, key) => node?.attrs?.find(item => item.name === key)?.value || ''
const textContent = node => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(textContent).join('')
function inspectHtml(html) {
  const nodes = { html: null, title: null, metas: [], links: [], headings: [], anchors: [], scripts: [] }
  function walk(node) {
    if (node.tagName === 'html') nodes.html = node
    if (node.tagName === 'title') nodes.title = node
    if (node.tagName === 'meta') nodes.metas.push(node)
    if (node.tagName === 'link') nodes.links.push(node)
    if (/^h[1-6]$/.test(node.tagName || '')) nodes.headings.push(node)
    if (node.tagName === 'a') nodes.anchors.push(node)
    if (node.tagName === 'script' && attr(node, 'type') === 'application/ld+json') nodes.scripts.push(node)
    if (node.tagName === 'script') return
    for (const child of node.childNodes || []) walk(child)
  }
  walk(parse(html))
  return nodes
}
for (const [key, path] of samples) {
  try {
    const { html, ...response } = await read(path)
    await writeFile(resolve(out, `page-${pages.length}.html`), html)
    const document = inspectHtml(html)
    const meta = name => attr(document.metas.find(tag => attr(tag, 'name') === name || attr(tag, 'property') === name), 'content')
    const title = document.title ? textContent(document.title) : ''
    const description = meta('description')
    const headings = document.headings.map(node => ({ level: Number(node.tagName[1]), text: textContent(node) }))
    const jsonLd = document.scripts.map(node => JSON.parse(textContent(node)))
    const placeholders = document.anchors.map(node => attr(node, 'href')).filter(href => !href.trim() || href === '#' || /^javascript:/i.test(href))
    pages.push({ key, path: decodeURI(path), ...response, title, titleLength: [...title].length, description, descriptionLength: [...description].length, lang: attr(document.html, 'lang'), robots: meta('robots'), canonical: attr(document.links.find(tag => attr(tag, 'rel') === 'canonical'), 'href'), headings, jsonLd, placeholders, ogTitle: meta('og:title'), ogDescription: meta('og:description'), twitterTitle: meta('twitter:title') })
    console.log(`${response.status} ${key}: h1=${headings.filter(h => h.level === 1).length}`)
  } catch (error) { pages.push({ key, path, error: String(error) }) }
}
await writeFile(resolve(out, 'pages.json'), JSON.stringify(pages, null, 2))
console.log(JSON.stringify({ totalUrls: urls.size, families: Object.keys(groups).length, sampledPages: pages.length, duplicates: duplicates.length, malformed: malformed.length, out }))
