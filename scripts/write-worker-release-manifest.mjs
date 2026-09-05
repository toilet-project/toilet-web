import {readFile, writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {validateBuildPolicy} from './worker-release-policy.mjs'
const target = process.argv[2]
if (!['preview','production-candidate'].includes(target)) throw new Error('Explicit release target required')
const path = target === 'preview' ? 'wrangler.jsonc' : 'wrangler.production.jsonc'
const raw = await readFile(path, 'utf8')
const config = JSON.parse(raw)
const routes = JSON.parse(await readFile('.next/routes-manifest.json', 'utf8'))
validateBuildPolicy(config, target, process.env.SITE_INDEXABLE, routes)
const manifest = { target, sourceCommit: process.env.GITHUB_SHA || null,
  buildId: (await readFile('.next/BUILD_ID','utf8')).trim(), indexable: config.vars.SITE_INDEXABLE === 'true',
  configFile: path, configSha256: createHash('sha256').update(raw).digest('hex'), deploymentApproved: false }
await writeFile('worker-release-manifest.json', JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify(manifest))
