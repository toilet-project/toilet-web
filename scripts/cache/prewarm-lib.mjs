import {mkdir,readFile,rename,writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'

export function positiveInteger(value,name,{minimum=1,maximum=Number.MAX_SAFE_INTEGER}={}){
  const parsed=Number(value)
  if(!Number.isSafeInteger(parsed)||parsed<minimum||parsed>maximum) throw new Error(`Invalid ${name}`)
  return parsed
}
export function normalizeBaseUrl(value){
  const url=new URL(value)
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash) throw new Error('HTTPS base URL required')
  url.pathname=url.pathname.replace(/\/$/,'')
  return url.toString().replace(/\/$/,'')
}
export function xmlLocations(xml){
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(match=>match[1].replaceAll('&amp;','&'))
}
export function toiletIdsFromXml(xml,baseUrl){
  const base=new URL(baseUrl)
  const ids=[]
  for(const location of xmlLocations(xml)){
    const url=new URL(location,base)
    if(url.origin!==base.origin) throw new Error('Cross-origin sitemap entry rejected')
    const match=url.pathname.match(/^\/toilet\/(\d+)$/)
    if(!match) continue
    const id=positiveInteger(match[1],'toilet ID')
    ids.push(id)
  }
  return [...new Set(ids)]
}
function requestSignal(timeoutMs){
  return AbortSignal.timeout(positiveInteger(timeoutMs,'request timeout',{maximum:300_000}))
}
async function checkedText(fetchImpl,url,timeoutMs=30_000){
  const response=await fetchImpl(url,{headers:{'user-agent':'geupddong-cache-prewarm/1'},signal:requestSignal(timeoutMs)})
  if(!response.ok) throw new Error(`Source request failed (${response.status})`)
  return response.text()
}
export async function collectPublicToiletIds({fetchImpl=fetch,baseUrl,mode='all',ids=[],shard,requestTimeoutMs=30_000}){
  if(mode==='ids') return [...new Set(ids.map(id=>positiveInteger(id,'toilet ID')))]
  const index=await checkedText(fetchImpl,`${baseUrl}/sitemap.xml`,requestTimeoutMs)
  const shards=xmlLocations(index).map(location=>new URL(location,new URL(baseUrl)))
    .filter(url=>url.origin===new URL(baseUrl).origin && /^\/sitemap-toilets-\d+\.xml$/.test(url.pathname))
  const selected=mode==='shard' ? shards.filter(url=>url.pathname===`/sitemap-toilets-${positiveInteger(shard,'shard',{minimum:0})}.xml`) : shards
  if(!selected.length) throw new Error('No matching toilet sitemap shards')
  const found=[]
  for(const url of selected) found.push(...toiletIdsFromXml(await checkedText(fetchImpl,url,requestTimeoutMs),baseUrl))
  return [...new Set(found)]
}
export async function readDeploymentVersion(fetchImpl,baseUrl,requestTimeoutMs=30_000){
  const response=await fetchImpl(`${baseUrl}/version.json`,{cache:'no-store',headers:{'user-agent':'geupddong-cache-prewarm/1'},signal:requestSignal(requestTimeoutMs)})
  if(!response.ok) throw new Error(`Version check failed (${response.status})`)
  const value=await response.json()
  if(!value || typeof value.version!=='string' || !value.version) throw new Error('Invalid version response')
  return value.version
}
export async function loadCheckpoint(path,deploymentId){
  try{
    const value=JSON.parse(await readFile(path,'utf8'))
    if(value.schema!==1 || value.deploymentId!==deploymentId || !Array.isArray(value.completedIds)) throw new Error('Checkpoint deployment mismatch')
    return {schema:1,deploymentId,completedIds:new Set(value.completedIds),failures:value.failures&&typeof value.failures==='object'?value.failures:{}}
  }catch(error){if(error.code==='ENOENT') return {schema:1,deploymentId,completedIds:new Set(),failures:{}};throw error}
}
export async function saveCheckpoint(path,state){
  await mkdir(dirname(path),{recursive:true})
  const temporary=`${path}.${process.pid}.tmp`
  await writeFile(temporary,JSON.stringify({schema:1,deploymentId:state.deploymentId,completedIds:[...state.completedIds].sort((a,b)=>a-b),failures:state.failures},null,2)+'\n')
  await rename(temporary,path)
}
function retryDelay(response,attempt){
  const header=Number(response?.headers?.get?.('retry-after'))
  return Number.isFinite(header)&&header>=0 ? Math.min(header*1000,30_000) : Math.min(500*2**attempt,10_000)
}
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))
export async function requestDetail({fetchImpl,id,baseUrl,retries,requestTimeoutMs=30_000,waitImpl=wait}){
  for(let attempt=0;attempt<=retries;attempt++){
    let response
    try{
      response=await fetchImpl(`${baseUrl}/toilet/${id}`,{redirect:'error',headers:{'user-agent':'geupddong-cache-prewarm/1'},signal:requestSignal(requestTimeoutMs)})
      await response.arrayBuffer()
    }catch(error){
      if(attempt===retries) throw error
      await waitImpl(retryDelay(null,attempt));continue
    }
    if(response.ok) return response
    if((response.status===429||response.status>=500)&&attempt<retries){await waitImpl(retryDelay(response,attempt));continue}
    throw new Error(`Detail request failed (${response.status})`)
  }
}
export function cacheEvidence(response){
  const value=(response.headers.get('x-nextjs-cache')||response.headers.get('x-opennext-cache')||'').toUpperCase()
  return ['HIT','STALE','REVALIDATED'].includes(value) ? value : null
}

