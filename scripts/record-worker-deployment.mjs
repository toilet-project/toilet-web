import {readFile,writeFile} from 'node:fs/promises'
const [manifestPath,workerVersion,deployedAt,outputPath,...extra]=process.argv.slice(2)
if(!manifestPath||!outputPath||extra.length||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(workerVersion)
  ||!Number.isFinite(Date.parse(deployedAt))) throw new Error('Usage: record-worker-deployment.mjs MANIFEST WORKER_UUID DEPLOYED_AT OUTPUT')
const manifest=JSON.parse(await readFile(manifestPath,'utf8'))
if(!manifest||!['preview','production-candidate'].includes(manifest.target)||!manifest.buildId||!manifest.appVersion||!manifest.sourceCommit) throw new Error('Incomplete Worker release manifest')
const record={schema:1,target:manifest.target,workerName:manifest.target==='preview'?'geupddong-web-preview':'geupddong-web-production',
  workerVersion,appVersion:manifest.appVersion,buildId:manifest.buildId,sourceCommit:manifest.sourceCommit,deployedAt:new Date(deployedAt).toISOString()}
await writeFile(outputPath,JSON.stringify(record,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(record))
