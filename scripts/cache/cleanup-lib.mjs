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
export function assertReviewedCleanupPlan(plan,{files,bytes,fingerprint}){
  const expectedFiles=Number(files),expectedBytes=Number(bytes)
  if(!Number.isSafeInteger(expectedFiles)||expectedFiles<1||!Number.isSafeInteger(expectedBytes)||expectedBytes<1)throw new Error('Expected delete totals must be positive safe integers')
  if(typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/i.test(fingerprint))throw new Error('Expected delete fingerprint must be a SHA-256 hex digest')
  if(plan.unknownObjects.length)throw new Error(`Deletion refused: ${plan.unknownObjects.length} cache objects are unclassified`)
  if(plan.summary.delete.files!==expectedFiles||plan.summary.delete.bytes!==expectedBytes||plan.deleteFingerprint!==fingerprint){
    throw new Error('Deletion refused: current cache plan does not match the reviewed dry-run')
  }
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
  const previous=workerReleases.filter(release=>!activeWorkerVersions.includes(release.workerVersion)&&Date.parse(release.deployedAt)<newestActive)
    .sort((a,b)=>Date.parse(b.deployedAt)-Date.parse(a.deployedAt))[0]
  if(previous){
    const retirement=previous.retiredAt?Date.parse(previous.retiredAt):newestActive
    if(!Number.isFinite(retirement)) throw new Error('Previous release retirement time is unavailable')
    if(now-retirement<rollbackProtectionDays*86_400_000) protectedCacheNamespaces.set(previous.cacheNamespace,`rollback protection until ${new Date(retirement+rollbackProtectionDays*86_400_000).toISOString()}`)
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
  const summarize=rows=>({files:rows.length,bytes:rows.reduce((sum,row)=>sum+Number(row.size),0)})
  return {schema:1,generatedAt:new Date(now).toISOString(),activeWorkerVersions:[...activeWorkerVersions].sort(),
    protectedCacheNamespaces:Object.fromEntries(protectedCacheNamespaces),deleteObjects,protectedObjects,unknownObjects,
    deleteFingerprint:cleanupPlanFingerprint(deleteObjects),
    summary:{delete:summarize(deleteObjects),protected:summarize(protectedObjects),unknown:summarize(unknownObjects)}}
}
export function sameActiveDeployment(left,right){
  return left.workerName===right.workerName&&JSON.stringify([...left.activeWorkerVersions].sort())===JSON.stringify([...right.activeWorkerVersions].sort())
}
