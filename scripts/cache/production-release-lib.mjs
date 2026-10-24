import {createHash} from 'node:crypto'
import {normalizeDeploymentStatus, sameActiveDeployment, validateReleaseRegistry, validateActiveReleaseRegistry} from './cleanup-lib.mjs'

export const RELEASE_REPOSITORY='toilet-project/toilet-web'
export const RELEASE_ENVIRONMENT='production-cache-maintenance'
export const RELEASE_VARIABLE='CACHE_RELEASE_REGISTRY_JSON'
export const RELEASE_WORKER='geupddong-web-production'
export const CLEANUP_EVENT='cache-production-deployed'
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const SHA=/^[a-f0-9]{64}$/
export const sha256=value=>createHash('sha256').update(value).digest('hex')
export function releaseError(code){return Object.assign(new Error(code),{safeCode:code})}
export function releaseFailureCode(error){
  const registryCodes=['registry-empty','registry-entry-invalid','registry-namespace-mismatch','registry-release-unverified',
    'registry-namespace-duplicate','registry-worker-duplicate','active-versions-invalid','active-release-missing','REGISTRY_ACTIVE_NOT_FINALIZED']
  return error?.safeCode??(registryCodes.includes(error?.code)?error.code:'RELEASE_OPERATION_FAILED')
}
function requireValue(condition,code){if(!condition)throw releaseError(code)}
export async function readPublicReleaseVersion(fetchImpl=fetch){
  const response=await fetchImpl('https://geupddong.com/version.json',{cache:'no-store',signal:AbortSignal.timeout(15_000)})
  requireValue(response.ok,'PUBLIC_VERSION_READ_FAILED')
  const body=await response.json()
  requireValue(typeof body.version==='string'&&body.version.length>0,'PUBLIC_VERSION_RESPONSE_INVALID')
  return body.version
}
export function parseUploadedVersion(output){
  const ids=[...output.matchAll(/^Worker Version ID: ([a-f0-9-]{36})\s*$/gim)].map(row=>row[1])
  requireValue(ids.length===1&&UUID.test(ids[0]),'STAGE_VERSION_ID_UNAVAILABLE')
  return ids[0]
}
export function checkedReceipt(receipt,{manifestSha256,artifactSha256}){
  requireValue(receipt?.schema===1&&receipt.workerName===RELEASE_WORKER&&UUID.test(receipt.workerVersion)
    &&SHA.test(receipt.manifestSha256)&&SHA.test(receipt.artifactSha256)&&typeof receipt.scriptEtag==='string'&&receipt.scriptEtag.length>0
    &&Number.isFinite(Date.parse(receipt.createdOn)),'INVALID_STAGE_RECEIPT')
  requireValue(receipt.manifestSha256===manifestSha256&&receipt.artifactSha256===artifactSha256,'STAGED_ARTIFACT_CHANGED')
  return receipt
}
export function checkedRemoteVersion(version,{workerVersion,manifestSha256,scriptEtag}){
  requireValue(version?.id===workerVersion&&version.annotations?.['workers/tag']===manifestSha256,'STAGED_VERSION_IDENTITY_MISMATCH')
  const etag=version.resources?.script?.etag
  requireValue(typeof etag==='string'&&etag.length>0&&(!scriptEtag||etag===scriptEtag),'STAGED_VERSION_ETAG_MISMATCH')
  requireValue(Number.isFinite(Date.parse(version.metadata?.created_on)),'STAGED_VERSION_TIME_UNAVAILABLE')
  return {schema:1,workerName:RELEASE_WORKER,workerVersion,manifestSha256,scriptEtag:etag,createdOn:version.metadata.created_on}
}
export function releaseRecord(manifest,receipt,{deployedAt=receipt.createdOn,lifecycle='staged'}={}){
  requireValue(manifest?.target==='production-candidate'&&/^[a-f0-9]{40}$/.test(manifest.sourceCommit??'')
    &&typeof manifest.buildId==='string'&&manifest.buildId.length>0
    &&typeof manifest.appVersion==='string'&&manifest.appVersion.startsWith(`${manifest.sourceCommit}-`)
    &&/^\d+-\d+-production-candidate$/.test(manifest.appVersion.slice(41))
    &&UUID.test(receipt.workerVersion)&&Number.isFinite(Date.parse(deployedAt))&&['staged','deployed'].includes(lifecycle),'INVALID_RELEASE_RECORD')
  return {schema:1,target:'production-candidate',workerName:RELEASE_WORKER,workerVersion:receipt.workerVersion,
    cacheNamespace:manifest.appVersion,appVersion:manifest.appVersion,buildId:manifest.buildId,sourceCommit:manifest.sourceCommit,
    deployedAt:new Date(deployedAt).toISOString(),lifecycle}
}
export function mergeReleaseRecord(registry,record){
  const rows=validateReleaseRegistry(registry)
  const existing=rows.find(row=>row.workerVersion===record.workerVersion)
  const collision=rows.find(row=>row.cacheNamespace===record.cacheNamespace&&row.workerVersion!==record.workerVersion)
  requireValue(!collision,'CACHE_NAMESPACE_ALREADY_REGISTERED')
  if(existing){
    requireValue(existing.cacheNamespace===record.cacheNamespace&&(!existing.buildId||existing.buildId===record.buildId)
      &&(!existing.sourceCommit||existing.sourceCommit===record.sourceCommit),'RELEASE_IDENTITY_CONFLICT')
    // A retry cannot demote an activated release or rewrite its activation time.
    if(existing.lifecycle!=='staged'){
      requireValue(record.lifecycle==='staged'||Date.parse(existing.deployedAt)===Date.parse(record.deployedAt),'RELEASE_TIME_CONFLICT')
      return rows
    }
    if(record.lifecycle==='staged')return rows
  }
  const merged=validateReleaseRegistry(existing?rows.map(row=>row===existing?{...row,...record}:row):[...rows,record])
  requireValue(Buffer.byteLength(JSON.stringify(merged),'utf8')<=48*1024,'REGISTRY_SIZE_LIMIT')
  return merged
}
export function assertFreshStage(manifest,registry,status,{allowRegisteredStaged=false}={}){
  const active=normalizeDeploymentStatus(status,RELEASE_WORKER).activeWorkerVersions
  const rows=validateActiveReleaseRegistry(registry,active)
  const known=rows.find(row=>row.cacheNamespace===manifest.appVersion)
  requireValue(!known||allowRegisteredStaged&&known.lifecycle==='staged','CACHE_NAMESPACE_ALREADY_REGISTERED')
  const sequence=value=>{
    const match=/^[a-f0-9]{40}-(\d+)-(\d+)-production-candidate$/.exec(value??'')
    requireValue(match,'ACTIVE_CACHE_IDENTITY_UNSUPPORTED')
    return [BigInt(match[1]),BigInt(match[2])]
  }
  const next=sequence(manifest.appVersion)
  for(const id of active){
    const current=sequence(rows.find(row=>row.workerVersion===id).cacheNamespace)
    requireValue(next[0]>current[0]||next[0]===current[0]&&next[1]>current[1],'ARTIFACT_NOT_NEWER_THAN_ACTIVE_RELEASE')
  }
}
function sameStatus(left,right){
  return left.id===right.id&&sameActiveDeployment(normalizeDeploymentStatus(left,RELEASE_WORKER),normalizeDeploymentStatus(right,RELEASE_WORKER))
}
function assertActivated(status,version){
  const normalized=normalizeDeploymentStatus(status,RELEASE_WORKER)
  requireValue(normalized.activeWorkerVersions.length===1&&normalized.activeWorkerVersions[0]===version
    &&status.versions?.length===1&&Number(status.versions[0].percentage)===100,'ACTIVE_VERSION_MISMATCH')
  requireValue(Number.isFinite(Date.parse(status.created_on)),'DEPLOYMENT_TIME_UNAVAILABLE')
  return normalized
}

