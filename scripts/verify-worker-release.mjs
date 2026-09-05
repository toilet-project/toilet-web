// Read-only: checks an extracted CI artifact; never uploads or deploys it.
import {readFile, access} from 'node:fs/promises'
import {resolve, join} from 'node:path'
import {createHash} from 'node:crypto'
import {validateWorkerConfig, validateReleaseManifest} from './worker-release-policy.mjs'
const [directory, target, commit, ...extra] = process.argv.slice(2)
if (!directory || !['preview','production-candidate'].includes(target) || extra.length) throw new Error('Usage: verify-worker-release.mjs DIRECTORY TARGET FULL_COMMIT')
const root = resolve(directory)
const file = target === 'preview' ? 'wrangler.jsonc' : 'wrangler.production.jsonc'
const opposite = target === 'preview' ? 'wrangler.production.jsonc' : 'wrangler.jsonc'
try { await access(join(root,opposite)); throw new Error('Mixed deployment configs') }
catch(error) { if(error.code !== 'ENOENT') throw error }
const raw = await readFile(join(root,file),'utf8')
const config = JSON.parse(raw)
const manifest = JSON.parse(await readFile(join(root,'worker-release-manifest.json'),'utf8'))
const buildId = (await readFile(join(root,'.next/BUILD_ID'),'utf8')).trim()
validateReleaseManifest(manifest,config,createHash('sha256').update(raw).digest('hex'),buildId,commit,target)
validateWorkerConfig(config,target,{deploy:true,stage:target==='production-candidate'})
console.log(JSON.stringify({verified:true,target,commit,buildId,publicRoutes:config.routes.length}))
