import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {dirname,join} from 'node:path'
import {validateWorkerConfig} from './worker-release-policy.mjs'

// pnpm appends script arguments to the final command. Do not let --config
// bypass a preview check and reach a different deployment target.
if(process.argv.length!==2){
  console.error('Preview deployment accepts no arguments. Use release:stage-production and release:activate-production for an approved production release.')
  process.exitCode=1
}else{
  const root=dirname(dirname(fileURLToPath(import.meta.url))),config=join(root,'wrangler.jsonc')
  validateWorkerConfig(JSON.parse(await readFile(config,'utf8')),'preview',{deploy:true})
  const run=promisify(execFile),cli=join(root,'node_modules/@opennextjs/cloudflare/dist/cli/index.js')
  for(const command of ['build','deploy']){
    const result=await run(process.execPath,[cli,command,'--config',config],{cwd:root,maxBuffer:16*1024*1024})
    process.stdout.write(result.stdout)
  }
}