export async function prewarmToiletPages(options){
  const startedAt=Date.now(),deadline=startedAt+options.maxSeconds*1000
  const checkpoint=await loadCheckpoint(options.checkpointPath,options.deploymentId)
  const pending=options.ids.filter(id=>!checkpoint.completedIds.has(id))
  const report={schema:1,deploymentId:options.deploymentId,targetCount:options.ids.length,resumedCount:options.ids.length-pending.length,
    succeeded:[],failed:[],cacheVerification:[],startedAt:new Date(startedAt).toISOString(),finishedAt:null,requestsPerSecond:0}
  let cursor=0,completedSinceVersionCheck=0,nextRequestAt=Date.now(),versionPromise=null,checkpointWrite=Promise.resolve()
  const assertVersion=async()=>{
    const version=await readDeploymentVersion(options.fetchImpl,options.baseUrl,options.requestTimeoutMs)
    if(version!==options.deploymentId) throw new Error(`Deployment changed: expected ${options.deploymentId}, received ${version}`)
  }
  const fail=error=>{
    report.finishedAt=new Date().toISOString()
    error.report=report
    throw error
  }
  try { await assertVersion() } catch (error) { fail(error) }
  const rate=async()=>{
    const scheduled=Math.max(Date.now(),nextRequestAt)
    nextRequestAt=scheduled+Math.ceil(1000/options.rps)
    if(scheduled>Date.now()) await options.waitImpl(scheduled-Date.now())
  }
  const verifyVersionIfDue=async()=>{
    completedSinceVersionCheck++
    if(completedSinceVersionCheck<options.versionCheckEvery) return
    completedSinceVersionCheck=0
    versionPromise??=assertVersion().finally(()=>{versionPromise=null})
    await versionPromise
  }
  const persistCheckpoint=()=>{
    checkpointWrite=checkpointWrite.then(()=>saveCheckpoint(options.checkpointPath,checkpoint))
    return checkpointWrite
  }
  const worker=async()=>{
    while(cursor<pending.length){
      if(Date.now()>=deadline) throw new Error('Maximum execution time reached')
      const id=pending[cursor++]
      await rate()
      try{
        await requestDetail({...options,id})
        checkpoint.completedIds.add(id);delete checkpoint.failures[id];report.succeeded.push(id)
      }catch(error){
        const message=error instanceof Error?error.message:'Unknown error'
        checkpoint.failures[id]=message;report.failed.push({id,error:message})
      }
      await persistCheckpoint()
      await verifyVersionIfDue()
      options.onProgress?.({completed:checkpoint.completedIds.size,failed:Object.keys(checkpoint.failures).length,total:options.ids.length})
    }
  }
  try { await Promise.all(Array.from({length:Math.min(options.concurrency,Math.max(pending.length,1))},worker)) }
  catch (error) { fail(error) }
  try { await assertVersion() } catch (error) { fail(error) }
  const verificationCandidates=options.ids.filter(id=>checkpoint.completedIds.has(id)).slice(0,options.verifySamples)
  for(const id of verificationCandidates){
    await rate()
    let response
    try { response=await requestDetail({...options,id,retries:1}) }
    catch (error) { fail(error) }
    report.cacheVerification.push({id,evidence:cacheEvidence(response)})
  }
  if(report.cacheVerification.some(item=>!item.evidence)) fail(new Error('Cache creation could not be verified from response evidence'))
  const finishedAt=Date.now()
  report.finishedAt=new Date(finishedAt).toISOString()
  report.requestsPerSecond=Number((report.succeeded.length/Math.max((finishedAt-startedAt)/1000,0.001)).toFixed(3))
  return report
}
