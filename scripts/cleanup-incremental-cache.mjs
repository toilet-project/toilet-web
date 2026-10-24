import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {normalizeDeploymentStatus} from './cache/cleanup-lib.mjs'
import {parseCleanupArguments,runIncrementalCacheCleanup} from './cache/cleanup-runner-lib.mjs'
import {R2S3Store} from './cache/r2-s3-store.mjs'
const executeFile=promisify(execFile),values=process.argv.slice(2),workerName='geupddong-web-production'
let args
try{args=parseCleanupArguments(values)}
catch{
  const reportIndex=values.indexOf('--report'),report=reportIndex<0?undefined:values[reportIndex+1]
  args={argumentError:true,execute:values.includes('--execute'),report:report?.startsWith('--')?undefined:report}
}
const wrangler=process.platform==='win32'?resolve('node_modules/.bin/wrangler.CMD'):resolve('node_modules/.bin/wrangler')
const result=await runIncrementalCacheCleanup({args,env:process.env,
  getDeploymentStatus:async()=>{
    const {stdout}=await executeFile(wrangler,['deployments','status','--name',workerName,'--config','wrangler.production.jsonc','--json'],{maxBuffer:1024*1024})
    return normalizeDeploymentStatus(JSON.parse(stdout),workerName)
  },
  readRegistry:async path=>JSON.parse(await readFile(path,'utf8')),
  createStore:config=>new R2S3Store(config),
  writeReport:report=>writeFile(args.report,JSON.stringify(report,null,2)+'\n'),
  onProgress:progress=>console.log(JSON.stringify(progress)),
})
// Subprocess/R2 errors can contain credentials, signed URLs, command output or
// arbitrary object keys. Never rethrow them or emit their original messages.
console.log(JSON.stringify({mode:result.mode,status:result.status,stage:result.stage,failure:result.failure,
  inventory:result.inventory,execution:result.execution,...(result.summary??{}),
  ...(result.reportWriteFailure?{reportWriteFailure:result.reportWriteFailure}:{})}))
if(result.status!=='completed')process.exitCode=1
