import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'

test('live routing is limited to root/www and cannot change the runtime or paid limits', async()=>{
  const config=JSON.parse(await readFile(new URL('../wrangler.production.routes.jsonc',import.meta.url)))
  assert.deepEqual(config, {
    $schema:'node_modules/wrangler/config-schema.json',
    name:'geupddong-web-production', workers_dev:false, preview_urls:false,
    routes:[
      {pattern:'geupddong.com/*',zone_name:'geupddong.com'},
      {pattern:'www.geupddong.com/*',zone_name:'geupddong.com'},
    ],
    triggers:{crons:[]},
  })
})
