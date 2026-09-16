import {appendFile,readFile} from 'node:fs/promises'
import {assertAutomaticCleanupPlan} from './cache/cleanup-lib.mjs'

const [reportPath,maxFiles,maxBytes,...extra]=process.argv.slice(2)
if(!reportPath||!maxFiles||!maxBytes||extra.length)throw new Error('Usage: evaluate-automatic-cache-cleanup.mjs REPORT MAX_FILES MAX_BYTES')
const plan=JSON.parse(await readFile(reportPath,'utf8'))
const decision=assertAutomaticCleanupPlan(plan,{maxFiles,maxBytes})
const output=process.env.GITHUB_OUTPUT
if(output)await appendFile(output,[`should_execute=${decision.shouldExecute}`,`expected_files=${decision.files}`,
  `expected_bytes=${decision.bytes}`,`expected_fingerprint=${decision.fingerprint}`].join('\n')+'\n')
console.log(JSON.stringify(decision))
