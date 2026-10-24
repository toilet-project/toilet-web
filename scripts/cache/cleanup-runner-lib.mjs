import {assertAutomaticCleanupPlan,assertReviewedCleanupPlan,INCREMENTAL_CACHE_PREFIX,
  planIncrementalCacheCleanup,sameActiveDeployment,selectAutomaticCleanupBatch,
  selectRetiredNamespaceCleanup,validateActiveReleaseRegistry} from './cleanup-lib.mjs'

const registryCodes=new Set(['registry-empty','registry-entry-invalid','registry-namespace-mismatch',
  'registry-release-unverified','registry-namespace-duplicate','registry-worker-duplicate',
  'active-versions-invalid','active-release-missing','REGISTRY_ACTIVE_NOT_FINALIZED'])
const stageCodes={setup:'configuration-invalid','active-status':'active-status-failed',
  'registry-read':'registry-read-failed','registry-validation':'registry-invalid',inventory:'inventory-read-failed',
  plan:'plan-failed',review:'review-rejected','deployment-check':'active-status-failed',delete:'delete-failed',report:'report-write-failed'}
const ownFailures=new WeakMap()
const failure=code=>{const error=new Error(code);ownFailures.set(error,code);return error}
const stamp=now=>new Date(now()).toISOString()
const clone=value=>JSON.parse(JSON.stringify(value))

export function parseCleanupArguments(values){
  const out={}
  for(let index=0;index<values.length;index++){
    const key=values[index]
    if(['--execute','--automatic'].includes(key)){out[key.slice(2)]=true;continue}
    if(!key.startsWith('--')||values[index+1]===undefined)throw failure('configuration-invalid')
    out[key.slice(2)]=values[++index]
  }
  return out
}

function checkedOptions(args,env){
  if(args.argumentError||!args.registry||!args.report)throw failure('configuration-invalid')
  if(args.execute&&env.CACHE_CLEANUP_ENABLED!=='true')throw failure('configuration-invalid')
  if(args.automatic&&(!args.execute||env.CACHE_CLEANUP_AUTOMATIC_ENABLED!=='true'))throw failure('configuration-invalid')
  if(args.automatic&&args['only-namespace'])throw failure('configuration-invalid')
  const rollbackProtectionDays=Number(args['rollback-days']??3)
  if(!Number.isSafeInteger(rollbackProtectionDays)||rollbackProtectionDays<0||rollbackProtectionDays>30)throw failure('configuration-invalid')
  if(rollbackProtectionDays<3&&args.execute&&!args.automatic&&!args['only-namespace'])throw failure('configuration-invalid')
  if(env.R2_INCREMENTAL_CACHE_BUCKET!=='geupddong-next-production-cache')throw failure('configuration-invalid')
  const required=name=>{
    if(args[name]===undefined||args[name]==='')throw failure('configuration-invalid')
    return args[name]
  }
  const limits=args.automatic?{maxFiles:required('max-delete-files'),maxBytes:required('max-delete-bytes')}:null
  const reviewed=args.execute?{files:required('expected-delete-files'),bytes:required('expected-delete-bytes'),
    fingerprint:required('expected-delete-fingerprint')}:null
  return {rollbackProtectionDays,limits,reviewed}
}

