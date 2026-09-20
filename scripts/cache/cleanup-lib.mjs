import {createHash} from 'node:crypto'

export const INCREMENTAL_CACHE_PREFIX='incremental-cache/'
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const RETIRED_CANDIDATE_NAMESPACE=/^[a-f0-9]{40}-([1-9]\d*)-([1-9]\d*)-(?:review-)?production-candidate$/i

export function cacheNamespaceFromKey(key){
  if(typeof key!=='string'||!key.startsWith(INCREMENTAL_CACHE_PREFIX)) return null
  const remainder=key.slice(INCREMENTAL_CACHE_PREFIX.length),slash=remainder.indexOf('/')
  if(slash<1||slash===remainder.length-1) return null
  return remainder.slice(0,slash)
}
// Kept for callers that imported the old name before the R2 namespace was
// distinguished from Next.js' .next/BUILD_ID.
export const buildIdFromKey=cacheNamespaceFromKey
export function cleanupPlanFingerprint(objects){
  const canonical=objects.map(object=>`${object.key}\0${Number(object.size)}\n`).sort().join('')
  return createHash('sha256').update(canonical).digest('hex')
}
export function assertReviewedCleanupPlan(plan,{files,bytes,fingerprint},{allowUnknownObjects=false}={}){
  const expectedFiles=Number(files),expectedBytes=Number(bytes)
  if(!Number.isSafeInteger(expectedFiles)||expectedFiles<1||!Number.isSafeInteger(expectedBytes)||expectedBytes<1)throw new Error('Expected delete totals must be positive safe integers')
  if(typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/i.test(fingerprint))throw new Error('Expected delete fingerprint must be a SHA-256 hex digest')
  if(plan.unknownObjects.length&&!allowUnknownObjects)throw new Error(`Deletion refused: ${plan.unknownObjects.length} cache objects are unclassified`)
  if(plan.summary.delete.files!==expectedFiles||plan.summary.delete.bytes!==expectedBytes||plan.deleteFingerprint!==fingerprint){
    throw new Error('Deletion refused: current cache plan does not match the reviewed dry-run')
  }
}
function automaticLimits({maxFiles,maxBytes}){
  const files=Number(maxFiles),bytes=Number(maxBytes)
  if(!Number.isSafeInteger(files)||files<1||!Number.isSafeInteger(bytes)||bytes<1)throw new Error('Automatic cleanup limits must be positive safe integers')
  return {files,bytes}
}
function summarizeObjects(rows){return {files:rows.length,bytes:rows.reduce((sum,row)=>sum+Number(row.size),0)}}
export function selectAutomaticCleanupBatch(plan,limits){
  const maximum=automaticLimits(limits)
  if(!plan||!Array.isArray(plan.deleteObjects)||!Array.isArray(plan.unknownObjects))throw new Error('Invalid automatic cleanup plan')
  const groups=new Map()
  for(const object of plan.deleteObjects){
    if(typeof object.cacheNamespace!=='string'||!object.cacheNamespace)throw new Error('Automatic deletion requires a recognized cache namespace')
    const group=groups.get(object.cacheNamespace)||[];group.push(object);groups.set(object.cacheNamespace,group)
  }
  const ordered=[...groups].map(([cacheNamespace,objects])=>({cacheNamespace,objects,summary:summarizeObjects(objects),
    oldestUpload:objects.reduce((oldest,object)=>{
      const uploaded=Date.parse(object.uploaded)
      return Math.min(oldest,Number.isFinite(uploaded)?uploaded:Number.MAX_SAFE_INTEGER)
    },Number.MAX_SAFE_INTEGER)}))
    .sort((left,right)=>left.oldestUpload-right.oldestUpload||left.cacheNamespace.localeCompare(right.cacheNamespace))
  const oversized=ordered.filter(group=>group.summary.files>maximum.files||group.summary.bytes>maximum.bytes)
  if(oversized.length)throw new Error(`Automatic deletion refused: cache namespace exceeds the configured limit: ${oversized[0].cacheNamespace}`)
  const selected=[],deferred=[];let selectedFiles=0,selectedBytes=0
  for(const group of ordered){
    if(selectedFiles+group.summary.files<=maximum.files&&selectedBytes+group.summary.bytes<=maximum.bytes){
      selected.push(...group.objects);selectedFiles+=group.summary.files;selectedBytes+=group.summary.bytes
    }else deferred.push(...group.objects)
  }
  const summary={...plan.summary,delete:summarizeObjects(selected)}
  return {...plan,deleteObjects:selected,deleteFingerprint:cleanupPlanFingerprint(selected),summary,
    automaticBatch:{selectedCacheNamespaces:[...new Set(selected.map(object=>object.cacheNamespace))],deferred:summarizeObjects(deferred),
      preservedUnknown:summarizeObjects(plan.unknownObjects),limits:{maxFiles:maximum.files,maxBytes:maximum.bytes}}}
}
export function assertAutomaticCleanupPlan(plan,{maxFiles,maxBytes}){
  const {files,bytes}=automaticLimits({maxFiles,maxBytes})
  if(!plan.automaticBatch)throw new Error('Automatic deletion refused: a bounded cache batch was not selected')
  if(plan.summary.delete.files>files||plan.summary.delete.bytes>bytes)throw new Error('Automatic deletion refused: selected batch exceeds the configured limit')
  return {shouldExecute:plan.summary.delete.files>0,files:plan.summary.delete.files,bytes:plan.summary.delete.bytes,
    fingerprint:plan.deleteFingerprint,hasDeferred:plan.automaticBatch.deferred.files>0,
    unknownFiles:plan.automaticBatch.preservedUnknown.files}
}
export function normalizeDeploymentStatus(value,workerName){
  if(!value||typeof value!=='object') throw new Error('Invalid deployment status')
  const root=value
  const candidates=Array.isArray(root.versions)?root.versions:Array.isArray(root.deployments)?root.deployments.flatMap(row=>row.versions||[]):null
  if(!candidates) throw new Error('Unsupported deployment status shape')
  const active=[]
  for(const row of candidates){
    const id=row.version_id||row.versionId||row.id
    const percentage=Number(row.percentage??row.traffic??row.percent??0)
    if(typeof id==='string'&&UUID.test(id)&&Number.isFinite(percentage)&&percentage>0) active.push(id)
  }
  if(!active.length) throw new Error('No active Worker versions found')
  return {schema:1,workerName,activeWorkerVersions:[...new Set(active)].sort()}
}
function checkedReleases(releases){
  if(!Array.isArray(releases)||!releases.length) throw new Error('Release registry is empty')
  const checked=releases.map(release=>{
    const cacheNamespace=release?.cacheNamespace||release?.appVersion
    if(!release||release.schema!==1||typeof cacheNamespace!=='string'||!cacheNamespace
      ||typeof release.deployedAt!=='string'||!Number.isFinite(Date.parse(release.deployedAt))) throw new Error('Invalid release registry entry')
    if(release.cacheNamespace&&release.appVersion&&release.cacheNamespace!==release.appVersion) throw new Error('Release cache namespace does not match app version')
    const workerRelease=typeof release.workerVersion==='string'&&UUID.test(release.workerVersion)
    const candidate=cacheNamespace.match(RETIRED_CANDIDATE_NAMESPACE)
    const retiredValidation=release.workerVersion===null&&release.lifecycle==='retired-validation'
      &&Number.isSafeInteger(release.sourceRunId)&&String(release.sourceRunId)===candidate?.[1]
      &&typeof release.retiredAt==='string'&&Number.isFinite(Date.parse(release.retiredAt))
    if(!workerRelease&&!retiredValidation) throw new Error('Release must be a Worker version or an audited retired validation candidate')
    return {...release,cacheNamespace}
  })
  if(new Set(checked.map(release=>release.cacheNamespace)).size!==checked.length) throw new Error('Duplicate cache namespace in release registry')
  const workerVersions=checked.filter(release=>release.workerVersion!==null).map(release=>release.workerVersion)
  if(new Set(workerVersions).size!==workerVersions.length) throw new Error('Duplicate Worker version in release registry')
  return checked
}
export function planIncrementalCacheCleanup({objects,releases,activeWorkerVersions,now=Date.now(),rollbackProtectionDays=3}){
  const registry=checkedReleases(releases)
  const workerReleases=registry.filter(release=>release.workerVersion!==null)
  const byWorker=new Map(workerReleases.map(release=>[release.workerVersion,release]))
  const active=activeWorkerVersions.map(version=>{
    const release=byWorker.get(version)
    if(!release) throw new Error(`Active Worker version is missing a release manifest: ${version}`)
    return release
  })
  const protectedCacheNamespaces=new Map(active.map(release=>[release.cacheNamespace,'active traffic']))
  const newestActive=Math.max(...active.map(release=>Date.parse(release.deployedAt)))
  for(const release of workerReleases){
    if(!activeWorkerVersions.includes(release.workerVersion)&&Date.parse(release.deployedAt)>=newestActive){
      protectedCacheNamespaces.set(release.cacheNamespace,'newer deployment candidate')
    }
  }
  const workerDeployments=workerReleases.map(release=>Date.parse(release.deployedAt)).sort((a,b)=>a-b)
  for(const release of registry){
    if(protectedCacheNamespaces.has(release.cacheNamespace)) continue
    const deployedAt=Date.parse(release.deployedAt)
    const nextWorkerDeployment=workerDeployments.find(candidate=>candidate>deployedAt)
    const retirement=release.retiredAt?Date.parse(release.retiredAt):nextWorkerDeployment
    if(!Number.isFinite(retirement)) throw new Error(`Release retirement time is unavailable: ${release.cacheNamespace}`)
    const protectedUntil=retirement+rollbackProtectionDays*86_400_000
    if(now<protectedUntil) protectedCacheNamespaces.set(release.cacheNamespace,`retirement protection until ${new Date(protectedUntil).toISOString()}`)
  }
  const knownCacheNamespaces=new Set(registry.map(release=>release.cacheNamespace)),deleteObjects=[],protectedObjects=[],unknownObjects=[]
  for(const object of objects){
    if(!object||typeof object.key!=='string'||!Number.isFinite(Number(object.size))||Number(object.size)<0) throw new Error('Invalid R2 inventory object')
    const cacheNamespace=cacheNamespaceFromKey(object.key)
    if(!cacheNamespace||!knownCacheNamespaces.has(cacheNamespace)){unknownObjects.push({...object,reason:cacheNamespace?'missing release manifest':'outside recognized incremental cache path'});continue}
    const reason=protectedCacheNamespaces.get(cacheNamespace)
    if(reason) protectedObjects.push({...object,cacheNamespace,reason})
    else deleteObjects.push({...object,cacheNamespace})
  }
  return {schema:1,generatedAt:new Date(now).toISOString(),activeWorkerVersions:[...activeWorkerVersions].sort(),
    protectedCacheNamespaces:Object.fromEntries(protectedCacheNamespaces),deleteObjects,protectedObjects,unknownObjects,
    deleteFingerprint:cleanupPlanFingerprint(deleteObjects),
    summary:{delete:summarizeObjects(deleteObjects),protected:summarizeObjects(protectedObjects),unknown:summarizeObjects(unknownObjects)}}
}
export function sameActiveDeployment(left,right){
  return left.workerName===right.workerName&&JSON.stringify([...left.activeWorkerVersions].sort())===JSON.stringify([...right.activeWorkerVersions].sort())
}
