import {mkdir,writeFile} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {collectPublicToiletIds,normalizeBaseUrl,positiveInteger} from './cache/prewarm-lib.mjs'
import {partitionToiletIds,refreshSharedToiletData} from './cache/shared-refresh-lib.mjs'

function argumentsOf(values){
  const parsed={}
  for(let index=0;index<values.length;index++){
    const key=values[index]
    if(key==='--execute'){parsed.execute=true;continue}
    if(!key.startsWith('--')||values[index+1]===undefined||values[index+1].startsWith('--'))throw new Error(`Invalid argument ${key}`)
    parsed[key.slice(2)]=values[++index]
  }
  return parsed
}
const args=argumentsOf(process.argv.slice(2))
if(!args.execute||process.env.CACHE_DATA_REFRESH_ENABLED!=='true')throw new Error('Shared-cache refresh is disabled')
const secret=process.env.CACHE_MAINTENANCE_SECRET
if(!secret||Buffer.byteLength(secret,'utf8')<32)throw new Error('CACHE_MAINTENANCE_SECRET is required')
const baseUrl=normalizeBaseUrl(args['base-url'])
const partitionCount=positiveInteger(args['partition-count']||28,'partition count',{maximum:365})
const partition=positiveInteger(args.partition,'partition',{minimum:0,maximum:partitionCount-1})
const cycleId=args['cycle-id']
if(!cycleId||!/^[a-zA-Z0-9._-]{1,100}$/.test(cycleId))throw new Error('Explicit cycle ID required')
const allIds=await collectPublicToiletIds({baseUrl,requestTimeoutMs:positiveInteger(args['request-timeout-seconds']||30,'request timeout seconds',{maximum:300})*1000})
const ids=partitionToiletIds(allIds,partition,partitionCount)
if(!ids.length)throw new Error('Selected refresh partition is empty')
const checkpointPath=resolve(args.checkpoint||`.cache-refresh/${cycleId}-${partition}.json`)
const reportPath=resolve(args.report||`shared-cache-refresh-${cycleId}-${partition}.json`)
let report
try{
  report=await refreshSharedToiletData({fetchImpl:fetch,waitImpl:milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds)),
    baseUrl,secret,cycleId,partition,partitionCount,ids,checkpointPath,
    concurrency:positiveInteger(args.concurrency||8,'concurrency',{maximum:32}),rps:positiveInteger(args.rps||5,'rps',{maximum:25}),
    maxSeconds:positiveInteger(args['max-minutes']||80,'max minutes',{maximum:300})*60,
    retries:positiveInteger(args.retries||5,'retries',{minimum:0,maximum:10}),
    requestTimeoutMs:positiveInteger(args['request-timeout-seconds']||30,'request timeout seconds',{maximum:300})*1000,
    progressEvery:positiveInteger(args['progress-every']||25,'progress interval',{maximum:1000}),
    onProgress:value=>console.log(JSON.stringify({type:'progress',...value}))})
}catch(error){
  report=error?.report??{schema:1,cycleId,partition,partitionCount,targetCount:ids.length,succeeded:[],notFound:[],deleted:[],failed:[],finishedAt:new Date().toISOString()}
  report.fatalError=error instanceof Error?error.message:'Unknown error';process.exitCode=1
}
await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({type:process.exitCode?'failed':'complete',report:reportPath,target:report.targetCount,
  succeeded:report.succeeded.length,notFound:report.notFound.length,deleted:report.deleted.length,failed:report.failed.length,
  requestCount:report.requestCount??0,requestsPerSecond:report.requestsPerSecond??0}))
if(!process.exitCode&&report.failed.length)process.exitCode=2
