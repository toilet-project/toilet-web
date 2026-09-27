// Linux CI only; separate compiled releases share LOCAL R2/D1.
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {createHmac,randomBytes} from 'node:crypto'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
assert.equal(process.platform,'linux')
const roots=process.argv.slice(2)
if(roots.length!==0&&roots.length!==2)throw Error('Provide zero or two release roots')
const state=await mkdtemp(join(tmpdir(),'geupddong-body-cache-'))
const cli=resolve('node_modules/wrangler/bin/wrangler.js'),origin='http://127.0.0.1:18790'
const secret=randomBytes(32).toString('hex'),wait=ms=>new Promise(done=>setTimeout(done,ms))
let child,logs=''
async function configFor(root,index){
  root=resolve(root)
  const source=JSON.parse(await readFile(join(root,roots.length&&index===0?'wrangler.jsonc':'wrangler.production.jsonc'),'utf8'))
  const main=join(state,'probe-'+index+'.mjs'),worker=JSON.stringify(join(root,'custom-worker.mjs'))
  await writeFile(main,'import handler from '+worker+';\nexport {DOQueueHandler} from '+worker+';\n'+await readFile('tests/fixtures/detail-fragment-probe.mjs','utf8'))
  const config={...source,name:'local-detail-cache-proof',main,assets:{...source.assets,directory:join(root,'.open-next/assets')},
    routes:[],workers_dev:false,preview_urls:false,observability:{enabled:false},
    services:[{binding:'WORKER_SELF_REFERENCE',service:'local-detail-cache-proof'}],
    r2_buckets:[{binding:'NEXT_INC_CACHE_R2_BUCKET',bucket_name:'local-detail-cache-proof'},{binding:'PUBLIC_TOILET_DATA_CACHE_R2',bucket_name:'local-detail-cache-proof'}],
    d1_databases:[{binding:'NEXT_TAG_CACHE_D1',database_name:'local-detail-cache-proof',database_id:'00000000-0000-0000-0000-000000000001'}],
    vars:{...source.vars,SHARED_TOILET_CACHE_ENABLED:'true',INDEXNOW_ENABLED:'false',PLACE_SEARCH_ENABLED:'false'}}
  const path=join(state,'wrangler-'+index+'.json');await writeFile(path,JSON.stringify(config));return path
}
async function start(config){
  child=spawn(process.execPath,[cli,'dev','--local','--config',config,'--port','18790','--persist-to',state,
    '--show-interactive-dev-session=false','--var','CACHE_REVALIDATION_SECRET:'+secret],
    {stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}})
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{logs=(logs+data.toString().replaceAll(secret,'[test-key]')).slice(-12000)})
  for(let i=0;i<120;i++){if(child.exitCode!==null)break;try{if((await fetch(origin+'/version.json',{signal:AbortSignal.timeout(500)})).ok)return}catch{}await wait(250)}
  throw Error('Local Worker failed: '+logs)
}
async function stop(){
  if(!child||child.exitCode!==null)return
  const exited=new Promise(done=>child.once('exit',done));child.kill('SIGTERM')
  await Promise.race([exited,wait(5000)])
  if(child.exitCode===null){child.kill('SIGKILL');await exited}
}
async function probe(method='GET'){
  const response=await fetch(origin+'/__local-cache-proof',{method,headers:{'x-local-proof':secret},signal:AbortSignal.timeout(30000)})
  assert.equal(response.status,200);return response.json()
}
async function page(path,rsc=false){
  const response=await fetch(origin+path,{headers:rsc?{RSC:'1'}:{},signal:AbortSignal.timeout(30000)}),body=await response.text()
  assert.equal(response.status,200,path+':'+response.status+'\n'+logs)
  assert.match(response.headers.get('cache-control')||'',/no-store/)
  assert.notEqual(response.headers.get('x-opennext-cache')||response.headers.get('x-nextjs-cache'),'HIT','Full detail documents must not persist')
  if(rsc){assert.match(response.headers.get('content-type'),/text\/x-component/);assert.doesNotMatch(body,/<!doctype html>/i)}
  else {assert.match(body,/<h1[^>]*>[^<]+<\/h1>/);assert.match(body,/application\/ld\+json/);assert.match(body,/<link rel="canonical"/);assert.match(body,/hreflang=/i);assert.match(body,/data-detail-fragment="[a-f0-9]{64}"/)}
  return body
}
try{
  const first=await configFor(roots[0]||'.',0),second=await configFor(roots[1]||'.',1)
  const init=spawnSync(process.execPath,[cli,'d1','execute','local-detail-cache-proof','--local','--config',first,'--persist-to',state,'--command',
    'CREATE TABLE IF NOT EXISTS revalidations (tag TEXT PRIMARY KEY,revalidatedAt INTEGER NOT NULL,stale INTEGER,expire INTEGER);'],
    {encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'}})
  assert.equal(init.status,0,init.stderr);await start(first)
  const versionA=(await(await fetch(origin+'/version.json')).json()).version,paths=[]
  for(const locale of ['', '/en','/ja','/zh-cn','/zh-tw','/zh-hk']){
    const path=locale+'/toilet/13448',html=await page(path),canonical=html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
    assert.ok(canonical);paths.push(path,new URL(canonical).pathname);await page(new URL(canonical).pathname)
  }
  const initial=await probe();assert.equal(initial.records.length,6);assert.equal(initial.pages.length,0)
  await stop();await start(second)
  const versionB=(await(await fetch(origin+'/version.json')).json()).version
  if(roots.length)assert.notEqual(versionA,versionB,'Two actual builds required')
  for(const path of [...new Set(paths)]){await page(path);await page(path,true)}
  const reused=await probe()
  assert.deepEqual(reused.records,initial.records,'Different build must reuse fragment bytes and ETags')
  assert.deepEqual(reused.source,initial.source,'Source data must not refill on release change');assert.equal(reused.pages.length,0)
  await probe('POST');assert.match(await page('/toilet/13448'),/Cache boundary test address/)
  const changed=await probe();assert.equal(changed.records.length,6)
  assert.notEqual(changed.records.find(r=>r.key.includes('/ko/')).etag,initial.records.find(r=>r.key.includes('/ko/')).etag)
  for(const record of changed.records.filter(r=>!r.key.includes('/ko/')))assert.deepEqual(record,initial.records.find(r=>r.key===record.key))
  const path='/_internal/cache/revalidate',body=JSON.stringify({version:2,events:[{toiletId:13448,revision:changed.source.revision+1,action:'PRIVATE',catalogChanged:false}]})
  const timestamp=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',secret).update('v1\nPOST\n'+path+'\n'+timestamp+'\n'+body).digest('hex')
  const denied=await fetch(origin+path,{method:'POST',body,headers:{'content-type':'application/json'}});await denied.arrayBuffer();assert.equal(denied.status,401)
  const hidden=await fetch(origin+path,{method:'POST',body,headers:{'content-type':'application/json','x-cache-timestamp':timestamp,'x-cache-signature':signature},signal:AbortSignal.timeout(30000)})
  await hidden.arrayBuffer();assert.equal(hidden.status,200,logs)
  for(const path of ['/toilet/13448','/api/public/toilets/13448','/toilet/999999999999']){
    const response=await fetch(origin+path,{signal:AbortSignal.timeout(30000)}),html=await response.text()
    assert.equal(response.status,404,path);assert.doesNotMatch(html,/Cache boundary test address/)
  }
  const report={passed:true,differentBuilds:Boolean(roots.length),versionA,versionB,locales:6,paths:paths.length,storedFragments:6,
    bodyBytes:initial.records.reduce((sum,row)=>sum+row.bytes,0),unchangedAfterRelease:true,publicDataUnchangedAfterRelease:true,
    storedDetailDocuments:0,signedPrivateEvent:true,storage:'isolated local R2 only'}
  await writeFile('detail-fragment-worker-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}finally{
  await stop();if(!resolve(state).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe local test path')
  await rm(state,{recursive:true,force:true})
}
