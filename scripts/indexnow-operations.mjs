import { pathToFileURL } from 'node:url'
import { createIndexNowManageRequest, INDEXNOW_MANAGE_PATH } from '../indexnow-dispatch.mjs'

export async function runIndexNowOperation(args, env = process.env, fetchImpl = fetch) {
  const flags = new Map()
  for (let i = 0; i < args.length; i++) {
    const name = args[i]
    if (!['--target', '--action', '--kind', '--cursor', '--key', '--etag', '--confirm-reviewed', '--allow-production'].includes(name)
      || flags.has(name)) throw new Error('Invalid operator arguments')
    flags.set(name, ['--confirm-reviewed', '--allow-production'].includes(name) ? true : args[++i])
  }
  const target = flags.get('--target'), action = flags.get('--action') ?? 'status'
  if (!['preview', 'production'].includes(target) || !['status', 'inspect', 'recover', 'compact'].includes(action))
    throw new Error('Explicit target and supported action required')
  if (flags.has('--allow-production') && target !== 'production') throw new Error('Invalid target confirmation')
  const confirm = flags.get('--confirm-reviewed') === true
  if (confirm && !['recover', 'compact'].includes(action)) throw new Error('Confirmation requires a mutation action')
  if (confirm && target === 'production' && flags.get('--allow-production') !== true)
    throw new Error('Production mutation requires separate approval and explicit confirmation')
  const operation = action === 'status' ? { action }
    : action === 'inspect' ? { action, kind: flags.get('--kind'), cursor: flags.get('--cursor') }
    : { action, key: flags.get('--key'), etag: flags.get('--etag'), confirm }
  const signed = await createIndexNowManageRequest(env.CACHE_REVALIDATION_SECRET, operation)
  const origin = target === 'preview' ? 'https://preview.geupddong.com' : 'https://geupddong.com'
  const response = await fetchImpl(new Request(origin + INDEXNOW_MANAGE_PATH, signed), { signal: AbortSignal.timeout(10_000) })
  const result = await response.json()
  if (![200, 409].includes(response.status)) throw new Error(`IndexNow operation unavailable (${response.status})`)
  return result
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await runIndexNowOperation(process.argv.slice(2)), null, 2)) }
  catch { console.error('IndexNow operation failed. Check target, signed access and reviewed operation; no secret is printed.'); process.exitCode = 1 }
}
