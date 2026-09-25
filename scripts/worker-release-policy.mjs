import assert from 'node:assert/strict'
export function validateWorkerConfig(config, target, {deploy = false, stage = false} = {}) {
  assert.ok(['preview', 'production-candidate'].includes(target), 'Unknown release target')
  const production = target === 'production-candidate'
  const suffix = production ? 'production' : 'preview'
  assert.equal(config.name, `geupddong-web-${suffix}`, 'Wrong Worker')
  assert.equal(config.main, 'custom-worker.mjs', 'Navigation response cache guard must wrap OpenNext')
  assert.equal(config.vars?.SITE_INDEXABLE, String(production), 'Wrong runtime indexing policy')
  assert.equal(config.vars?.CACHE_RUNTIME, 'workers')
  assert.equal(config.vars?.MAP_CELL_CACHE_ENABLED, 'true', 'Map cell R2 cache must be enabled in both targets')
  assert.equal(config.vars?.REGION_MARKER_CACHE_ENABLED, 'true', 'Region marker R2 cache must be enabled in both targets')
  assert.equal(config.services?.find(row => row.binding === 'WORKER_SELF_REFERENCE')?.service, config.name)
  assert.equal(config.r2_buckets?.find(row => row.binding === 'NEXT_INC_CACHE_R2_BUCKET')?.bucket_name, `geupddong-next-${suffix}-cache`)
  assert.equal(config.r2_buckets?.find(row => row.binding === 'PUBLIC_TOILET_DATA_CACHE_R2')?.bucket_name, `geupddong-next-${suffix}-cache`)
  assert.equal(
    config.vars?.SHARED_TOILET_CACHE_ENABLED,
    production ? 'true' : 'false',
    production ? 'Production shared cache must stay enabled after cutover' : 'Preview shared cache must remain disabled'
  )
  if (production) {
    assert.equal(config.vars?.SHARED_TOILET_CACHE_FRESH_SECONDS, '2592000', 'Production detail data must stay fresh for 30 days')
    assert.equal(config.vars?.SHARED_TOILET_CACHE_STALE_SECONDS, '3196800', 'Production stale fallback must cover seven additional days')
    assert.equal(config.vars?.SHARED_TOILET_CACHE_NEGATIVE_SECONDS, '300', 'Production negative cache must stay short')
  }
  const d1 = config.d1_databases?.find(row => row.binding === 'NEXT_TAG_CACHE_D1')
  const placeSearchD1 = config.d1_databases?.find(row => row.binding === 'PLACE_SEARCH_D1')
  assert.equal(d1?.database_name, `geupddong-next-${suffix}-tags`)
  assert.equal(config.route, undefined, 'Unexpected singular route')
  assert.equal(config.env, undefined, 'Nested environment overrides are not supported')
  assert.equal(config.limits?.cpu_ms, undefined, 'No automatic Paid-only limit setting')
  if (production) {
    assert.equal(config.vars?.NAVER_MAP_ENABLED, 'true', 'Approved production Naver map must be enabled')
    assert.equal(config.vars?.PLACE_SEARCH_ENABLED, 'true', 'Approved production place search must be enabled')
    assert.equal(config.vars?.PLACE_SEARCH_SCOPE, 'production')
    assert.equal(placeSearchD1?.database_name, 'geupddong-place-search-production')
    assert.equal(placeSearchD1?.database_id, 'd5c538a0-5655-4acb-aa7f-4bc502c89621', 'Production must bind only the approved place-search database')
    assert.notEqual(placeSearchD1.database_id, d1?.database_id, 'Place search and tag cache must use separate D1 databases')
    assert.equal(config.workers_dev, false)
    assert.equal(config.preview_urls, false, 'Candidate version URLs must remain disabled')
    assert.deepEqual(config.routes, [], 'Candidate must not claim any domain')
    assert.notEqual(d1?.database_id, 'bbf77cf5-62e9-4c94-a8ec-a45c0e26deed', 'Never share preview tag storage')
    if (deploy) {
      assert.equal(stage, true, 'Production candidate upload must not change public routes directly')
      assert.match(d1?.database_id || '', /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i)
      assert.notEqual(d1.database_id, '00000000-0000-0000-0000-000000000000', 'Missing D1 ID')
    }
  } else {
    assert.equal(config.vars?.NAVER_MAP_ENABLED, 'true')
    assert.equal(config.vars?.PLACE_SEARCH_ENABLED, 'true')
    assert.equal(config.vars?.PLACE_SEARCH_SCOPE, 'preview')
    assert.equal(placeSearchD1?.database_name, 'geupddong-place-search-preview')
    assert.match(placeSearchD1?.database_id || '', /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i)
    assert.notEqual(placeSearchD1?.database_id, d1?.database_id, 'Place search and tag cache must use separate D1 databases')
    assert.deepEqual(config.routes, [{pattern:'preview.geupddong.com', custom_domain:true}])
    assert.match(d1?.database_id || '', /^[a-f0-9-]{36}$/i, 'Missing D1 ID')
    assert.notEqual(d1.database_id, '00000000-0000-0000-0000-000000000000', 'Missing D1 ID')
  }
}

export function validateReleaseManifest(manifest, config, configHash, buildId, expectedCommit, target, expectedAppVersion) {
  validateWorkerConfig(config, target)
  assert.match(expectedCommit, /^[a-f0-9]{40}$/, 'Explicit source commit required')
  assert.equal(manifest.target, target, 'Wrong artifact target')
  assert.equal(manifest.sourceCommit, expectedCommit, 'Wrong artifact commit')
  assert.equal(manifest.configFile, target === 'preview' ? 'wrangler.jsonc' : 'wrangler.production.jsonc')
  assert.equal(manifest.configSha256, configHash, 'Config changed after CI build')
  assert.equal(manifest.buildId, buildId, 'Build ID mismatch')
  const appVersion = manifest.appVersion || ''
  const versionPrefix = `${expectedCommit}-`
  const versionSuffix = `-${target}`
  assert.ok(
    appVersion.startsWith(versionPrefix) && appVersion.endsWith(versionSuffix),
    'Invalid app/deployment version'
  )
  const numericVersion = appVersion.slice(versionPrefix.length, -versionSuffix.length)
  assert.match(numericVersion, /^[0-9]+-[0-9]+$/, 'Invalid app/deployment version')
  if (expectedAppVersion !== undefined) assert.equal(manifest.appVersion, expectedAppVersion, 'App/deployment version mismatch')
  assert.equal(manifest.indexable, target === 'production-candidate')
  assert.equal(manifest.deploymentApproved, false, 'Artifact cannot grant deployment approval')
}

export function validateBuildPolicy(config, target, indexable, routesManifest) {
  validateWorkerConfig(config, target)
  assert.equal(indexable, config.vars.SITE_INDEXABLE, 'Build/runtime indexing mismatch')
  const headers = routesManifest.headers.flatMap(row => row.headers)
  const robots = headers.filter(row => row.key.toLowerCase() === 'x-robots-tag')
  if (target === 'preview') assert.ok(robots.some(row => /noindex/.test(row.value)), 'Preview build must prevent indexing')
  else assert.equal(robots.length, 0, 'Production candidate contains preview noindex header')
}
