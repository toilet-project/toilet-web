import {readFile, writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {validateBuildPolicy, growthBuildFeature} from './worker-release-policy.mjs'
const target = process.argv[2]
if (!['preview','production-candidate'].includes(target)) throw new Error('Explicit release target required')
const path = target === 'preview' ? 'wrangler.jsonc' : 'wrangler.production.jsonc'
const raw = await readFile(path, 'utf8')
const config = JSON.parse(raw)
const routes = JSON.parse(await readFile('.next/routes-manifest.json', 'utf8'))
validateBuildPolicy(config, target, process.env.SITE_INDEXABLE, routes)
const requiredServerFiles = JSON.parse(await readFile('.next/required-server-files.json', 'utf8'))
const memberGrowth = growthBuildFeature(requiredServerFiles, process.env.NEXT_PUBLIC_GROWTH_ENABLED)
const manifest = { target, sourceCommit: process.env.GITHUB_SHA || null,
  buildId: (await readFile('.next/BUILD_ID','utf8')).trim(), appVersion: process.env.NEXT_DEPLOYMENT_ID || null,
  indexable: config.vars.SITE_INDEXABLE === 'true',
  features: { memberGrowth },
  configFile: path, configSha256: createHash('sha256').update(raw).digest('hex'), deploymentApproved: false }
await writeFile('worker-release-manifest.json', JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify(manifest))
