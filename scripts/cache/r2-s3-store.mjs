import {AwsClient} from 'aws4fetch'

const escapeXml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')
const decodeXml=value=>String(value).replaceAll('&apos;',"'").replaceAll('&quot;','"').replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&')
const values=(xml,tag)=>[...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`,'g'))].map(match=>decodeXml(match[1]))

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
  async delete(keys,{beforeBatch,onBatch}={}){
    for(let offset=0;offset<keys.length;offset+=1000){
      const batch=keys.slice(offset,offset+1000),body=`<?xml version="1.0" encoding="UTF-8"?><Delete>${batch.map(key=>`<Object><Key>${escapeXml(key)}</Key></Object>`).join('')}<Quiet>false</Quiet></Delete>`
      await beforeBatch?.({offset,batchFiles:batch.length,totalFiles:keys.length})
      const response=await this.signed(`${this.endpoint}?delete`,{method:'POST',headers:{'content-type':'application/xml'},body})
      if(!response.ok)throw new Error(`R2 delete failed (${response.status})`)
      const result=await response.text(),errors=values(result,'Error');if(errors.length)throw new Error(`R2 delete returned ${errors.length} errors`)
      onBatch?.({deletedFiles:offset+batch.length,totalFiles:keys.length})
    }
  }
}
