import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fillFingerprint, fillSharedData, selectInvalidatedPublicIds } from './cache/fill-shared-lib.mjs'

const { values: args } = parseArgs({ options: {
  execute: { type: 'boolean' }, 'allow-production': { type: 'boolean' },
  inventory: { type: 'string' }, 'public-ids': { type: 'string' }, checkpoint: { type: 'string' },
  'base-url': { type: 'string', default: 'https://geupddong.com' },
  limit: { type: 'string' }, rps: { type: 'string', default: '4' }, concurrency: { type: 'string', default: '3' },
} })
if (!args.inventory || !args['public-ids'] || !args.checkpoint) throw new Error('Inventory, public IDs and checkpoint required')
const objects = JSON.parse(await readFile(args.inventory, 'utf8'))
const publicIds = JSON.parse(await readFile(args['public-ids'], 'utf8'))
const ids = selectInvalidatedPublicIds(objects, publicIds)
const baseUrl = args['base-url']
const fingerprint = fillFingerprint(baseUrl, ids)
if (!args.execute) {
  console.log(JSON.stringify({ dryRun: true, target: ids.length, fingerprint, firstIds: ids.slice(0, 10) }))
} else {
  if (baseUrl === 'https://geupddong.com' && !args['allow-production']) throw new Error('Explicit production flag required')
  const path = resolve(args.checkpoint)
  let checkpoint = { schema: 1, fingerprint, completed: [], notFound: [] }
  try { checkpoint = JSON.parse(await readFile(path, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  await mkdir(dirname(path), { recursive: true })
  const report = await fillSharedData({ ids, baseUrl, checkpoint, maxItems: args.limit ? Number(args.limit) : ids.length,
    rps: Number(args.rps), concurrency: Number(args.concurrency),
    save: async value => { await writeFile(`${path}.tmp`, JSON.stringify(value)); await rename(`${path}.tmp`, path) },
    onProgress: value => console.log(JSON.stringify({ type: 'progress', ...value })),
  })
  await writeFile(`${path}.report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ type: 'complete', ...report }))
  if (report.failures.length) process.exitCode = 1
}
