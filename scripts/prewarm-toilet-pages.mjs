import {mkdir,writeFile} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {collectPublicToiletIds,failedIdsFromCheckpoint,normalizeBaseUrl,positiveInteger,prewarmToiletPages} from './cache/prewarm-lib.mjs'

function argumentsOf(values){
  const parsed={}
  for(let index=0;index<values.length;index++){
    const key=values[index]
    if(!key.startsWith('--')) throw new Error(`Unexpected argument ${key}`)
    if(['--execute','--require-fresh','--failed-from-checkpoint'].includes(key)){parsed[key.slice(2)]=true;continue}
    const value=values[++index]
    if(value===undefined||value.startsWith('--')) throw new Error(`Missing value for ${key}`)
    parsed[key.slice(2)]=value
  }
  return parsed
}
const args=argumentsOf(process.argv.slice(2))
if(!args.execute || process.env.CACHE_PREWARM_ENABLED!=='true') throw new Error('Prewarm execution is disabled; both --execute and CACHE_PREWARM_ENABLED=true are required')
const baseUrl=normalizeBaseUrl(args['base-url'])
const deploymentId=args['deployment-id']
if(!deploymentId || !/^[a-zA-Z0-9._-]{4,200}$/.test(deploymentId)) throw new Error('Explicit deployment ID required')
const requestTimeoutMs=positiveInteger(args['request-timeout-seconds']||30,'request timeout seconds',{maximum:300})*1000
const safeDeployment=deploymentId.replace(/[^a-zA-Z0-9._-]/g,'_')
const checkpointPath=resolve(args.checkpoint||`.cache-prewarm/${safeDeployment}.json`)
const mode=args['failed-from-checkpoint']?'failed':args.ids?'ids':args.shard!==undefined?'shard':'all'
const ids=mode==='failed'
  ? await failedIdsFromCheckpoint(checkpointPath,deploymentId)
  : await collectPublicToiletIds({baseUrl,mode,ids:args.ids?.split(',')??[],shard:args.shard,requestTimeoutMs})
if(!ids.length) throw new Error(mode==='failed'?'No failed toilet IDs found in the restored checkpoint':'No public toilet IDs selected')
const reportPath=resolve(args.report||`cache-prewarm-report-${safeDeployment}.json`)
const requireFresh=Boolean(args['require-fresh'])
let report
try {
  report=await prewarmToiletPages({fetchImpl:fetch,waitImpl:milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds)),baseUrl,deploymentId,ids,checkpointPath,
    concurrency:positiveInteger(args.concurrency||4,'concurrency',{maximum:32}),rps:positiveInteger(args.rps||2,'rps',{maximum:50}),
    maxSeconds:positiveInteger(args['max-minutes']||300,'max minutes',{maximum:330})*60,retries:positiveInteger(args.retries||3,'retries',{minimum:0,maximum:10}),requestTimeoutMs,
    requireFresh,freshAttempts:positiveInteger(args['fresh-attempts']||5,'fresh attempts',{maximum:10}),
    freshWaitMs:positiveInteger(args['fresh-wait-seconds']||1,'fresh wait seconds',{maximum:30})*1000,
    verifySamples:positiveInteger(args['verify-samples']||10,'verify samples',{minimum:0,maximum:100}),
    versionCheckEvery:positiveInteger(args['version-check-every']||25,'version check interval',{maximum:500}),
    onProgress:value=>console.log(JSON.stringify({type:'progress',...value})),})
} catch (error) {
  report=error?.report ?? {schema:1,deploymentId,targetCount:ids.length,succeeded:[],failed:[],finishedAt:new Date().toISOString(),fatalError:error instanceof Error?error.message:'Unknown error'}
  report.fatalError=error instanceof Error?error.message:'Unknown error'
  process.exitCode=1
}
await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({type:process.exitCode?'failed':'complete',report:reportPath,succeeded:report.succeeded.length,failed:report.failed.length,
  requestCount:report.requestCount??0,requestsPerSecond:report.requestsPerSecond??0,completedIdsPerSecond:report.completedIdsPerSecond??0}))
if(!process.exitCode&&report.failed.length) process.exitCode=2
