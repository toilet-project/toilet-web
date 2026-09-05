import {readFile} from 'node:fs/promises'
const config=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'))
const id=config.d1_databases?.find(db=>db.binding==='NEXT_TAG_CACHE_D1')?.database_id
if(!id || id==='00000000-0000-0000-0000-000000000000') {
  throw new Error('Deployment blocked: approve and configure a real preview tag-cache D1 binding first. Validation/dry-run does not deploy.')
}
