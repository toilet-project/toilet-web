import {appendFile,readFile} from 'node:fs/promises'
import {assertAutomaticCleanupPlan,selectAutomaticCleanupBatch} from './cache/cleanup-lib.mjs'

const [reportPath,maxFiles,maxBytes,...extra]=process.argv.slice(2)
if(!reportPath||!maxFiles||!maxBytes||extra.length)throw new Error('Usage: evaluate-automatic-cache-cleanup.mjs REPORT MAX_FILES MAX_BYTES')
const fullPlan=JSON.parse(await readFile(reportPath,'utf8'))
const plan=selectAutomaticCleanupBatch(fullPlan,{maxFiles,maxBytes})
const decision=assertAutomaticCleanupPlan(plan,{maxFiles,maxBytes})
const output=process.env.GITHUB_OUTPUT
if(output)await appendFile(output,[`should_execute=${decision.shouldExecute}`,`expected_files=${decision.files}`,
  `expected_bytes=${decision.bytes}`,`expected_fingerprint=${decision.fingerprint}`,`has_deferred=${decision.hasDeferred}`].join('\n')+'\n')
if(decision.unknownFiles)console.log(`::warning::Preserving ${decision.unknownFiles} unclassified cache objects; only recognized retired namespaces are selected`)
console.log(JSON.stringify({...decision,selectedCacheNamespaces:plan.automaticBatch.selectedCacheNamespaces,
  deferred:plan.automaticBatch.deferred,preservedUnknown:plan.automaticBatch.preservedUnknown}))
