'use strict';
// Coordinator operations. No command runs on import; dry-run is strictly read-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const f=require('./eval-freeze.cjs'),h=require('./eval-run.cjs'),carry=require('./eval-carry.cjs');
const {Ledger}=require('./ledger.cjs');
const WORK='workspace/revision/evaluation/v4';
const read=carry.read,digest=carry.digest,rel=carry.relative;
const write=(file,value)=>h.json(file,value);
function put(file,bytes){if(fs.existsSync(file)){if(digest(file)!==f.sha(bytes))throw Error('existing-evidence-differs:'+file);}else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});}}
function prepare({root=f.ROOT,testsReceipt,fromHash=carry.V3}={}){
 const p=carry.plan({root,fromHash}),receipt=read(testsReceipt),sources=Object.fromEntries(f.sourceFiles(root).map(file=>[file,digest(path.join(root,file))]));
 if(receipt.ok!==true||receipt.commands?.length!==2||receipt.commands.some(c=>c.status!==0)||JSON.stringify(receipt.sourceHashes)!==JSON.stringify(sources))throw Error('v4-full-test-receipt-required');
 f.retained(root);
 const ledger=new Ledger({root});if(ledger.totals().pending)throw Error('v4-pending-requests');
 const archive=path.join(root,'workspace/revision/freeze/archive/v3'),moves=[];
 for(const file of [f.FILE,f.MANIFEST]){
  const from=path.join(root,file),to=path.join(archive,path.basename(file));
  if(fs.existsSync(to))throw Error('v4-archive-target-exists:'+to);
  moves.push({oldPath:file,newPath:rel(root,to),sha256:digest(from)});
 }
 const logFile=path.join(root,'workspace/revision/freeze/FREEZE-LOG.md'),priorLog=fs.readFileSync(logFile);
 const logArchive=path.join(root,WORK,'archive','FREEZE-LOG-before-v4-'+Date.now()+'.md');put(logArchive,priorLog);
 for(const move of moves)fs.renameSync(path.join(root,move.oldPath),path.join(root,move.newPath));
 const verified=f.create({root,testsReceipt}); // existing CLI implementation writes the freeze ledger event
 const proof=carry.loaderProof(p.old,{root,to:verified});
 const record={at:new Date().toISOString(),fromFreezeSha256:p.old.sha256,toFreezeSha256:verified.sha256,moves,
  sourceArchives:read(path.join(root,WORK,'before.json')).sourceFiles.map(file=>({oldPath:file,newPath:'workspace/revision/freeze/archive/v3/'+file,sha256:p.old.freeze.files[file]})),
  changedFiles:p.summary.changedFiles,addedFiles:f.sourceFiles(root).filter(file=>!p.old.freeze.files[file]).map(file=>({file,sha256:verified.freeze.files[file]})),loaderRecordProof:proof,testsReceipt:rel(root,path.resolve(testsReceipt)),previousLog:{oldPath:rel(root,logFile),newPath:rel(root,logArchive),sha256:f.sha(priorLog)}};
 write(path.join(root,WORK,'freeze-v4-receipt.json'),record);
 const nl=priorLog.includes(Buffer.from('\r\n'))?'\r\n':'\n';
 const text=['','## Freeze v4 — '+record.at,'',`V3 ${p.old.sha256} superseded by V4 ${verified.sha256}. Union coverage, one-www runtime refusal, dispatch deadlines and local native HTTP outer timeout/cause recording are fixed.`,
  'P1 split: scored P1 uses tests/revision/eval/policies/p1-reader-view.cjs (title, byline, content without deduplication). Agent induction and G6 retain byte-identical p1-readability.cjs. Offline P3 evidence SHA-256 7f8feb1010397d19ce1127dd46671c2c2a7d976a67aeecb6e5d885d2fa04f3f2; P4 bd7d0ac0b9b5d764d90bff918a276060ed6e3d78e037e23fc30beffb78ace3e7.',
  ...moves.map(m=>`- ${m.oldPath} -> ${m.newPath}; SHA-256 ${m.sha256}`),
  ...record.sourceArchives.map(m=>`- Archived source ${m.oldPath} -> ${m.newPath}; SHA-256 ${m.sha256}`),
  ...record.changedFiles.map(d=>`- ${d.file}: v3 ${d.before}; v4 ${d.after}`),
  '',`Full source/archive/loader proof: ${WORK}/freeze-v4-receipt.json. All ${proof.records.length} loader records match after read-time checkout path mapping. Carry is a separate checked operation; P1 is regenerated and no v3 local row is carried.`,''].join(nl);
 fs.appendFileSync(logFile,text);return record;
}
function adopt({root=f.ROOT}={}){
 const to=f.verify({root});if(to.sha256===carry.V3)throw Error('v4-freeze-required');
 const p=carry.plan({root,to}),directory=path.join(root,'workspace/revision/results/eval-v4-carry-'+to.sha256.slice(0,12));
 const result=carry.materialize(p,{root,to,outputDirectory:directory});
 put(path.join(root,WORK,'carry-index.json'),JSON.stringify(result,null,2));return result;
}
function discover({root=f.ROOT,verified=f.verify({root})}={}){
 const dirs=[],index=path.join(root,WORK,'carry-index.json');
 if(fs.existsSync(index)){const c=read(index);if(c.toFreezeSha256!==verified.sha256)throw Error('v4-carry-index-freeze');dirs.push(...c.directories.map(d=>f.checkoutPath(d,root)));}
 const results=path.join(root,'workspace/revision/results');
 for(const e of fs.readdirSync(results,{withFileTypes:true}))if(e.isDirectory()){
  const dir=path.join(results,e.name),file=path.join(dir,'run.json');
  if(fs.existsSync(file)&&read(file).freezeSha256===verified.sha256)dirs.push(dir);
 }
 const jobs=new Map();
 for(const directory of dirs){const config=read(path.join(directory,'run.json'));for(const siteId of config.siteIds){
  const key=config.policy+':'+siteId;if(jobs.has(key))throw Error('v4-duplicate-job:'+key);
  jobs.set(key,{directory,config,siteId,complete:fs.existsSync(path.join(directory,'sites',siteId,'complete.json'))});
 }}
 return {verified,jobs};
}
async function generateWork({root=f.ROOT,policy,deadline=Date.now()+24*3600000,concurrency=policy==='P4-local'?4:1,runnerFactory=h.runnerFor,onEvent=e=>console.log(JSON.stringify(e))}={}){
 if(!['P1','P4-Codex','P4-local'].includes(policy))throw Error('v4-generation-policy');
 if(!Number.isFinite(deadline))throw Error('v4-invalid-deadline');
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>(policy==='P4-local'?4:1))throw Error('v4-concurrency-limit');
 const ctx=discover({root}),ids=policy==='P4-Codex'?ctx.verified.freeze.execution.Codex.siteIds:ctx.verified.manifest.sites.map(s=>s.siteId);
 // The adopted sample must exist before any of the nine Codex sites can start.
 if(policy==='P4-Codex'&&!ctx.jobs.get('P4-Codex:eval-02')?.complete)throw Error('v4-Codex-sample-carry-required');
 const pending=ids.filter(id=>!ctx.jobs.get(policy+':'+id)?.complete),runners=new Set();let next=0,stopped=null;
 const stop=reason=>{stopped=stopped||reason;for(const runner of runners)runner.close();};
 const work=async()=>{while(!stopped&&next<pending.length){
  if(Date.now()>=deadline){stop('evaluation-deadline');break;}
  const siteId=pending[next++];let job=ctx.jobs.get(policy+':'+siteId);
  if(!job){const directory=h.newRun(policy,[siteId],ctx.verified,{root});job={directory,siteId};ctx.jobs.set(policy+':'+siteId,job);}
  try{
   const result=await h.runPolicy({root,policy,siteIds:[siteId],directory:job.directory,deadline,onEvent,runnerFactory:(p,l)=>{const runner=runnerFactory(p,l);runners.add(runner);return runner;}});
   if(result.stopped)stop(result.stopped);
  }catch(error){stop(error.message);}
 }};
 try{await Promise.all(Array.from({length:Math.min(concurrency,pending.length)},work));}finally{for(const runner of runners)runner.close();}
 const remaining=ids.filter(id=>!fs.existsSync(path.join(ctx.jobs.get(policy+':'+id)?.directory||'', 'sites',id,'complete.json')));
 const result={policy,concurrency,stopped,remaining,freezeSha256:ctx.verified.sha256};if(stopped||remaining.length)throw Object.assign(Error('v4-generation-stopped:'+JSON.stringify(result)),{result});return result;
}
async function generate(options={}){
 const root=options.root||f.ROOT,owner=path.join(root,WORK,'generation.lock');fs.mkdirSync(path.dirname(owner),{recursive:true});
 if(fs.existsSync(owner)){
  const prior=read(owner);if(!Number.isSafeInteger(prior.pid)||prior.pid<1)throw Error('v4-generation-lock-owner-invalid');
  try{process.kill(prior.pid,0);throw Error('v4-generation-locked');}catch(e){if(e.code!=='ESRCH')throw e;}
  const archive=path.join(root,WORK,'archive');fs.mkdirSync(archive,{recursive:true});fs.renameSync(owner,path.join(archive,'interrupted-generation-'+crypto.randomUUID()+'.json'));
 }
 const lock=fs.openSync(owner,'wx');fs.writeSync(lock,JSON.stringify({pid:process.pid,policy:options.policy,at:new Date().toISOString()}));
 try{return await generateWork(options);}finally{fs.closeSync(lock);const archive=path.join(root,WORK,'archive');fs.mkdirSync(archive,{recursive:true});fs.renameSync(owner,path.join(archive,'generation-'+crypto.randomUUID()+'.json'));}
}
function coverage(ctx,{includeLocal=false}={}){
 const required=h.POLICIES.filter(p=>includeLocal||p!=='P4-local'),missing=[];
 for(const policy of required)for(const site of ctx.verified.manifest.sites){
  if(policy==='P4-Codex'&&!ctx.verified.freeze.execution.Codex.siteIds.includes(site.siteId))continue;
  if(!ctx.jobs.get(policy+':'+site.siteId)?.complete)missing.push(policy+':'+site.siteId);
 }
 if(missing.length)throw Error('v4-score-incomplete:'+missing.join(','));
 return required;
}
function cohort(rows,accounts){
 const scorer=require('./eval-score.cjs');
 return scorer.attachAccounting(scorer.summarizeCohort(rows),rows,accounts);
}
function markdown(report){
 const {MEASURES}=require('../../tests/revision/eval/stats.cjs');
 const lines=['# Frozen evaluation v4','',`Freeze ${report.freezeSha256}. P4-local: ${report.policyStatus['P4-local'].status}. Global ledger pending: ${report.ledger.pending}.`,'',
  '| Policy | Pages | '+MEASURES.join(' | ')+' | Requests | Prompt | Completion | Cached | Unknown usage | USD | Site seconds |','|---|---:|'+MEASURES.map(()=>'---:').join('|')+'|---:|---:|---:|---:|---:|---:|---:|'];
 for(const policy of h.POLICIES){const p=report.all.policies[policy];if(!p){lines.push(`| ${policy} | pending |`);continue;}const a=p.accounting;lines.push(`| ${policy} | ${p.pages} | ${MEASURES.map(k=>p.measures[k].estimate.toFixed(6)).join(' | ')} | ${a.modelRequests} | ${a.promptTokens} | ${a.completionTokens} | ${a.cachedTokens} | ${a.unknownUsageRequests} | ${a.costEstimate.toFixed(6)} | ${(a.latencyMs/1000).toFixed(1)} |`);}
 lines.push('','All measures are fractions except order tau. Full site-clustered 95% intervals, categories and accounting are in report.json.','','## Paired differences (A minus B; 10,000 site-clustered resamples)','','| Pair | Measure | Estimate | 95% CI | Pages/sites |','|---|---|---:|---|---|');
 for(const c of report.all.comparisons)for(const k of MEASURES){const m=c.measures[k];lines.push(`| ${c.policyA} minus ${c.policyB} | ${k} | ${m.estimate.toFixed(6)} | [${m.low.toFixed(6)}, ${m.high.toFixed(6)}] | ${m.pages}/${m.sites} |`);}
 lines.push('','## With/without eval-38','');
 for(const [policy,p]of Object.entries(report.all.policies))lines.push(`- ${policy}: ${JSON.stringify(Object.fromEntries(MEASURES.map(k=>[k,{with:p.measures[k].estimate,without:report.withoutEval38.policies[policy]?.measures[k].estimate}])))}.`);
 lines.push('','## Failures and fallbacks','');
 for(const [policy,p]of Object.entries(report.all.policies))lines.push(`- ${policy}: failures ${p.failures}; fallbacks ${p.fallbacks}; reasons ${JSON.stringify(p.failuresByReason)}; categories ${JSON.stringify(p.failuresByCategory)}; clean failure combinations ${JSON.stringify(p.cleanFailureBreakdown.combinations)}.`);
 lines.push('','## Categories','','| Category | Policy | Pages | Clean | Recall | Noise |','|---|---|---:|---:|---:|---:|');
 for(const [category,c]of Object.entries(report.byCategory))for(const [policy,p]of Object.entries(c.policies))lines.push(`| ${category} | ${policy} | ${p.pages} | ${p.measures.cleanPass.estimate.toFixed(6)} | ${p.measures.contentRecall.estimate.toFixed(6)} | ${p.measures.noiseLeakage.estimate.toFixed(6)} |`);
 lines.push('','## Ledger','',JSON.stringify(report.ledger),'',...report.notes.map(s=>'- '+s),'');return lines.join('\n');
}
function report({root=f.ROOT,includeLocal=false,outputDirectory}={}){
 const ctx=discover({root}),policies=coverage(ctx,{includeLocal}),ledger=new Ledger({root});if(ledger.totals().pending)throw Error('v4-score-pending-requests');
 const scorer=require('./eval-score.cjs'),directory=outputDirectory||path.join(root,'workspace/revision/results/eval-v4-score-'+Date.now());
 const dirs=[...new Set([...ctx.jobs.values()].filter(j=>policies.includes(j.config.policy)).map(j=>j.directory))];
 const scored=scorer.run({root,siteIds:ctx.verified.manifest.sites.map(s=>s.siteId),directories:dirs,outputDirectory:directory});
 const rows=scored.rows.map(r=>({...r,category:ctx.verified.manifest.sites.find(s=>s.siteId===r.siteId).category||'unspecified',scores:Object.fromEntries(Object.entries(r.scores).filter(([key])=>!['content','noise'].includes(key)))})),accounts=scored.summary.accountingByPolicyAndSite;
 const result={schemaVersion:1,createdAt:new Date().toISOString(),freezeSha256:ctx.verified.sha256,scoringVersion:scored.summary.scoringVersion,policyOrder:h.POLICIES,
  all:scored.summary.all,withoutEval38:scored.summary.withoutMixedFamily,audited:scored.summary.audited,
  byCategory:Object.fromEntries([...new Set(rows.map(r=>r.category))].map(category=>[category,cohort(rows.filter(r=>r.category===category),accounts)])),
  bySite:scored.summary.all.bySite,accountingByPolicyAndSite:accounts,inputs:scored.summary.inputs,
  policyStatus:Object.fromEntries(h.POLICIES.map(p=>[p,{status:p==='P4-local'&&!includeLocal?'pending (not run under v4)':'complete',measuredSites:new Set(rows.filter(r=>r.policy===p).map(r=>r.siteId)).size,plannedSites:p==='P4-Codex'?10:40}])),
  ledger:ledger.totals(),notes:['All ten measures and frozen thresholds are unchanged. 10,000 site-clustered resamples. P3 uses p3 only; Codex minus P4-on uses only the frozen ten Codex sites.','The pending local model has no fabricated failure rows. V3 local evidence is excluded.','Requests/tokens/cost/time are verified against site receipts and the full ledger. Unknown token usage is retained. Historical v3 outputs remain unchanged.']};
 write(path.join(directory,'report.json'),result);fs.writeFileSync(path.join(directory,'report.md'),markdown(result),{flag:'wx'});return {directory,report:result};
}
async function devRescore({root=f.ROOT,sourceDirectory=path.join(root,'workspace/revision/results/run7-final-score-1795249695783'),outputDirectory}={}){
 const verified=f.verify({root}),{PageRegistry}=require('./pages.cjs'),reader=require('../../tests/revision/eval/policies/p1-reader-view.cjs');
 const {score,SCORING_VERSION}=require('../../tests/revision/eval/score.cjs'),stats=require('../../tests/revision/eval/stats.cjs');
 const bytes=fs.readFileSync(path.join(sourceDirectory,'rows.jsonl'),'utf8'),selected=bytes.split('\n').filter(Boolean).map(line=>({line,row:JSON.parse(line)})).filter(x=>['P0','P4-on'].includes(x.row.policy));
 if(selected.length!==72||new Set(selected.map(x=>x.row.id)).size!==36||new Set(selected.map(x=>x.row.id+':'+x.row.policy)).size!==72)throw Error('dev-expected-36-paired-run7-pages');
 const directory=outputDirectory||path.join(root,'workspace/revision/results/dev-P1-v4-'+Date.now()),registry=new PageRegistry({root}),rows=selected.map(x=>x.row);
 fs.mkdirSync(directory,{recursive:true});
 // Preserve the original P0/P4-on JSON lines byte for byte, including saved pointers.
 fs.writeFileSync(path.join(directory,'rows.jsonl'),selected.map(x=>x.line).join('\n')+'\n',{flag:'wx'});
 for(const {row}of selected){const from=f.safe(sourceDirectory,row.outputFile);if(digest(from)!==row.outputSha256)throw Error('dev-old-output-hash');put(path.join(directory,row.outputFile),fs.readFileSync(from));}
 for(const original of rows.filter(r=>r.policy==='P0')){
  const page=registry.resolve(original.id),refFile=f.checkoutPath(original.referenceFile,root),ref=read(refFile);
  if(page.sha256!==original.sourceSha256||digest(refFile)!==original.referenceSha256)throw Error('dev-source-reference-binding');
  const result=await reader.fromRecord(page),filename=page.id+'-P1.html';put(path.join(directory,filename),result.html);
  const row={...original,policy:'P1',ok:result.ok,reason:result.reason,fallback:false,modelRequests:0,promptTokens:0,completionTokens:0,cachedTokens:0,costEstimate:0,latencyMs:result.latencyMs,outputFile:filename,outputSha256:f.sha(result.html),freezeSha256:verified.sha256,scoringVersion:SCORING_VERSION,scores:score(result.ok?result.html:'',ref,{format:'html',ok:result.ok,fallback:false,...original.scores.thresholds})};
  rows.push(row);fs.appendFileSync(path.join(directory,'rows.jsonl'),JSON.stringify(row)+'\n');
 }
 const options={resamples:10000,seed:20261121},summary={freezeSha256:verified.sha256,sourceDirectory,sourceRowsSha256:f.sha(bytes),unchangedRows:72,readerViewSha256:verified.freeze.files['tests/revision/eval/policies/p1-reader-view.cjs'],...stats.summarize(rows,options),pairedP4OnMinusP1:stats.pairedDifference(rows.filter(r=>['P4-on','P1'].includes(r.policy)),'P4-on','P1',options)};
 write(path.join(directory,'summary.json'),summary);return {directory,summary};
}
module.exports={prepare,adopt,discover,generate,coverage,cohort,markdown,report,devRescore};
if(require.main===module){const [command,...args]=process.argv.slice(2),get=k=>args.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3);(async()=>{
 let result;
 if(command==='carry'&&args.includes('--dry-run'))result=carry.plan().summary;
 else if(command==='freeze')result=prepare({testsReceipt:args[0]});
 else if(command==='carry'&&args.includes('--write'))result=adopt();
 else if(command==='generate')result=await generate({policy:args[0],deadline:get('deadline')?Date.parse(get('deadline')):undefined,concurrency:get('concurrency')?Number(get('concurrency')):undefined});
 else if(command==='dev-score')result=await devRescore();
 else if(command==='score')result=report({includeLocal:args.includes('--include-local')});
 else throw Error('Usage: eval-v4.cjs freeze FULL_TEST_RECEIPT | carry --dry-run|--write | generate P1|P4-Codex|P4-local [--concurrency=N] [--deadline=ISO] | dev-score | score [--include-local]');
 console.log(JSON.stringify(result));
 })().catch(e=>{console.error(e.stack);process.exitCode=1;});}
