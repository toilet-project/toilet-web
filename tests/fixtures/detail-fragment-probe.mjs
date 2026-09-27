// Included only by the local integration harness. Not packaged/deployed.
export default {async fetch(request,env,ctx){
  const url=new URL(request.url)
  if(url.pathname!=='/__local-cache-proof')return handler.fetch(request,env,ctx)
  if(url.hostname!=='127.0.0.1'||request.headers.get('x-local-proof')!==env.CACHE_REVALIDATION_SECRET)return new Response(null,{status:404})
  const bucket=env.PUBLIC_TOILET_DATA_CACHE_R2,key='public-toilets/v1/toilets/13448.json'
  if(request.method==='POST'){
    const record=await(await bucket.get(key)).json()
    record.data.roadAddress='Cache boundary test address'
    for(const value of Object.values(record.data.translations||{}))value.roadAddress='Cache boundary test address'
    await bucket.put(key,JSON.stringify(record))
    return Response.json({updated:true})
  }
  const records=[],pages=[]
  let cursor
  do{
    const batch=await bucket.list({cursor})
    for(const item of batch.objects){
      if(item.key.startsWith('toilet-content/v1/')){
        const value=await(await bucket.get(item.key)).json()
        records.push({key:item.key,etag:item.etag,fingerprint:value.fingerprint,bytes:item.size})
      }
      if(item.key.startsWith('incremental-cache/')){
        const value=await(await bucket.get(item.key)).json()
        if(value.type==='app'&&JSON.stringify(value).includes('data-detail-fragment'))pages.push(item.key)
      }
    }
    cursor=batch.truncated?batch.cursor:undefined
  }while(cursor)
  const object=await bucket.get(key),record=object?await object.json():null
  return Response.json({records:records.sort((a,b)=>a.key.localeCompare(b.key)),pages,
    source:object?{etag:object.etag,state:record.state,revision:record.revision}:null})
}}
