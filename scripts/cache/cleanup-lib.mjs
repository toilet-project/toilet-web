export const INCREMENTAL_CACHE_PREFIX='incremental-cache/'
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

export function buildIdFromKey(key){
  if(typeof key!=='string'||!key.startsWith(INCREMENTAL_CACHE_PREFIX)) return null
  const remainder=key.slice(INCREMENTAL_CACHE_PREFIX.length),slash=remainder.indexOf('/')
  if(slash<1||slash===remainder.length-1) return null
  return remainder.slice(0,slash)
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
  return releases.map(release=>{
    if(!release||release.schema!==1||!UUID.test(release.workerVersion)||typeof release.buildId!=='string'||!release.buildId
      ||typeof release.deployedAt!=='string'||!Number.isFinite(Date.parse(release.deployedAt))) throw new Error('Invalid release registry entry')
    return release
  })
}
export function planIncrementalCacheCleanup({objects,releases,activeWorkerVersions,now=Date.now(),rollbackProtectionDays=3}){
  const registry=checkedReleases(releases)
  const byWorker=new Map(registry.map(release=>[release.workerVersion,release]))
  const active=activeWorkerVersions.map(version=>{
    const release=byWorker.get(version)
    if(!release) throw new Error(`Active Worker version is missing a release manifest: ${version}`)
    return release
  })
  const protectedBuilds=new Map(active.map(release=>[release.buildId,'active traffic']))
  const newestActive=Math.max(...active.map(release=>Date.parse(release.deployedAt)))
  const previous=registry.filter(release=>!activeWorkerVersions.includes(release.workerVersion)&&Date.parse(release.deployedAt)<newestActive)
    .sort((a,b)=>Date.parse(b.deployedAt)-Date.parse(a.deployedAt))[0]
  if(previous){
    const retirement=previous.retiredAt?Date.parse(previous.retiredAt):newestActive
    if(!Number.isFinite(retirement)) throw new Error('Previous release retirement time is unavailable')
    if(now-retirement<rollbackProtectionDays*86_400_000) protectedBuilds.set(previous.buildId,`rollback protection until ${new Date(retirement+rollbackProtectionDays*86_400_000).toISOString()}`)
  }
  const knownBuilds=new Set(registry.map(release=>release.buildId)),deleteObjects=[],protectedObjects=[],unknownObjects=[]
  for(const object of objects){
    if(!object||typeof object.key!=='string'||!Number.isFinite(Number(object.size))||Number(object.size)<0) throw new Error('Invalid R2 inventory object')
    const buildId=buildIdFromKey(object.key)
    if(!buildId||!knownBuilds.has(buildId)){unknownObjects.push({...object,reason:buildId?'missing release manifest':'outside recognized incremental cache path'});continue}
    const reason=protectedBuilds.get(buildId)
    if(reason) protectedObjects.push({...object,buildId,reason})
    else deleteObjects.push({...object,buildId})
  }
  const summarize=rows=>({files:rows.length,bytes:rows.reduce((sum,row)=>sum+Number(row.size),0)})
  return {schema:1,generatedAt:new Date(now).toISOString(),activeWorkerVersions:[...activeWorkerVersions].sort(),
    protectedBuilds:Object.fromEntries(protectedBuilds),deleteObjects,protectedObjects,unknownObjects,
    summary:{delete:summarize(deleteObjects),protected:summarize(protectedObjects),unknown:summarize(unknownObjects)}}
}
export function sameActiveDeployment(left,right){
  return left.workerName===right.workerName&&JSON.stringify([...left.activeWorkerVersions].sort())===JSON.stringify([...right.activeWorkerVersions].sort())
}
