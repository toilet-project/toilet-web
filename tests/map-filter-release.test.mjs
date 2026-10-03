import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const source = stripTypeScriptTypes(readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8'))
  .replace('export default config', 'globalThis.result = config')
const enabled = env => {
  const scope = { process: { env } }
  runInNewContext(source, scope)
  return scope.result.env.NEXT_PUBLIC_MAP_FILTERS_ENABLED
}

test('map filters require the matching explicit build-time preview or production gate', () => {
  assert.equal(enabled({ SITE_INDEXABLE: 'false', MAP_FILTERS_PREVIEW: 'true' }), 'true')
  assert.equal(enabled({ SITE_INDEXABLE: 'true', MAP_FILTERS_RELEASE: 'true' }), 'true')
  for (const env of [{}, { MAP_FILTERS_RELEASE: 'true' }, { MAP_FILTERS_PREVIEW: 'true' },
    { SITE_INDEXABLE: 'true', MAP_FILTERS_PREVIEW: 'true' },
    { SITE_INDEXABLE: 'false', MAP_FILTERS_RELEASE: 'true' },
    { SITE_INDEXABLE: 'true', MAP_FILTERS_RELEASE: 'false', MAP_FILTERS_ENABLED: 'true' },
    { SITE_INDEXABLE: 'false', MAP_FILTERS_PREVIEW: 'false', MAP_FILTERS_ENABLED: 'true' }])
    assert.equal(enabled(env), 'false')
})

test('both production candidate pipelines compile the approved filter UI without changing live preview', () => {
  const workers = readFileSync(new URL('../.github/workflows/workers-validation.yml', import.meta.url), 'utf8')
  const review = readFileSync(new URL('../.github/workflows/review-api-validation.yml', import.meta.url), 'utf8')
  assert.match(workers, /MAP_FILTERS_RELEASE:.*matrix.target == 'production-candidate' && 'true' \|\| 'false'/)
  const livePreview = review.split('  live-data-preview:')[1].split('  production-candidate:')[0]
  const production = review.split('  production-candidate:')[1]
  assert.match(livePreview, /MAP_FILTERS_PREVIEW: 'true'/)
  assert.doesNotMatch(livePreview, /MAP_FILTERS_RELEASE/)
  assert.match(production, /MAP_FILTERS_RELEASE: 'true'/)
  assert.doesNotMatch(production, /MAP_FILTERS_PREVIEW/)
})