// All remote effects are injected so failure order and refusal paths are tested
// without Cloudflare credentials, GitHub writes or R2 access.
export async function activateProductionRelease({manifest,receipt,execute=false,actions,onReport=async()=>{}}){
  const report={schema:1,operation:'activate',mode:execute?'execute':'plan',status:'started',stage:'version-check',
    registered:false,activated:false,activationAttempted:false,activationOutcome:'not-attempted',cleanupRequested:false,cleanupCompleted:false,errorCode:null}
  const stage=async name=>{report.stage=name;await onReport({...report})}
  try{
    await stage('version-check')
    checkedRemoteVersion(await actions.version(receipt.workerVersion),receipt)
    await stage('active-registry-check')
    const before=await actions.status(),registry=await actions.registry()
    const activeVersions=normalizeDeploymentStatus(before,RELEASE_WORKER).activeWorkerVersions
    const resume=activeVersions.length===1&&activeVersions[0]===receipt.workerVersion
    if(resume){
      assertActivated(before,receipt.workerVersion)
      requireValue(validateReleaseRegistry(registry).some(row=>row.workerVersion===receipt.workerVersion),'REGISTERED_RELEASE_LOST')
    }else assertFreshStage(manifest,registry,before,{allowRegisteredStaged:true})
    const staged=releaseRecord(manifest,receipt)
    const proposed=mergeReleaseRecord(registry,staged)
    if(!execute){report.status='planned';report.resume=resume;report.registryWouldChange=JSON.stringify(registry)!==JSON.stringify(proposed);return report}
    if(!resume){
      await stage('register-staged-release')
      await actions.replaceRegistry(registry,proposed);report.registered=true
      await stage('activation-precheck')
      requireValue(sameStatus(before,await actions.status()),'DEPLOYMENT_CHANGED_BEFORE_ACTIVATION')
      const registered=await actions.registry()
      requireValue(registered.some(row=>row.workerVersion===staged.workerVersion&&row.cacheNamespace===staged.cacheNamespace),'REGISTERED_RELEASE_LOST')
      validateActiveReleaseRegistry(registered,activeVersions)
      await stage('activate-version')
      report.activationAttempted=true;report.activated=null;report.activationOutcome='unknown';await onReport({...report})
      await actions.activate(receipt.workerVersion)
    }else report.registered=true
    await stage('confirm-active-version')
    const after=await actions.status();assertActivated(after,receipt.workerVersion);report.activated=true;report.activationOutcome='confirmed'
    if(resume)requireValue(sameStatus(before,after),'DEPLOYMENT_CHANGED_DURING_RESUME')
    await stage('finalize-release-registration')
    const latest=await actions.registry()
    const final=mergeReleaseRecord(latest,releaseRecord(manifest,receipt,{deployedAt:after.created_on,lifecycle:'deployed'}))
    validateActiveReleaseRegistry(final,[receipt.workerVersion])
    await actions.replaceRegistry(latest,final)
    await stage('public-version-check')
    requireValue(await actions.publicVersion()===manifest.appVersion,'PUBLIC_VERSION_MISMATCH')
    requireValue(sameStatus(after,await actions.status()),'DEPLOYMENT_CHANGED_AFTER_ACTIVATION')
    validateActiveReleaseRegistry(await actions.registry(),[receipt.workerVersion])
    await stage('request-cleanup')
    await actions.dispatch();report.cleanupRequested=true
    report.status='completed';return report
  }catch(error){report.status='failed';report.errorCode=releaseFailureCode(error);throw Object.assign(releaseError(report.errorCode),{report})}
  finally{await onReport({...report})}
}
