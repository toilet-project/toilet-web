import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { reportPreviewResponse } from '../report-preview-proxy.mjs'
const base = 'https://preview.geupddong.com/__report-preview/api/v1/reports/guest'
const env = () => ({ SITE_INDEXABLE: 'false', REPORT_PREVIEW_CONNECTION: JSON.stringify({ origin: 'https://isolated-report-test.trycloudflare.com', token: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60000).toISOString() }) })
const request = (overrides = {}) => new Request(base, { method: 'POST', headers: { Origin: 'https://preview.geupddong.com', 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), 'X-Report-Guest': randomUUID(), Cookie: 'production=NEVER', Authorization: 'Bearer NEVER' }, body: '{}', ...overrides })
test('quick report proxy is closed on production, unexpected paths, origins and expiry', async () => {
  assert.equal((await reportPreviewResponse(request(), { ...env(), SITE_INDEXABLE: 'true' })).status, 404)
  assert.equal((await reportPreviewResponse(new Request('https://geupddong.com/__report-preview/api/v1/reports/guest'), env())).status, 404)
  assert.equal((await reportPreviewResponse(new Request(base.replace('/guest', '/me')), env())).status, 403)
  assert.equal((await reportPreviewResponse(request({ headers: { Origin: 'https://evil.example' } }), env())).status, 403)
  assert.equal((await reportPreviewResponse(request(), { ...env(), REPORT_PREVIEW_CONNECTION: '{}' })).status, 410)
  assert.equal((await reportPreviewResponse(request(), { SITE_INDEXABLE: 'false' })).status, 503)
})
test('proxy forwards only bounded proposals, never login credentials, and never caches receipts', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://isolated-report-test.trycloudflare.com/api/v1/reports/guest')
    assert.equal(new Headers(options.headers).get('Cookie'), null)
    assert.equal(new Headers(options.headers).get('Authorization'), null)
    assert.equal(options.redirect, 'manual')
    return Response.json({ id: 1, status: 'PENDING' }, { status: 201 })
  }
  try {
    const response = await reportPreviewResponse(request(), env())
    assert.equal(response.status, 201)
    assert.match(response.headers.get('cache-control'), /no-store/)
    assert.equal((await reportPreviewResponse(request({ body: 'x'.repeat(8193) }), env())).status, 413)
  } finally { globalThis.fetch = previous }
})
test('new design preserves native modal and gates production client separately', () => {
  const ui = readFileSync(new URL('../src/components/QuickReportModal.tsx', import.meta.url), 'utf8')
  const client = readFileSync(new URL('../src/api/quickReports.ts', import.meta.url), 'utf8')
  assert.match(ui, /node\.showModal\(\)/)
  assert.match(ui, /attachReportViewport\(node\)/)
  assert.match(ui, /createPortal\(/)
  assert.match(ui, /\['missing', 'location', 'closed', 'new'\]/)
  assert.match(ui, /onClick=\{back\}>\{q\('no'\)\}/)
  assert.match(ui, /flight\.current/)
  assert.match(ui, /timeZone: 'Asia\/Seoul'/)
  assert.match(client, /reportDestination\(window\.location\.hostname/)
  assert.match(client, /NEXT_PUBLIC_REPORT_REDESIGN_RELEASE/)
  assert.match(ui, /QUICK_REPORTS_PREVIEW &&/)
  assert.doesNotMatch(client, /api\.geupddong\.com/)
})
