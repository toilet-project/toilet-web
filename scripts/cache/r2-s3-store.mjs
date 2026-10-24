import {AwsClient} from 'aws4fetch'

const escapeXml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')
const decodeXml=value=>String(value).replaceAll('&apos;',"'").replaceAll('&quot;','"').replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&')
const values=(xml,tag)=>[...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`,'g'))].map(match=>decodeXml(match[1]))

function deleteAcknowledgements(xml,requested){
  const document=xml.trim().replace(/^<\?xml\s[^?]*\?>\s*/,'')
  const root=document.match(/^<DeleteResult(?:\s+xmlns(?::[A-Za-z_][\w.-]*)?=(?:"[^"<>]*"|'[^'<>]*'))*\s*>([\s\S]*)<\/DeleteResult>$/)
  if(!root)return {keys:[],complete:false}
  const children=/<(Deleted|Error)>([\s\S]*?)<\/\1>/g
  const blocks=[...root[1].matchAll(children)]
  // A truncated or malformed child is not an acknowledgement. R2's unversioned
  // response contains Deleted/Key, with optional standard S3 version metadata.
  if(root[1].replace(children,'').trim())return {keys:[],complete:false}
  const expected=new Set(requested),acknowledged=new Set()
  let valid=true
  for(const block of blocks){
    if(block[1]==='Error'){valid=false;continue}
    const body=block[2],rawKeys=[...body.matchAll(/<Key>([^<]*)<\/Key>/g)].map(match=>match[1])
    const rest=body.replace(/<(Key|DeleteMarker|VersionId|DeleteMarkerVersionId)>[^<]*<\/\1>/g,'').trim()
    if(rest||rawKeys.length!==1||/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/i.test(body)){valid=false;continue}
    let key
    try{
      key=rawKeys[0].replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,(entity,value)=>{
        if(value.startsWith('#'))return String.fromCodePoint(value[1].toLowerCase()==='x'?parseInt(value.slice(2),16):Number(value.slice(1)))
        return decodeXml(entity)
      })
    }catch{valid=false;continue}
    if(!expected.has(key)||acknowledged.has(key)){valid=false;continue}
    acknowledged.add(key)
  }
  return {keys:[...acknowledged],complete:valid&&acknowledged.size===expected.size}
}

export class R2S3Store{
  constructor({accountId,accessKeyId,secretAccessKey,bucket,fetchImpl=fetch}){
    if(!/^[a-f0-9]{32}$/i.test(accountId)||!accessKeyId||!secretAccessKey||!bucket||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid R2 configuration')
    this.endpoint=`https://${accountId}.r2.cloudflarestorage.com/${bucket}`
    this.client=new AwsClient({accessKeyId,secretAccessKey,service:'s3',region:'auto'});this.fetchImpl=fetchImpl
  }
  async signed(url,init){return this.fetchImpl(await this.client.sign(url,init))}
  async list(prefix){
    const objects=[];let token=null
    do{
      const url=new URL(this.endpoint);url.searchParams.set('list-type','2');url.searchParams.set('prefix',prefix)
      if(token)url.searchParams.set('continuation-token',token)
      const response=await this.signed(url,{method:'GET'});if(!response.ok)throw new Error(`R2 list failed (${response.status})`)
      const xml=await response.text(),blocks=values(xml,'Contents')
      for(const block of blocks){const key=values(block,'Key')[0],size=Number(values(block,'Size')[0]),uploaded=values(block,'LastModified')[0];if(key)objects.push({key,size,uploaded})}
      token=values(xml,'NextContinuationToken')[0]||null
      const truncated=values(xml,'IsTruncated')[0]==='true';if(truncated&&!token)throw new Error('R2 continuation token missing')
      if(!truncated)token=null
    }while(token)
    return objects
  }
  async delete(keys,{beforeBatch,onBatch,onPartialBatch}={}){
    if(!Array.isArray(keys)||keys.some(key=>typeof key!=='string'||!key)||new Set(keys).size!==keys.length){
      throw new Error('R2 delete requires unique object keys')
    }
    for(let offset=0;offset<keys.length;offset+=1000){
      const batch=keys.slice(offset,offset+1000),body=`<?xml version="1.0" encoding="UTF-8"?><Delete>${batch.map(key=>`<Object><Key>${escapeXml(key)}</Key></Object>`).join('')}<Quiet>false</Quiet></Delete>`
      await beforeBatch?.({offset,batchFiles:batch.length,totalFiles:keys.length})
      const response=await this.signed(`${this.endpoint}?delete`,{method:'POST',headers:{'content-type':'application/xml'},body})
      if(!response.ok)throw new Error(`R2 delete failed (${response.status})`)
      const result=deleteAcknowledgements(await response.text(),batch)
      if(!result.complete){
        onPartialBatch?.({acknowledgedKeys:result.keys,totalFiles:keys.length})
        throw new Error('R2 delete acknowledgement is incomplete')
      }
      onBatch?.({deletedFiles:offset+batch.length,totalFiles:keys.length})
    }
  }
}
