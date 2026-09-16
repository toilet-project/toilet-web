import {createHmac} from 'node:crypto'
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'

export const CACHE_REFRESH_PATH='/_internal/cache/refresh-toilet'

export function maintenanceSignatureFor(secret,timestamp,body){
  return createHmac('sha256',secret).update(`v1\nPOST\n${CACHE_REFRESH_PATH}\n${timestamp}\n${body}`,'utf8').digest('hex')
}
export function partitionToiletIds(ids,partition,partitionCount){
  if(!Number.isSafeInteger(partitionCount)||partitionCount<1||partitionCount>365)throw new Error('Invalid partition count')
  if(!Number.isSafeInteger(partition)||partition<0||partition>=partitionCount)throw new Error('Invalid partition')
  return [...new Set(ids)].filter(id=>Number.isSafeInteger(id)&&id>0&&id%partitionCount===partition).sort((a,b)=>a-b)
}
export async function loadRefreshCheckpoint(path,{cycleId,partition,partitionCount}){
  try{
    const value=JSON.parse(await readFile(path,'utf8'))
    if(value.schema!==1||value.cycleId!==cycleId||value.partition!==partition||value.partitionCount!==partitionCount
      ||!Array.isArray(value.completedIds)||!value.failures||typeof value.failures!=='object')throw new Error('Refresh checkpoint mismatch')
    return {schema:1,cycleId,partition,partitionCount,completedIds:new Set(value.completedIds),failures:value.failures}
  }catch(error){
    if(error.code==='ENOENT')return {schema:1,cycleId,partition,partitionCount,completedIds:new Set(),failures:{}}
    throw error
  }
}
export async function saveRefreshCheckpoint(path,state){
  await mkdir(dirname(path),{recursive:true})
  const temporary=`${path}.${process.pid}.tmp`
  await writeFile(temporary,JSON.stringify({schema:1,cycleId:state.cycleId,partition:state.partition,
    partitionCount:state.partitionCount,completedIds:[...state.completedIds].sort((a,b)=>a-b),failures:state.failures},null,2)+'\n')
  await rename(temporary,path)
}
const delayFor=(response,attempt)=>{
  const retryAfter=Number(response?.headers?.get?.('retry-after'))
  return Number.isFinite(retryAfter)&&retryAfter>=0?Math.min(retryAfter*1000,30_000):Math.min(500*2**attempt,10_000)
}
const requestSignal=timeoutMs=>AbortSignal.timeout(timeoutMs)
export async function requestSharedToiletRefresh({fetchImpl=fetch,waitImpl=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds)),
  baseUrl,id,secret,retries,requestTimeoutMs,onRequest}){
  const body=JSON.stringify({contractVersion:1,toiletId:id})
  for(let attempt=0;attempt<=retries;attempt++){
    const timestamp=String(Math.floor(Date.now()/1000))
    let response
    try{
      onRequest?.()
      response=await fetchImpl(`${baseUrl}${CACHE_REFRESH_PATH}`,{method:'POST',redirect:'error',signal:requestSignal(requestTimeoutMs),
        headers:{'content-type':'application/json','user-agent':'geupddong-shared-cache-refresh/1','x-cache-timestamp':timestamp,
          'x-cache-signature':maintenanceSignatureFor(secret,timestamp,body)},body})
    }catch(error){
      if(attempt===retries)throw error
      await waitImpl(delayFor(null,attempt));continue
    }
    const text=await response.text()
    if(response.ok){
      let value
      try{value=JSON.parse(text)}catch{throw new Error('Refresh returned invalid JSON')}
      if(!value||value.ok!==true||value.toiletId!==id||!['data','negative','deleted'].includes(value.state)
        ||!Number.isSafeInteger(value.storedAt))throw new Error('Refresh returned an invalid acknowledgement')
      return value
    }
    if(([404,408,409,425,429].includes(response.status)||response.status>=500)&&attempt<retries){
      await waitImpl(delayFor(response,attempt));continue
    }
    throw new Error(`Refresh request failed (${response.status})`)
  }
}
export async function refreshSharedToiletData(options){
  const startedAt=Date.now(),deadline=startedAt+options.maxSeconds*1000
  const checkpoint=await loadRefreshCheckpoint(options.checkpointPath,options)
  const pending=options.ids.filter(id=>!checkpoint.completedIds.has(id))
  const report={schema:1,cycleId:options.cycleId,partition:options.partition,partitionCount:options.partitionCount,
    targetCount:options.ids.length,resumedCount:options.ids.length-pending.length,succeeded:[],notFound:[],deleted:[],failed:[],
    requestCount:0,startedAt:new Date(startedAt).toISOString(),finishedAt:null,requestsPerSecond:0,completedIdsPerSecond:0}
  let cursor=0,nextRequestAt=Date.now(),checkpointWrite=Promise.resolve(),progressCount=0
  const rate=async()=>{
    const scheduled=Math.max(Date.now(),nextRequestAt)
    nextRequestAt=scheduled+Math.ceil(1000/options.rps)
    if(scheduled>Date.now())await options.waitImpl(scheduled-Date.now())
  }
  const persist=()=>{
    checkpointWrite=checkpointWrite.then(()=>saveRefreshCheckpoint(options.checkpointPath,checkpoint))
    return checkpointWrite
  }
  const fail=error=>{report.finishedAt=new Date().toISOString();error.report=report;throw error}
  const worker=async()=>{
    while(cursor<pending.length){
      if(Date.now()>=deadline)throw new Error('Maximum execution time reached')
      const id=pending[cursor++]
      try{
        await rate()
        const result=await requestSharedToiletRefresh({...options,id,onRequest:()=>{report.requestCount++}})
        checkpoint.completedIds.add(id);delete checkpoint.failures[id]
        if(result.state==='data')report.succeeded.push(id)
        else if(result.state==='negative')report.notFound.push(id)
        else report.deleted.push(id)
      }catch(error){
        if(error instanceof Error&&error.message==='Maximum execution time reached')throw error
        const message=error instanceof Error?error.message:'Unknown error'
        checkpoint.failures[id]=message;report.failed.push({id,error:message})
      }
      await persist()
      progressCount++
      if(progressCount%options.progressEvery===0||cursor>=pending.length){
        options.onProgress?.({completed:checkpoint.completedIds.size,failed:Object.keys(checkpoint.failures).length,total:options.ids.length})
      }
    }
  }
  try{await Promise.all(Array.from({length:Math.min(options.concurrency,Math.max(pending.length,1))},worker));await checkpointWrite}
  catch(error){fail(error)}
  const finishedAt=Date.now(),elapsedSeconds=Math.max((finishedAt-startedAt)/1000,0.001)
  report.finishedAt=new Date(finishedAt).toISOString()
  report.requestsPerSecond=Number((report.requestCount/elapsedSeconds).toFixed(3))
  report.completedIdsPerSecond=Number(((report.succeeded.length+report.notFound.length+report.deleted.length)/elapsedSeconds).toFixed(3))
  return report
}