// Inject every side effect so ordering and deletion guards are tested without
// contacting Cloudflare, reading credentials, or deleting objects.
export async function runIncrementalCacheCleanup({args,env,getDeploymentStatus,readRegistry,createStore,
  writeReport,onProgress=()=>{},now=Date.now}){
  let stage='setup',pendingBatch=false,incompleteAcknowledgement=false
  const result={schema:1,generatedAt:stamp(now),mode:args.execute?'execute':'dry-run',status:'running',stage,
    failure:null,activeWorkerVersions:null,protectedCacheNamespaces:null,deleteObjects:null,protectedObjects:null,
    unknownObjects:null,deleteFingerprint:null,summary:null,inventory:{available:false,files:null,bytes:null},
    execution:{attempted:false,startedAt:null,deletedFiles:0,deletedBytes:0,deletedFilesExact:true,deletedBytesExact:true,
      deletionOutcomeUnknown:false,completedAt:null,error:null}}
  const persist=async()=>{
    try{await writeReport(clone(result))}
    catch{throw failure('report-write-failed')}
  }
  const enter=async next=>{stage=next;result.stage=next;await persist()}
  const status=async()=>{
    try{return await getDeploymentStatus()}
    catch{throw failure('active-status-failed')}
  }
  try{
    await persist()
    const options=checkedOptions(args,env)
    await enter('active-status')
    const before=await status()
    await enter('registry-read')
    const input=await readRegistry(args.registry)
    await enter('registry-validation')
    // Validate before both R2 client construction and any inventory request.
    const releases=validateActiveReleaseRegistry(input,before.activeWorkerVersions)
    result.activeWorkerVersions=before.activeWorkerVersions
    await enter('inventory')
    const store=createStore({accountId:env.R2_ACCOUNT_ID,accessKeyId:env.R2_ACCESS_KEY_ID,
      secretAccessKey:env.R2_SECRET_ACCESS_KEY,bucket:env.R2_INCREMENTAL_CACHE_BUCKET})
    const objects=await store.list(INCREMENTAL_CACHE_PREFIX)
    if(!Array.isArray(objects))throw failure('inventory-read-failed')
    const validSizes=objects.every(object=>Number.isFinite(Number(object?.size))&&Number(object.size)>=0)
    result.inventory={available:true,files:objects.length,
      bytes:validSizes?objects.reduce((sum,object)=>sum+Number(object.size),0):null}
    await enter('plan')
    const fullPlan=planIncrementalCacheCleanup({objects,releases,activeWorkerVersions:before.activeWorkerVersions,
      rollbackProtectionDays:options.rollbackProtectionDays,now:now()})
    const plan=args.automatic?selectAutomaticCleanupBatch(fullPlan,options.limits)
      :args['only-namespace']?selectRetiredNamespaceCleanup(fullPlan,releases,before.activeWorkerVersions,args['only-namespace']):fullPlan
    Object.assign(result,plan)
    await persist()
    if(args.execute){
      await enter('review')
      assertReviewedCleanupPlan(plan,options.reviewed,{allowUnknownObjects:args.automatic})
      if(args.automatic)assertAutomaticCleanupPlan(plan,options.limits)
      await enter('deployment-check')
      if(!sameActiveDeployment(before,await status()))throw failure('active-deployment-changed')
      await enter('delete')
      const cumulativeBytes=[0]
      for(const object of plan.deleteObjects)cumulativeBytes.push(cumulativeBytes.at(-1)+Number(object.size))
      result.execution.attempted=true;result.execution.startedAt=stamp(now)
      // Persist an uncertain in-progress state before issuing requests. A hard
      // runner termination must not leave a report claiming exactly zero deletes.
      result.execution.deletedFilesExact=false;result.execution.deletedBytesExact=false
      result.execution.deletionOutcomeUnknown=true
      await persist()
      await store.delete(plan.deleteObjects.map(object=>object.key),{
        beforeBatch:async({offset})=>{
          if(offset%10_000===0&&!sameActiveDeployment(before,await status()))throw failure('active-deployment-changed')
          pendingBatch=true
          result.execution.deletedFilesExact=false;result.execution.deletedBytesExact=false
          result.execution.deletionOutcomeUnknown=true
        },
        onBatch:({deletedFiles,totalFiles})=>{
          if(!Number.isSafeInteger(deletedFiles)||deletedFiles<result.execution.deletedFiles
            ||deletedFiles>plan.deleteObjects.length)throw failure('delete-acknowledgement-incomplete')
          pendingBatch=false
          result.execution.deletedFiles=deletedFiles;result.execution.deletedBytes=cumulativeBytes[deletedFiles]
          result.execution.deletedFilesExact=true;result.execution.deletedBytesExact=true
          result.execution.deletionOutcomeUnknown=false
          onProgress({type:'delete-progress',deletedFiles,totalFiles})
        },
        onPartialBatch:({acknowledgedKeys})=>{
          incompleteAcknowledgement=true
          const already=new Set(plan.deleteObjects.slice(0,result.execution.deletedFiles).map(object=>object.key))
          const sizes=new Map(plan.deleteObjects.map(object=>[object.key,Number(object.size)]))
          for(const key of new Set(acknowledgedKeys)){
            if(sizes.has(key)&&!already.has(key)){
              result.execution.deletedFiles++;result.execution.deletedBytes+=sizes.get(key)
            }
          }
          pendingBatch=true
          result.execution.deletedFilesExact=false;result.execution.deletedBytesExact=false
          result.execution.deletionOutcomeUnknown=true
        },
      })
      if(result.execution.deletedFiles!==plan.deleteObjects.length)throw failure('delete-acknowledgement-incomplete')
      result.execution.completedAt=stamp(now)
    }
    result.status='completed';result.stage='complete';stage='complete'
    await persist()
  }catch(error){
    const code=ownFailures.get(error)??(incompleteAcknowledgement?'delete-acknowledgement-incomplete'
      :stage==='registry-validation'&&registryCodes.has(error?.code)?error.code:stageCodes[stage]??'cleanup-failed')
    result.status='failed';result.stage=code==='report-write-failed'?'report':stage
    result.failure={stage:result.stage,code}
    result.execution.error=code
    if(result.execution.attempted){
      result.execution.completedAt=stamp(now)
      result.execution.deletedFilesExact=!pendingBatch;result.execution.deletedBytesExact=!pendingBatch
      result.execution.deletionOutcomeUnknown=pendingBatch
    }
    try{await persist()}
    catch{result.reportWriteFailure='report-write-failed'}
  }
  return result
}
