import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises'
import {resolve,dirname,join,relative,isAbsolute,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {RELEASE_REPOSITORY,RELEASE_ENVIRONMENT,RELEASE_VARIABLE,RELEASE_WORKER,CLEANUP_EVENT,
  sha256,releaseError,releaseFailureCode,readPublicReleaseVersion,parseUploadedVersion,checkedReceipt,checkedRemoteVersion,assertFreshStage,activateProductionRelease} from './cache/production-release-lib.mjs'

const run=promisify(execFile),scriptRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..')
function options(values){
  const command=values.shift(),out={command,execute:false}
  if(!['stage','activate'].includes(command))throw releaseError('EXPLICIT_STAGE_OR_ACTIVATE_REQUIRED')
  for(let i=0;i<values.length;i++){
    const key=values[i]
    if(key==='--execute'){if(out.execute)throw releaseError('DUPLICATE_ARGUMENT');out.execute=true;continue}
    if(!['--release-dir','--receipt','--report'].includes(key)||!values[i+1]||values[i+1].startsWith('--')||out[key.slice(2)])throw releaseError('INVALID_ARGUMENT')
    out[key.slice(2)]=values[++i]
  }
  if(!out['release-dir']||!out.report||out.command==='activate'&&!out.receipt)throw releaseError('RELEASE_DIRECTORY_REPORT_AND_RECEIPT_REQUIRED')
  return out
}
async function artifactDigest(root){
  const files=[]
  const walk=async path=>{
    const stat=await lstat(path)
    if(stat.isSymbolicLink())throw releaseError('ARTIFACT_SYMLINK_REFUSED')
    if(stat.isDirectory())for(const entry of await readdir(path))await walk(join(path,entry))
    else if(stat.isFile())files.push(path)
  }
  // Ignore mutable CLI state/node_modules, hash the deployed runtime and cache.
  for(const name of ['.open-next','.next/BUILD_ID','worker-release-manifest.json','wrangler.production.jsonc'])await walk(join(root,name))
  for(const name of await readdir(root))if(/\.(?:mjs|ts|json)$/.test(name)&&!name.startsWith('.')){
    const path=join(root,name);if(!files.includes(path))await walk(path)
  }
  const hash=createHash('sha256')
  for(const path of files.sort()){
    hash.update(relative(root,path).replaceAll('\\','/'));hash.update('\0')
    for await(const chunk of createReadStream(path))hash.update(chunk)
    hash.update('\0')
  }
  return hash.digest('hex')
}
async function main(){
  const args=options(process.argv.slice(2)),root=resolve(args['release-dir']),reportPath=resolve(args.report)
  const receiptPath=resolve(args.receipt??`${reportPath}.receipt.json`)
  if(receiptPath===reportPath)throw releaseError('REPORT_AND_RECEIPT_MUST_DIFFER')
  const insideArtifact=path=>{const part=relative(root,path);return !part||!isAbsolute(part)&&part!=='..'&&!part.startsWith(`..${sep}`)}
  if([reportPath,receiptPath].some(insideArtifact))throw releaseError('REPORT_MUST_BE_OUTSIDE_ARTIFACT')
  await mkdir(dirname(reportPath),{recursive:true})
  const save=async report=>writeFile(reportPath,JSON.stringify(report,null,2)+'\n')
  let report={schema:1,operation:args.command,mode:args.execute?'execute':'plan',status:'started',stage:'artifact-check',errorCode:null}
  await save(report)
  try{
    const manifestRaw=await readFile(join(root,'worker-release-manifest.json'),'utf8'),manifest=JSON.parse(manifestRaw)
    await run(process.execPath,[join(scriptRoot,'scripts/verify-worker-release.mjs'),root,'production-candidate',manifest.sourceCommit],{cwd:root,maxBuffer:4*1024*1024})
    const manifestSha256=sha256(manifestRaw),artifactSha256=await artifactDigest(root)
    const wrangler=join(scriptRoot,'node_modules/wrangler/wrangler-dist/cli.js')
    const wr=async values=>JSON.parse((await run(process.execPath,[wrangler,...values,'--config',join(root,'wrangler.production.jsonc'),'--json'],{cwd:root,maxBuffer:8*1024*1024})).stdout)
    const version=id=>wr(['versions','view',id])
    const gh=async values=>(await run('gh',values,{cwd:scriptRoot,maxBuffer:8*1024*1024})).stdout
    const endpoint=`repos/${RELEASE_REPOSITORY}/environments/${RELEASE_ENVIRONMENT}/variables/${RELEASE_VARIABLE}`
    const registry=async()=>JSON.parse(JSON.parse(await gh(['api',endpoint])).value)
    if(args.command==='stage'){
      report.stage='staging-precheck';await save(report)
      assertFreshStage(manifest,await registry(),await wr(['deployments','status','--name',RELEASE_WORKER]))
      if(!args.execute){report.status='planned';report.manifestSha256=manifestSha256;await save(report);return}
      // Never overwrite an earlier staging receipt, even for a failed retry.
      try{await lstat(receiptPath);throw releaseError('RECEIPT_ALREADY_EXISTS')}catch(error){if(error.code!=='ENOENT')throw error}
      report.stage='upload-inactive-version';await save(report)
      const uploaded=await run(process.execPath,[join(scriptRoot,'node_modules/@opennextjs/cloudflare/dist/cli/index.js'),
        'upload','--config','wrangler.production.jsonc','--tag',manifestSha256,'--message',`release-${manifestSha256.slice(0,16)}`],
      {cwd:root,maxBuffer:8*1024*1024,timeout:15*60*1000})
      const workerVersion=parseUploadedVersion(uploaded.stdout)
      if(await artifactDigest(root)!==artifactSha256)throw releaseError('ARTIFACT_CHANGED_DURING_UPLOAD')
      report.stage='verify-staged-version';await save(report)
      const receipt={...checkedRemoteVersion(await version(workerVersion),{workerVersion,manifestSha256}),artifactSha256}
      await mkdir(dirname(receiptPath),{recursive:true})
      await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'})
      report.status='completed';report.receiptWritten=true;await save(report);return
    }
    const receipt=checkedReceipt(JSON.parse(await readFile(receiptPath,'utf8')),{manifestSha256,artifactSha256})
    const replaceRegistry=async(expected,rows)=>{
      if(JSON.stringify(await registry())!==JSON.stringify(expected))throw releaseError('REGISTRY_CHANGED_CONCURRENTLY')
      if(JSON.stringify(expected)===JSON.stringify(rows))return
      // A structured input file avoids interpolating registry data into a shell.
      const input=join(dirname(reportPath),`.registry-update-${process.pid}.json`)
      await writeFile(input,JSON.stringify({name:RELEASE_VARIABLE,value:JSON.stringify(rows)})+'\n',{mode:0o600})
      await gh(['api','--method','PATCH',endpoint,'--input',input])
      if(JSON.stringify(await registry())!==JSON.stringify(rows))throw releaseError('REGISTRY_READBACK_MISMATCH')
    }
    const actions={version,registry,replaceRegistry,status:()=>wr(['deployments','status','--name',RELEASE_WORKER]),
      activate:async id=>{await run(process.execPath,[wrangler,'versions','deploy',`${id}@100`,'--config',join(root,'wrangler.production.jsonc'),
        '--yes','--message',`registered-release-${manifestSha256.slice(0,16)}`],{cwd:root,maxBuffer:8*1024*1024})},
      publicVersion:readPublicReleaseVersion,
      dispatch:async()=>{const input=join(dirname(reportPath),`.cleanup-event-${process.pid}.json`)
        await writeFile(input,JSON.stringify({event_type:CLEANUP_EVENT})+'\n')
        await gh(['api','--method','POST',`repos/${RELEASE_REPOSITORY}/dispatches`,'--input',input])}}
    report=await activateProductionRelease({manifest,receipt,execute:args.execute,actions,onReport:save})
  }catch(error){report=error.report??{...report,status:'failed',errorCode:releaseFailureCode(error)};await save(report);throw releaseError(report.errorCode)}
}
main().catch(error=>{console.error(error.safeCode??'RELEASE_OPERATION_FAILED');process.exitCode=1})
