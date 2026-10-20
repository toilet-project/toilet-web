import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))

// Follow eager source imports, including re-exports. A lazy import is a
// separate bundle, so it intentionally does not participate in this graph.
async function eagerFiles(entry) {
  const visited = new Set()
  async function visit(path) {
    if (visited.has(path)) return
    visited.add(path)
    if (!/\.[cm]?[jt]sx?$/.test(path)) return
    const source = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true)
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
      if (statement.isTypeOnly || statement.importClause?.isTypeOnly) continue
      const bindings = statement.importClause?.namedBindings ?? statement.exportClause
      if (!statement.importClause?.name && bindings && ts.isNamedImports(bindings)
        && bindings.elements.length && bindings.elements.every(binding => binding.isTypeOnly)) continue
      if (bindings && ts.isNamedExports(bindings) && bindings.elements.length
        && bindings.elements.every(binding => binding.isTypeOnly)) continue
      const specifier = statement.moduleSpecifier
      if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue
      const candidate = resolve(dirname(path), specifier.text)
      const target = extname(candidate) ? candidate
        : [candidate + '.ts', candidate + '.tsx', candidate + '.js', resolve(candidate, 'index.ts')].find(existsSync)
      if (target) await visit(target)
    }
  }
  await visit(resolve(root, entry))
  return [...visited].map(path => path.slice(root.length).replaceAll('\\', '/'))
}

test('the homepage shell does not eagerly ship administrative boundary datasets', async () => {
  const files = await eagerFiles('src/components/MapShell.tsx')
  assert.deepEqual(files.filter(path => /^data\/regions\/(?:sido|sgg|toilet-boundary-overrides)\.json$/.test(path)), [])
})

test('the initial homepage bridge does not eagerly ship detail-only boundary datasets', async () => {
  const files = await eagerFiles('src/components/HomeRouteBridge.tsx')
  assert.deepEqual(files.filter(path => path.startsWith('data/regions/')), [])
  assert.deepEqual(files.filter(path => path.startsWith('src/components/reviews/')
    || /\/Toilet(?:Detail|Community|Card|Share)/.test(path)), [])
})

test('map location validation loads only the national outline, never district release data', async () => {
  const files = await eagerFiles('src/lib/mapStart.ts')
  assert.deepEqual(files.filter(path => path.startsWith('data/regions/')), ['data/regions/sido.json'])
})

test('the interactive home map does not restore the district dataset through another eager dependency', async () => {
  const files = await eagerFiles('src/App.tsx')
  assert.deepEqual(files.filter(path => path.startsWith('data/regions/')), ['data/regions/sido.json'])
})
