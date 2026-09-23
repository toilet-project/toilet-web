import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {assertAutomaticCleanupPlan,assertReviewedCleanupPlan,normalizeDeploymentStatus,planIncrementalCacheCleanup,sameActiveDeployment,selectAutomaticCleanupBatch,selectRetiredNamespaceCleanup} from './cache/cleanup-lib.mjs'
import {R2S3Store} from './cache/r2-s3-store.mjs'
const executeFile=promisify(execFile)
function argsOf(values){const out={};for(let i=0;i<values.length;i++){const key=values[i];if(['--execute','--automatic'].includes(key)){out[key.slice(2)]=true;continue}if(!key.startsWith('--')||values[i+1]===undefined)throw new Error(`Invalid argument ${key}`);out[key.slice(2)]=values[++i]}return out}
const args=argsOf(process.argv.slice(2)),workerName='geupddong-web-production'
if(!args.registry||!args.report)throw new Error('Required: --registry FILE --report FILE')
if(args.execute&&process.env.CACHE_CLEANUP_ENABLED!=='true')throw new Error('Deletion disabled; CACHE_CLEANUP_ENABLED=true is also required')
if(args.automatic&&(!args.execute||process.env.CACHE_CLEANUP_AUTOMATIC_ENABLED!=='true'))throw new Error('Automatic deletion is disabled')
if(args.automatic&&args['only-namespace'])throw new Error('Manual namespace selection cannot run automatically')
const rollbackProtectionDays=Number(args['rollback-days']??3)
if(!Number.isSafeInteger(rollbackProtectionDays)||rollbackProtectionDays<0||rollbackProtectionDays>30)throw new Error('Invalid rollback protection days')
if(rollbackProtectionDays<3&&args.execute&&!args.automatic&&!args['only-namespace'])throw new Error('Manual deletion with reduced rollback protection requires an exact namespace')
function requiredExpected(name){
  const value=args[name]
  if(value===undefined||value==='')throw new Error(`Execution requires --${name}`)
  return value
}
const wrangler=process.platform==='win32'?resolve('node_modules/.bin/wrangler.CMD'):resolve('node_modules/.bin/wrangler')
async function status(){
  const {stdout}=await executeFile(wrangler,['deployments','status','--name',workerName,'--config','wrangler.production.jsonc','--json'],{maxBuffer:1024*1024})
  return normalizeDeploymentStatus(JSON.parse(stdout),workerName)
}
const config={accountId:process.env.R2_ACCOUNT_ID,accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,bucket:process.env.R2_INCREMENTAL_CACHE_BUCKET}
if(config.bucket!=='geupddong-next-production-cache')throw new Error('Exact production incremental-cache bucket is required')
const store=new R2S3Store(config),before=await status(),releases=JSON.parse(await readFile(args.registry,'utf8'))
const objects=await store.list('incremental-cache/')
const fullPlan=planIncrementalCacheCleanup({objects,releases,activeWorkerVersions:before.activeWorkerVersions,rollbackProtectionDays})
const automaticLimits=args.automatic?{maxFiles:requiredExpected('max-delete-files'),maxBytes:requiredExpected('max-delete-bytes')}:null
const plan=args.automatic?selectAutomaticCleanupBatch(fullPlan,automaticLimits)
  :args['only-namespace']?selectRetiredNamespaceCleanup(fullPlan,releases,before.activeWorkerVersions,args['only-namespace']):fullPlan
const result={...plan,mode:args.execute?'execute':'dry-run',execution:{attempted:false,startedAt:null,deletedFiles:0,completedAt:null,error:null}}
await writeFile(args.report,JSON.stringify(result,null,2)+'\n')
if(args.execute){
  assertReviewedCleanupPlan(plan,{files:requiredExpected('expected-delete-files'),bytes:requiredExpected('expected-delete-bytes'),
    fingerprint:requiredExpected('expected-delete-fingerprint')},{allowUnknownObjects:args.automatic})
  if(args.automatic)assertAutomaticCleanupPlan(plan,automaticLimits)
  const after=await status();if(!sameActiveDeployment(before,after))throw new Error('Active deployment changed before deletion')
  result.execution.attempted=true;result.execution.startedAt=new Date().toISOString()
  await writeFile(args.report,JSON.stringify(result,null,2)+'\n')
  try{
    await store.delete(plan.deleteObjects.map(object=>object.key),{beforeBatch:async({offset})=>{
      if(offset%10_000!==0)return
      const current=await status();if(!sameActiveDeployment(before,current))throw new Error('Active deployment changed during deletion')
    },onBatch:({deletedFiles,totalFiles})=>{
      result.execution.deletedFiles=deletedFiles
      console.log(JSON.stringify({type:'delete-progress',deletedFiles,totalFiles}))
    }})
    result.execution.completedAt=new Date().toISOString()
    await writeFile(args.report,JSON.stringify(result,null,2)+'\n')
  }catch(error){
    result.execution.completedAt=new Date().toISOString();result.execution.error=error instanceof Error?error.message:String(error)
    await writeFile(args.report,JSON.stringify(result,null,2)+'\n')
    throw error
  }
}
console.log(JSON.stringify({mode:args.execute?'execute':'dry-run',report:args.report,...plan.summary}))
