'use strict';
// V4 remains immutable. This coordinator adopts its completed evidence into v5.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const f=require('./eval-freeze.cjs'),h=require('./eval-run.cjs'),c=require('./eval-carry.cjs'),v4=require('./eval-v4.cjs');
const {Ledger}=require('./ledger.cjs');
const V4='4c711a25c01d16721d010b50f69d90cefc24d21275489bb66425ea3cd7bcb861';
const WORK='workspace/revision/evaluation/v5',LOCAL='backend/agent/local-http.cjs',SELF='backend/agent/eval-v5.cjs';
const POLICIES=h.POLICIES.filter(p=>p!=='P4-local'),read=c.read,digest=c.digest,rel=c.relative;
const write=(file,value)=>h.json(file,value);
function put(file,bytes){if(fs.existsSync(file)){if(digest(file)!==f.sha(bytes))throw Error('v5-existing-evidence-differs:'+file);}else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});}}
function oldFreeze({root=f.ROOT,fromHash=V4}={}){
 const archive=path.join(root,'workspace/revision/freeze/archive/v4'),archived=path.join(archive,path.basename(f.FILE));
 const file=fs.existsSync(archived)?archived:path.join(root,f.FILE);
 if(digest(file)!==fromHash)throw Error('v5-source-freeze-required');
 const freeze=read(file),manifestFile=path.join(path.dirname(file),path.basename(f.MANIFEST));
 if(digest(manifestFile)!==freeze.files[f.MANIFEST])throw Error('v5-source-manifest-hash');
 return {freeze,manifest:read(manifestFile),sha256:fromHash,file};
}
function transportProof(old,{root=f.ROOT}={}){
 // Verify the exact frozen dispatch implementation, then probe it with inert
 // constructors. No runner is configured, no credential is read, no I/O occurs.
 const names=['DeepSeekRunner','LocalRunner','CodexRunner'],routes={};
 const filename=path.join(root,'backend/agent/eval-run.cjs'),mod=new Module(filename,module);
 mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 const original=mod.require.bind(mod);
 mod.require=name=>name==='./runners.cjs'?Object.fromEntries(names.map(kind=>[kind,class{constructor(options){this.kind=kind;this.options=options;}}])):original(name);
 mod._compile(fs.readFileSync(filename,'utf8'),filename);
 for(const policy of h.POLICIES){
  const runner=['P0','P1'].includes(policy)||policy.startsWith('P2-nr')?null:mod.exports.runnerFor(policy,{});
  routes[policy]=runner?.kind||'no model runner';
  if((routes[policy]==='LocalRunner')!==(policy==='P4-local'))throw Error('v5-local-transport-policy-changed:'+policy);
 }
 const runnerSource=fs.readFileSync(path.join(root,'backend/agent/runners.cjs'),'utf8');
 if(!runnerSource.includes("provider==='pc11'&&fetchRequest===fetch?require('./local-http.cjs').localFetch:fetchRequest")||
    !runnerSource.includes("provider: 'deepseek'")||!runnerSource.includes("provider:'pc11'"))throw Error('v5-native-transport-dispatch-changed');
 // The only import of local-http in old frozen source is the conditional above.
 const imports=Object.keys(old.freeze.files).filter(file=>file.endsWith('.cjs')&&file!==LOCAL&&file!==SELF&&fs.readFileSync(path.join(root,file),'utf8').includes("require('./local-http.cjs')"));
 if(JSON.stringify(imports)!==JSON.stringify(['backend/agent/runners.cjs']))throw Error('v5-local-transport-import-changed');
 return {scope:'frozen evaluation policies (development local runners are outside this campaign)',routes,nativeTransportPolicy:'P4-local',imports,
  verifiedFileHashes:Object.fromEntries(['backend/agent/eval-run.cjs','backend/agent/runners.cjs'].map(file=>{const hash=digest(path.join(root,file));if(hash!==old.freeze.files[file])throw Error('v5-transport-proof-file-changed:'+file);return [file,hash];})),
  rationale:'eval-run constructs LocalRunner only for P4-local; DeepSeekRunner explicitly selects provider deepseek; HTTPRunner selects localFetch only for provider pc11 and the default fetch; Codex uses spawn; P0/P1/P2-nr construct no model runner.'};
}
function dependencies(old,{root=f.ROOT,to}={}){
 const unchanged={},changed=[];
 for(const [file,hash]of Object.entries(old.freeze.files)){
  const current=digest(path.join(root,file));
  if(to&&to.freeze.files[file]!==current)throw Error('v5-target-file-binding:'+file);
  if(current===hash)unchanged[file]=hash;
  else if(file===LOCAL)changed.push({file,before:hash,after:current,usedByPolicies:['P4-local']});
  else throw Error('carry-generating-file-changed:'+file);
 }
 const added=f.sourceFiles(root).filter(file=>!Object.hasOwn(old.freeze.files,file));
 if(added.some(file=>file!==SELF))throw Error('v5-unexpected-added-source:'+added.join(','));
 if(to&&Object.keys(to.freeze.files).some(file=>!Object.hasOwn(old.freeze.files,file)&&file!==SELF))throw Error('v5-unexpected-added-frozen-file');
 return {unchangedFileHashes:unchanged,changedFiles:changed,addedFiles:added.map(file=>({file,sha256:digest(path.join(root,file))})),transportProof:transportProof(old,{root})};
}
function loaderProof(old,{root=f.ROOT,to}={}){
 const beforeFile=path.join(root,'workspace/revision/evaluation/v4/freeze-v4-receipt.json'),before=read(beforeFile),proof=before.loaderRecordProof;
 if(before.toFreezeSha256!==old.sha256||proof.toFreezeSha256!==old.sha256)throw Error('v5-loader-source-freeze-binding');
 const registry=c.boundRegistry(root,to||old),prior=new Map(proof.records.map(r=>[r.id,r])),records=[];
 for(const site of old.manifest.sites)for(const page of site.pages){
  const record=registry.resolve(page.id,'eval'),file=rel(root,record.file),local=f.sha(JSON.stringify(record));
  const historical=f.sha(JSON.stringify({...record,file:'C:\\Dev\\Visual_adapter\\'+file.replaceAll('/','\\')})),expected=prior.get(page.id);
  if(!expected||!([expected.v4Sha256,expected.historicalPathSha256].includes(local)||[expected.v4Sha256,expected.historicalPathSha256].includes(historical)))throw Error('v5-loader-record-changed:'+page.id);
  records.push({id:page.id,v4Sha256:expected.v4Sha256,v5Sha256:local,historicalPathSha256:historical,identicalAfterPathMapping:true});
 }
 if(prior.size!==records.length||proof.records.length!==records.length)throw Error('v5-loader-record-count');
 return {fromFreezeSha256:old.sha256,toFreezeSha256:to?.sha256||null,beforeSnapshotSha256:digest(beforeFile),records,pathMapping:proof.pathMapping,identicalAfterPathMapping:true};
}
function sourceDirectories(old,{root=f.ROOT}={}){
 const file=path.join(root,'workspace/revision/evaluation/v4/carry-index.json'),dirs=[];
 if(fs.existsSync(file)){
  const index=read(file);if(index.toFreezeSha256!==old.sha256)throw Error('v5-source-carry-index-freeze');
  dirs.push(...index.directories.map(d=>f.checkoutPath(d,root)));
 }
 const results=path.join(root,'workspace/revision/results');
 if(fs.existsSync(results))for(const e of fs.readdirSync(results,{withFileTypes:true}))if(e.isDirectory()){
  const dir=path.join(results,e.name),config=path.join(dir,'run.json');
  if(fs.existsSync(config)&&read(config).freezeSha256===old.sha256)dirs.push(dir);
 }
 return [...new Set(dirs)];
}
function sourceCarry(job,old){
 const {config,receipt,rows,sourceDirectory}=job;
 if(!config.carryRecordSha256)return;
 const file=path.join(sourceDirectory,'carry.json');
 if(digest(file)!==config.carryRecordSha256)throw Error('v5-source-carry-hash');
 const record=read(file);
 if(record.toFreezeSha256!==old.sha256||record.fromFreezeSha256!==config.carriedFromFreezeSha256||receipt.carryRecordSha256!==config.carryRecordSha256||rows.some(r=>r.carryRecordSha256!==config.carryRecordSha256))throw Error('v5-source-carry-binding');
}
function plan({root=f.ROOT,fromHash=V4,to,directories}={}){
 const old=oldFreeze({root,fromHash}),deps=dependencies(old,{root,to}),proof=loaderProof(old,{root,to});
 const entries=h.lines(path.join(root,'workspace/revision/ledger.jsonl'));
 if(!entries.some(e=>e.event==='freeze'&&e.freezeSha256===old.sha256))throw Error('v5-source-ledger-receipt');
 const jobs=[],keys=new Set();
 for(const directory of directories||sourceDirectories(old,{root})){
  const config=read(path.join(directory,'run.json'));if(config.freezeSha256!==old.sha256)throw Error('v5-source-run-freeze');
  if(config.policy==='P4-local')continue;
  if(!POLICIES.includes(config.policy))throw Error('v5-unknown-carry-policy:'+config.policy);
  for(const siteId of config.siteIds){
   if(!fs.existsSync(path.join(directory,'sites',siteId,'complete.json')))continue;
   const key=config.policy+':'+siteId;if(keys.has(key))throw Error('v5-duplicate-completed-site:'+key);keys.add(key);
   const site=old.manifest.sites.find(s=>s.siteId===siteId);if(!site)throw Error('v5-unknown-source-site');
   if(config.policy==='P4-Codex'&&!old.freeze.execution.Codex.siteIds.includes(siteId))throw Error('v5-Codex-outside-frozen-subset');
   const job=c.siteInput(directory,config,site,old,{entries:()=>entries});sourceCarry(job,old);jobs.push(job);
  }
 }
 jobs.sort((a,b)=>a.policy.localeCompare(b.policy)||a.siteId.localeCompare(b.siteId));
 const policies=Object.fromEntries(POLICIES.map(policy=>{const selected=jobs.filter(j=>j.policy===policy);return [policy,{sites:selected.length,rows:selected.reduce((s,j)=>s+j.rows.length,0),requests:selected.reduce((s,j)=>s+j.requestsCarried,0)}];}));
 return {old,jobs,summary:{dryRun:!to,fromFreezeSha256:old.sha256,toFreezeSha256:to?.sha256||null,policies,totalSites:jobs.length,totalRows:jobs.reduce((s,j)=>s+j.rows.length,0),...deps,loaderRecordProof:proof,excludedPolicies:['P4-local (regenerate under v5)'],blockers:[],requestsGenerated:0}};
}
function requireComplete(p){
 const missing=[];for(const policy of POLICIES){const expected=policy==='P4-Codex'?p.old.freeze.execution.Codex.siteIds.length:p.old.manifest.sites.length;if(p.summary.policies[policy].sites!==expected)missing.push(policy);}
 if(missing.length)throw Error('v5-incomplete-source-campaign:'+missing.join(','));
}
function prepare({root=f.ROOT,testsReceipt,fromHash=V4}={}){
 const p=plan({root,fromHash});
 const receipt=read(testsReceipt),sources=Object.fromEntries(f.sourceFiles(root).map(file=>[file,digest(path.join(root,file))]));
 if(receipt.ok!==true||receipt.commands?.length!==2||receipt.commands.some(c=>c.status!==0)||JSON.stringify(receipt.sourceHashes)!==JSON.stringify(sources))throw Error('v5-full-test-receipt-required');
 if(p.summary.changedFiles.length!==1||p.summary.changedFiles[0].file!==LOCAL)throw Error('v5-exactly-local-http-change-required');
 f.retained(root);if(new Ledger({root}).totals().pending)throw Error('v5-pending-requests');
 const archive=path.join(root,'workspace/revision/freeze/archive/v4'),moves=[f.FILE,f.MANIFEST].map(file=>({oldPath:file,newPath:rel(root,path.join(archive,path.basename(file))),sha256:digest(path.join(root,file))}));
 for(const move of moves)if(fs.existsSync(path.join(root,move.newPath)))throw Error('v5-archive-target-exists:'+move.newPath);
 const sourceArchives=[];
 for(const file of f.sourceFiles(root).filter(file=>Object.hasOwn(p.old.freeze.files,file))){
  const from=path.join(root,file===LOCAL?WORK+'/before/'+file:file),hash=p.old.freeze.files[file];
  if(digest(from)!==hash)throw Error('v5-source-archive-hash:'+file);
  sourceArchives.push({oldPath:file,newPath:rel(root,path.join(archive,file)),sha256:hash,from});
 }
 const logFile=path.join(root,'workspace/revision/freeze/FREEZE-LOG.md'),priorLog=fs.readFileSync(logFile),logArchive=path.join(root,WORK,'archive','FREEZE-LOG-before-v5-'+Date.now()+'.md');
 // Complete all validation before moving the active freeze records.
 for(const item of sourceArchives)if(fs.existsSync(path.join(root,item.newPath))&&digest(path.join(root,item.newPath))!==item.sha256)throw Error('v5-source-archive-exists:'+item.newPath);
 if(fs.existsSync(path.join(root,WORK,'freeze-v5-receipt.json')))throw Error('v5-freeze-receipt-exists');
 for(const {from,newPath}of sourceArchives)put(path.join(root,newPath),fs.readFileSync(from));
 put(logArchive,priorLog);
 for(const move of moves)fs.renameSync(path.join(root,move.oldPath),path.join(root,move.newPath));
 const verified=f.create({root,testsReceipt}),proof=loaderProof(p.old,{root,to:verified});
 const record={at:new Date().toISOString(),fromFreezeSha256:p.old.sha256,toFreezeSha256:verified.sha256,moves,sourceArchives:sourceArchives.map(({from,...item})=>item),changedFiles:p.summary.changedFiles,addedFiles:p.summary.addedFiles,transportProof:p.summary.transportProof,loaderRecordProof:proof,testsReceipt:rel(root,path.resolve(testsReceipt)),previousLog:{oldPath:rel(root,logFile),newPath:rel(root,logArchive),sha256:f.sha(priorLog)}};
 fs.mkdirSync(path.join(root,WORK),{recursive:true});write(path.join(root,WORK,'freeze-v5-receipt.json'),record);
 const nl=priorLog.includes(Buffer.from('\r\n'))?'\r\n':'\n';
 fs.appendFileSync(logFile,['','## Freeze v5 — '+record.at,'',`V4 ${p.old.sha256} superseded by V5 ${verified.sha256}. Only existing frozen source change: local-http.cjs Content-Length uses UTF-8 byte length.`,
  ...moves.map(m=>`- ${m.oldPath} -> ${m.newPath}; SHA-256 ${m.sha256}`),...record.sourceArchives.map(m=>`- Archived source ${m.oldPath} -> ${m.newPath}; SHA-256 ${m.sha256}`),
  ...record.changedFiles.map(d=>`- ${d.file}: v4 ${d.before}; v5 ${d.after}`),...record.addedFiles.map(d=>`- Added coordinator source ${d.file}; SHA-256 ${d.sha256}`),
  '',`Full receipt: ${WORK}/freeze-v5-receipt.json. All ${proof.records.length} loader records match after path mapping. All nonlocal v4 outputs carry unchanged; no P4-local evidence carries. Tests/revision/agent tests are outside the frozen source set. Carry and generation are separate operations.`,''].join(nl));
 return record;
}
function materialize(p,{root=f.ROOT,to,outputDirectory}={}){
 if(!to||to.sha256===p.old.sha256||f.verify({root}).sha256!==to.sha256)throw Error('v5-target-freeze-required');
 // Recheck all source bytes and receipts immediately before writing anything.
 const checked=plan({root,fromHash:p.old.sha256,to,directories:[...new Set(p.jobs.map(j=>j.sourceDirectory))]});
 if(JSON.stringify(checked.summary)!==JSON.stringify({...p.summary,dryRun:false,toFreezeSha256:to.sha256,loaderRecordProof:checked.summary.loaderRecordProof})||JSON.stringify(checked.jobs)!==JSON.stringify(p.jobs))throw Error('v5-source-changed-after-plan');
 const base=outputDirectory||path.join(root,'workspace/revision/results/eval-v5-carry-'+to.sha256.slice(0,12)),directories=[];
 for(const job of p.jobs){
  const directory=path.join(base,job.policy,job.siteId),siteDir=path.join(directory,'sites',job.siteId);fs.mkdirSync(siteDir,{recursive:true});
  const record={...checked.summary,dryRun:false,policy:job.policy,siteId:job.siteId,sourceDirectory:job.sourceDirectory,sourceRowsSha256:job.sourceRowsSha256,sourceReceiptSha256:job.sourceReceiptSha256,requestsCarried:job.requestsCarried,outputs:job.rows.map(r=>({id:r.id,file:r.outputFile,sha256:r.outputSha256}))};
  put(path.join(directory,'carry.json'),JSON.stringify(record,null,2));const hash=digest(path.join(directory,'carry.json'));
  const provenance={freezeSha256:to.sha256,carriedFromFreezeSha256:p.old.sha256,carryRecordSha256:hash};
  put(path.join(directory,'run.json'),JSON.stringify({...job.config,...provenance,siteIds:[job.siteId],carriedFrom:job.sourceDirectory},null,2));
  for(const name of Object.keys(job.receipt.evidenceHashes||{}))put(path.join(siteDir,name),fs.readFileSync(f.safe(path.join(job.sourceDirectory,'sites',job.siteId),name)));
  const rows=job.rows.map(row=>{put(path.join(directory,row.outputFile),fs.readFileSync(f.safe(job.sourceDirectory,row.outputFile)));return {...row,...provenance};});
  put(path.join(directory,'rows.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  put(path.join(siteDir,'complete.json'),JSON.stringify({...job.receipt,...provenance,originalReceiptSha256:job.sourceReceiptSha256},null,2));directories.push(directory);
 }
 return {directory:base,directories,...checked.summary,dryRun:false};
}
function adopt({root=f.ROOT,fromHash=V4}={}){
 const to=f.verify({root}),p=plan({root,fromHash,to});requireComplete(p);
 if(to.sha256===fromHash)throw Error('v5-freeze-required');
 const result=materialize(p,{root,to});put(path.join(root,WORK,'carry-index.json'),JSON.stringify(result,null,2));return result;
}
function discover({root=f.ROOT,verified=f.verify({root})}={}){
 const receipt=read(path.join(root,WORK,'freeze-v5-receipt.json'));
 if(receipt.toFreezeSha256!==verified.sha256||receipt.fromFreezeSha256===verified.sha256)throw Error('v5-freeze-receipt-binding');
 const dirs=[],index=path.join(root,WORK,'carry-index.json');
 if(fs.existsSync(index)){const c=read(index);if(c.toFreezeSha256!==verified.sha256)throw Error('v5-carry-index-freeze');dirs.push(...c.directories.map(d=>f.checkoutPath(d,root)));}
 const results=path.join(root,'workspace/revision/results');
 for(const e of fs.existsSync(results)?fs.readdirSync(results,{withFileTypes:true}):[])if(e.isDirectory()){
  const dir=path.join(results,e.name),file=path.join(dir,'run.json');if(fs.existsSync(file)&&read(file).freezeSha256===verified.sha256)dirs.push(dir);
 }
 const jobs=new Map();for(const directory of new Set(dirs)){const config=read(path.join(directory,'run.json'));if(config.freezeSha256!==verified.sha256)throw Error('v5-job-freeze');for(const siteId of config.siteIds){
  const key=config.policy+':'+siteId;if(jobs.has(key))throw Error('v5-duplicate-job:'+key);
  const file=path.join(directory,'sites',siteId,'complete.json'),complete=fs.existsSync(file);
  if(complete){const receipt=read(file);if(receipt.policy!==config.policy||receipt.siteId!==siteId||receipt.freezeSha256!==verified.sha256)throw Error('v5-completion-binding:'+key);}
  jobs.set(key,{directory,config,siteId,complete});
 }}return {verified,jobs};
}
async function generateWork({root=f.ROOT,policy,deadline=Date.now()+24*3600000,concurrency=4,runnerFactory=h.runnerFor,onEvent=e=>console.log(JSON.stringify(e))}={}){
 if(policy!=='P4-local')throw Error('v5-generation-policy');
 if(!Number.isFinite(deadline))throw Error('v5-invalid-deadline');
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw Error('v5-concurrency-limit');
 const ctx=discover({root}),ids=ctx.verified.manifest.sites.map(s=>s.siteId);
 const pending=ids.filter(id=>!ctx.jobs.get(policy+':'+id)?.complete),runners=new Set();let next=0,stopped=null;
 const stop=reason=>{stopped=stopped||reason;for(const runner of runners)runner.close();};
 const work=async()=>{while(!stopped&&next<pending.length){
  if(Date.now()>=deadline){stop('evaluation-deadline');break;}
  const siteId=pending[next++];let job=ctx.jobs.get(policy+':'+siteId);
  try{
   if(!job){const directory=h.newRun(policy,[siteId],ctx.verified,{root});job={directory,siteId};ctx.jobs.set(policy+':'+siteId,job);}
   const result=await h.runPolicy({root,policy,siteIds:[siteId],directory:job.directory,deadline,onEvent,runnerFactory:(p,l)=>{const runner=runnerFactory(p,l);runners.add(runner);return runner;}});
   if(result.stopped)stop(result.stopped);
  }catch(error){stop(error.message);}
 }};
 try{await Promise.all(Array.from({length:Math.min(concurrency,pending.length)},work));}finally{for(const runner of runners)runner.close();}
 const remaining=ids.filter(id=>!fs.existsSync(path.join(ctx.jobs.get(policy+':'+id)?.directory||'', 'sites',id,'complete.json')));
 const result={policy,concurrency,stopped,remaining,freezeSha256:ctx.verified.sha256};if(stopped||remaining.length)throw Object.assign(Error('v5-generation-stopped:'+JSON.stringify(result)),{result});return result;
}
async function generate(options={}){
 const root=options.root||f.ROOT,owner=path.join(root,WORK,'generation.lock');fs.mkdirSync(path.dirname(owner),{recursive:true});
 if(fs.existsSync(owner)){
  const prior=read(owner);if(!Number.isSafeInteger(prior.pid)||prior.pid<1)throw Error('v5-generation-lock-owner-invalid');
  try{process.kill(prior.pid,0);throw Error('v5-generation-locked');}catch(e){if(e.code!=='ESRCH')throw e;}
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
 if(missing.length)throw Error('v5-score-incomplete:'+missing.join(','));
 return required;
}
function cohort(rows,accounts){return v4.cohort(rows,accounts);}
function markdown(report){return v4.markdown(report).replace('# Frozen evaluation v4','# Frozen evaluation v5');}
function report({root=f.ROOT,includeLocal=false,outputDirectory}={}){
 const ctx=discover({root}),policies=coverage(ctx,{includeLocal}),ledger=new Ledger({root});if(ledger.totals().pending)throw Error('v5-score-pending-requests');
 const scorer=require('./eval-score.cjs'),directory=outputDirectory||path.join(root,'workspace/revision/results/eval-v5-score-'+Date.now());
 const dirs=[...new Set([...ctx.jobs.values()].filter(j=>policies.includes(j.config.policy)).map(j=>j.directory))];
 const scored=scorer.run({root,siteIds:ctx.verified.manifest.sites.map(s=>s.siteId),directories:dirs,outputDirectory:directory});
 const rows=scored.rows.map(r=>({...r,category:ctx.verified.manifest.sites.find(s=>s.siteId===r.siteId).category||'unspecified',scores:Object.fromEntries(Object.entries(r.scores).filter(([key])=>!['content','noise'].includes(key)))})),accounts=scored.summary.accountingByPolicyAndSite;
 const result={schemaVersion:1,createdAt:new Date().toISOString(),freezeSha256:ctx.verified.sha256,scoringVersion:scored.summary.scoringVersion,policyOrder:h.POLICIES,
  all:scored.summary.all,withoutEval38:scored.summary.withoutMixedFamily,audited:scored.summary.audited,
  byCategory:Object.fromEntries([...new Set(rows.map(r=>r.category))].map(category=>[category,cohort(rows.filter(r=>r.category===category),accounts)])),
  bySite:scored.summary.all.bySite,accountingByPolicyAndSite:accounts,inputs:scored.summary.inputs,
  policyStatus:Object.fromEntries(h.POLICIES.map(p=>[p,{status:p==='P4-local'&&!includeLocal?'pending (not run under v5)':'complete',measuredSites:new Set(rows.filter(r=>r.policy===p).map(r=>r.siteId)).size,plannedSites:p==='P4-Codex'?10:40}])),
  ledger:ledger.totals(),notes:['All ten measures and frozen thresholds are unchanged. 10,000 site-clustered resamples. P3 uses p3 only; Codex minus P4-on uses only the frozen ten Codex sites.',includeLocal?'P4-local is complete under v5. All v4 local evidence is excluded.':'P4-local is pending; no fabricated failure rows. All v4 local evidence is excluded.','Requests/tokens/cost/time are verified against site receipts and the full ledger. Unknown token usage is retained. Historical v4 outputs remain unchanged.']};
 write(path.join(directory,'report.json'),result);fs.writeFileSync(path.join(directory,'report.md'),markdown(result),{flag:'wx'});return {directory,report:result};
}
module.exports={V4,WORK,LOCAL,POLICIES,oldFreeze,transportProof,dependencies,loaderProof,sourceDirectories,plan,requireComplete,prepare,materialize,adopt,discover,generate,coverage,cohort,markdown,report};
if(require.main===module){const [command,...args]=process.argv.slice(2),get=k=>args.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3);(async()=>{
 let result;
 if(command==='carry'&&args.includes('--dry-run'))result=plan().summary;
 else if(command==='freeze')result=prepare({testsReceipt:args[0]});
 else if(command==='carry'&&args.includes('--write'))result=adopt();
 else if(command==='generate')result=await generate({policy:args[0],deadline:get('deadline')?Date.parse(get('deadline')):undefined,concurrency:get('concurrency')?Number(get('concurrency')):undefined});
 else if(command==='score')result=report({includeLocal:args.includes('--include-local')});
 else throw Error('Usage: eval-v5.cjs freeze FULL_TEST_RECEIPT | carry --dry-run|--write | generate P4-local [--concurrency=1..4] [--deadline=ISO] | score --include-local');
 console.log(JSON.stringify(result));
 })().catch(e=>{console.error(e.stack);process.exitCode=1;});}
