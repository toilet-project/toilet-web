import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { indexNowReleaseFeature } from '../scripts/worker-release-policy.mjs'

const execute = promisify(execFile), digest = value => createHash('sha256').update(value).digest('hex')
const verifier = fileURLToPath(new URL('../scripts/verify-worker-release.mjs', import.meta.url))
test('extracted artifact verification rejects a missing or altered IndexNow helper and mismatched release plan', async t => {
  const root = await mkdtemp(join(tmpdir(), 'indexnow-release-test-'))
  t.after(async () => {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe test cleanup path')
    await rm(root, { recursive: true, force: true })
  })
  const config = JSON.parse(await readFile(new URL('../wrangler.production.jsonc', import.meta.url), 'utf8'))
  const raw = JSON.stringify(config), helper = 'export const runtime = "isolated fixture"\n', commit = 'a'.repeat(40)
  const manifest = { target: 'production-candidate', sourceCommit: commit, buildId: 'test-build',
    appVersion: `${commit}-1-1-production-candidate`, indexable: true, configFile: 'wrangler.production.jsonc',
    configSha256: digest(raw), deploymentApproved: false,
    features: { memberGrowth: true, indexNow: indexNowReleaseFeature(config, 'production-candidate') },
    runtime: { indexNowDispatchSha256: digest(helper) } }
  const files = { 'wrangler.production.jsonc': raw, 'worker-release-manifest.json': JSON.stringify(manifest),
    '.next/BUILD_ID': 'test-build', 'indexnow-dispatch.mjs': helper }
  for (const path of ['custom-worker.mjs', '.open-next/worker.js', 'worker-cache-policy.mjs', 'region-markers-worker.ts',
    'src/lib/regionMarkerStore.ts', 'src/lib/regionDisplayItems.ts', 'src/i18n/toiletTranslations.ts', 'data/regions/boundary-assets.json'])
    files[path] = 'fixture'
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  const run = () => execute(process.execPath, [verifier, root, 'production-candidate', commit, '--expect-member-growth=true'])
  const good = JSON.parse((await run()).stdout)
  assert.equal(good.verified, true); assert.equal(good.indexNow.durable, false); assert.equal(good.deploymentApproved, false)
  await writeFile(join(root, 'indexnow-dispatch.mjs'), helper + '// changed')
  await assert.rejects(run(), /IndexNow runtime changed/)
  await rm(join(root, 'indexnow-dispatch.mjs'))
  await assert.rejects(run(), /ENOENT/)
  await writeFile(join(root, 'indexnow-dispatch.mjs'), helper)
  await writeFile(join(root, 'worker-release-manifest.json'), JSON.stringify({ ...manifest,
    features: { ...manifest.features, indexNow: { enabled: true, durable: true, cron: '*/10 * * * *' } } }))
  await assert.rejects(run(), /IndexNow artifact\/config mismatch/)
})
