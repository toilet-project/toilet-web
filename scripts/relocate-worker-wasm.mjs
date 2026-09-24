import assert from 'node:assert/strict'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

// OpenNext's middleware can retain absolute build-host paths for @vercel/og.
// Place the two WASM modules beside the middleware before packaging its artifact.
const output = resolve(process.argv[2] ?? '.')
const modules = resolve(process.argv[3] ?? 'node_modules/next/dist/compiled/@vercel/og')
const middleware = join(output, '.open-next/middleware/handler.mjs')
let source = await readFile(middleware, 'utf8')
for (const name of ['yoga', 'resvg']) {
  const pattern = new RegExp(`"[^"\\n]*/@vercel/og/${name}\\.wasm\\?module"`, 'g')
  const matches = [...source.matchAll(pattern)]
  assert.equal(matches.length, 1, `Expected one ${name}.wasm import`)
  source = source.replace(pattern, `"./${name}.wasm?module"`)
  await copyFile(join(modules, `${name}.wasm`), join(output, `.open-next/middleware/${name}.wasm`))
}
await writeFile(middleware, source)
console.log('Relocated two middleware WASM modules into the Worker artifact')
