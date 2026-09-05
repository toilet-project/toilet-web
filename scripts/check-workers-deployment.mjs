import {readFile} from 'node:fs/promises'
import {validateWorkerConfig} from './worker-release-policy.mjs'
const target = process.argv[2] || 'preview'
const file = target === 'production-candidate' ? 'wrangler.production.jsonc' : 'wrangler.jsonc'
const config=JSON.parse(await readFile(new URL('../'+file,import.meta.url),'utf8'))
validateWorkerConfig(config, target, {deploy:true})
