import assert from 'node:assert/strict'
export function validateWorkerConfig(config, target, {deploy = false} = {}) {
  assert.ok(['preview', 'production-candidate'].includes(target), 'Unknown release target')
  const production = target === 'production-candidate'
  const suffix = production ? 'production' : 'preview'
  assert.equal(config.name, `geupddong-web-${suffix}`, 'Wrong Worker')
  assert.equal(config.vars?.SITE_INDEXABLE, String(production), 'Wrong runtime indexing policy')
  assert.equal(config.vars?.CACHE_RUNTIME, 'workers')
  assert.equal(config.services?.find(row => row.binding === 'WORKER_SELF_REFERENCE')?.service, config.name)
  assert.equal(config.r2_buckets?.find(row => row.binding === 'NEXT_INC_CACHE_R2_BUCKET')?.bucket_name, `geupddong-next-${suffix}-cache`)
  const d1 = config.d1_databases?.find(row => row.binding === 'NEXT_TAG_CACHE_D1')
  assert.equal(d1?.database_name, `geupddong-next-${suffix}-tags`)
  assert.equal(config.route, undefined, 'Unexpected singular route')
  assert.equal(config.env, undefined, 'Nested environment overrides are not supported')
  assert.equal(config.limits?.cpu_ms, undefined, 'No automatic Paid-only limit setting')
  if (production) {
    assert.equal(config.workers_dev, false)
    assert.deepEqual(config.routes, [], 'Candidate must not claim any domain')
    assert.notEqual(d1?.database_id, 'bbf77cf5-62e9-4c94-a8ec-a45c0e26deed', 'Never share preview tag storage')
    assert.equal(deploy, false, 'Production deployment is not enabled: approve resources/domain/callback/monitor cutover first')
  } else {
    assert.deepEqual(config.routes, [{pattern:'preview.geupddong.com', custom_domain:true}])
    assert.match(d1?.database_id || '', /^[a-f0-9-]{36}$/i, 'Missing D1 ID')
    assert.notEqual(d1.database_id, '00000000-0000-0000-0000-000000000000', 'Missing D1 ID')
  }
}

export function validateBuildPolicy(config, target, indexable, routesManifest) {
  validateWorkerConfig(config, target)
  assert.equal(indexable, config.vars.SITE_INDEXABLE, 'Build/runtime indexing mismatch')
  const headers = routesManifest.headers.flatMap(row => row.headers)
  const robots = headers.filter(row => row.key.toLowerCase() === 'x-robots-tag')
  if (target === 'preview') assert.ok(robots.some(row => /noindex/.test(row.value)), 'Preview build must prevent indexing')
  else assert.equal(robots.length, 0, 'Production candidate contains preview noindex header')
}
