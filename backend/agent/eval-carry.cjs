'use strict';
// Carry is a byte-verified adoption of completed evidence, never regeneration.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./eval-freeze.cjs'),h=require('./eval-run.cjs');
const V3='9c430042776170100b54484502cc495c3aa82fecdfedda512ffef4ec2b5c16df';
const POLICIES=h.POLICIES.filter(p=>!['P1','P4-local'].includes(p));
// Explicitly approved orchestration/transport fixes, not extraction generators.
// Every other old frozen file, including prompts/gates/views/baselines, must match.
const OPERATIONAL=['backend/agent/eval-run.cjs','backend/agent/eval-score.cjs','backend/agent/runners.cjs','backend/agent/runtime.cjs','backend/agent/eval-freeze.cjs'];
const read=file=>JSON.parse(fs.readFileSync(file)),digest=file=>f.sha(fs.readFileSync(file));
const relative=(root,file)=>path.relative(root,file).split(path.sep).join('/');
function oldFreeze(root=f.ROOT,expected=V3){
 const archived=path.join(root,'workspace/revision/freeze/archive/v3/evaluation-freeze.json');
 const file=fs.existsSync(archived)?archived:path.join(root,f.FILE);
 if(digest(file)!==expected)throw Error('carry-v3-freeze-required');
 const freeze=read(file),manifestFile=fs.existsSync(archived)?path.join(path.dirname(archived),'evaluation-manifest.json'):path.join(root,f.MANIFEST);
 if(digest(manifestFile)!==freeze.files[f.MANIFEST])throw Error('carry-v3-manifest-hash');
 return {freeze,manifest:read(manifestFile),sha256:expected,file};
}
function dependencies(old,{root=f.ROOT,to}={}){
 const unchanged={},changed=[];
 for(const [file,hash] of Object.entries(old.freeze.files)){
  const current=digest(path.join(root,file));
  if(to&&to.freeze.files[file]!==current)throw Error('carry-v4-file-binding:'+file);
  if(current===hash)unchanged[file]=hash;
  else if(OPERATIONAL.includes(file))changed.push({file,before:hash,after:current});
  else throw Error('carry-generating-file-changed:'+file);
 }
 // The before snapshot archived every executable v3 source, including package pins.
 const sourceFiles=read(path.join(root,'workspace/revision/evaluation/v4/before.json')).sourceFiles;
 for(const file of sourceFiles)if(digest(path.join(root,'workspace/revision/freeze/archive/v3',file))!==old.freeze.files[file])throw Error('carry-v3-archive-hash:'+file);
 return {unchangedFileHashes:unchanged,changedFiles:changed};
}
function boundRegistry(root,old){
 // Use the unchanged production loader with a verified historical freeze binding.
 // No global require cache changes and no weakened production verification.
 const filename=path.join(root,'backend/agent/pages.cjs'),mod=new Module(filename,module);
 mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 const original=mod.require.bind(mod);mod.require=name=>name==='./eval-freeze.cjs'?{verify:()=>old}:original(name);
 mod._compile(fs.readFileSync(filename,'utf8'),filename);
 return new mod.exports.PageRegistry({root});
}
function loaderProof(old,{root=f.ROOT,to,registry}={}){
 const beforeFile=path.join(root,'workspace/revision/evaluation/v4/before.json'),before=read(beforeFile);
 if(before.freezeSha256!==old.sha256)throw Error('carry-loader-before-freeze-binding');
 registry=registry||boundRegistry(root,to||old);
 const prior=new Map(before.recordHashes.map(r=>[r.id,r.sha256])),records=[];
 for(const site of old.manifest.sites)for(const page of site.pages){
  const record=registry.resolve(page.id,'eval'),file=relative(root,record.file);
  // JSON record identity includes the absolute capture filename. Compare using
  // the original Windows namespace as well as recording this host's identity.
  const historical={...record,file:'C:\\Dev\\Visual_adapter\\'+file.replaceAll('/','\\')};
  const localHash=f.sha(JSON.stringify(record)),historicalHash=f.sha(JSON.stringify(historical)),expected=prior.get(page.id);
  if(localHash!==expected&&historicalHash!==expected)throw Error('carry-loader-record-changed:'+page.id);
  records.push({id:page.id,v3Sha256:expected,v4Sha256:localHash,historicalPathSha256:historicalHash,identicalAfterPathMapping:true});
 }
 if(prior.size!==records.length)throw Error('carry-loader-record-count');
 return {fromFreezeSha256:old.sha256,toFreezeSha256:to?.sha256||null,beforeSnapshotSha256:digest(beforeFile),records,pathMapping:'C:\\Dev\\Visual_adapter -> checkout root (read time only)',identicalAfterPathMapping:true};
}
function siteInput(directory,config,site,old,ledger){
 const siteDir=path.join(directory,'sites',site.siteId),receiptFile=path.join(siteDir,'complete.json');
 const receipt=read(receiptFile);
 if(receipt.policy!==config.policy||receipt.siteId!==site.siteId||receipt.freezeSha256!==old.sha256)throw Error('carry-source-receipt-binding');
 for(const [file,hash] of Object.entries(receipt.evidenceHashes||{}))if(digest(f.safe(siteDir,file))!==hash)throw Error('carry-source-evidence-hash:'+file);
 const rows=h.lines(path.join(directory,'rows.jsonl')).filter(r=>r.siteId===site.siteId),expected=h.targets(site,config.policy).map(p=>p.id),ids=rows.map(r=>r.id);
 if(new Set(ids).size!==ids.length||JSON.stringify([...ids].sort())!==JSON.stringify([...expected].sort())||JSON.stringify([...receipt.rows].sort())!==JSON.stringify([...expected].sort()))throw Error('carry-source-page-coverage');
 for(const row of rows){
  const page=site.pages.find(p=>p.id===row.id);
  if(row.policy!==config.policy||row.freezeSha256!==old.sha256||row.sourceSha256!==page.sha256||row.referenceSha256!==page.referenceSha256||row.site!==site.host)throw Error('carry-source-row-binding');
  if(digest(f.safe(directory,row.outputFile))!==row.outputSha256)throw Error('carry-source-output-hash:'+row.id);
 }
 const account=h.accounting(ledger,config.experiment,site.host);
 for(const key of ['modelRequests','promptTokens','completionTokens','cachedTokens','costEstimate','unknownUsageRequests'])if(Math.abs((receipt.accounting[key]||0)-(account[key]||0))>1e-10)throw Error('carry-source-accounting:'+key);
 if(JSON.stringify([...(receipt.accounting.requestIds||[])].sort())!==JSON.stringify([...account.requestIds].sort()))throw Error('carry-source-request-ids');
 if(new Set(rows.flatMap(r=>r.requestIds||[])).size!==account.modelRequests||rows.reduce((s,r)=>s+r.modelRequests,0)!==account.modelRequests)throw Error('carry-source-row-requests');
 return {policy:config.policy,siteId:site.siteId,sourceDirectory:directory,config,receipt,rows,sourceRowsSha256:digest(path.join(directory,'rows.jsonl')),sourceReceiptSha256:digest(receiptFile),requestsCarried:account.modelRequests};
}
function plan({root=f.ROOT,fromHash=V3,to,directories}={}){
 const old=oldFreeze(root,fromHash),deps=dependencies(old,{root,to}),proof=loaderProof(old,{root,to});
 const entries=h.lines(path.join(root,'workspace/revision/ledger.jsonl'));
 if(!entries.some(e=>e.event==='freeze'&&e.freezeSha256===old.sha256))throw Error('carry-v3-ledger-receipt');
 const ledger={entries:()=>entries},results=path.join(root,'workspace/revision/results');
 directories=directories||fs.readdirSync(results,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('eval-')).map(e=>path.join(results,e.name));
 const jobs=[],keys=new Set();
 for(const directory of directories){
  const configFile=path.join(directory,'run.json');if(!fs.existsSync(configFile))continue;
  const config=read(configFile);if(config.freezeSha256!==old.sha256||!POLICIES.includes(config.policy))continue;
  for(const siteId of config.siteIds){
   if(!fs.existsSync(path.join(directory,'sites',siteId,'complete.json')))continue;
   const key=config.policy+':'+siteId;if(keys.has(key))throw Error('carry-duplicate-completed-site:'+key);keys.add(key);
   const site=old.manifest.sites.find(s=>s.siteId===siteId);if(!site)throw Error('carry-unknown-site');
   if(config.policy==='P4-Codex'&&siteId!=='eval-02')throw Error('carry-unexpected-v3-Codex-site');
   jobs.push(siteInput(directory,config,site,old,ledger));
  }
 }
 jobs.sort((a,b)=>a.policy.localeCompare(b.policy)||a.siteId.localeCompare(b.siteId));
 const policies=Object.fromEntries(POLICIES.map(policy=>{const selected=jobs.filter(j=>j.policy===policy);return [policy,{sites:selected.length,rows:selected.reduce((s,j)=>s+j.rows.length,0),requests:selected.reduce((s,j)=>s+j.requestsCarried,0)}];}));
 return {old,jobs,summary:{dryRun:!to,fromFreezeSha256:old.sha256,toFreezeSha256:to?.sha256||null,policies,totalSites:jobs.length,totalRows:jobs.reduce((s,j)=>s+j.rows.length,0),...deps,loaderRecordProof:proof,excludedPolicies:['P1 (regenerate Reader View)','P4-local (v3 evidence retained only)'],blockers:[],requestsGenerated:0}};
}
function materialize(plan,{root=f.ROOT,to,outputDirectory}={}){
 if(!to||to.sha256===plan.old.sha256)throw Error('carry-v4-freeze-required');
 const current=f.verify({root});if(current.sha256!==to.sha256)throw Error('carry-current-freeze-binding');
 dependencies(plan.old,{root,to});loaderProof(plan.old,{root,to});
 const entries=h.lines(path.join(root,'workspace/revision/ledger.jsonl'));
 for(const job of plan.jobs){
  const config=read(path.join(job.sourceDirectory,'run.json'));
  if(JSON.stringify(config)!==JSON.stringify(job.config))throw Error('carry-source-config-changed');
  const checked=siteInput(job.sourceDirectory,config,plan.old.manifest.sites.find(s=>s.siteId===job.siteId),plan.old,{entries:()=>entries});
  if(checked.sourceRowsSha256!==job.sourceRowsSha256||checked.sourceReceiptSha256!==job.sourceReceiptSha256)throw Error('carry-source-changed-after-plan');
 }
 const base=outputDirectory||path.join(root,'workspace/revision/results/eval-v4-carry-'+Date.now());
 const dirs=[];
 for(const job of plan.jobs){
  const directory=path.join(base,job.policy,job.siteId),siteDir=path.join(directory,'sites',job.siteId);
  const put=(file,bytes)=>{if(fs.existsSync(file)){if(digest(file)!==f.sha(bytes))throw Error('carry-existing-bytes-differ:'+file);}else fs.writeFileSync(file,bytes,{flag:'wx'});};
  const json=(file,value)=>put(file,JSON.stringify(value,null,2));
  fs.mkdirSync(siteDir,{recursive:true});
  json(path.join(directory,'carry.json'),{...plan.summary,dryRun:false,policy:job.policy,siteId:job.siteId,sourceDirectory:job.sourceDirectory,sourceRowsSha256:job.sourceRowsSha256,sourceReceiptSha256:job.sourceReceiptSha256,requestsCarried:job.requestsCarried,outputs:job.rows.map(r=>({id:r.id,file:r.outputFile,sha256:r.outputSha256}))});
  const carryHash=digest(path.join(directory,'carry.json'));
  json(path.join(directory,'run.json'),{...job.config,siteIds:[job.siteId],freezeSha256:to.sha256,carriedFrom:job.sourceDirectory,carriedFromFreezeSha256:plan.old.sha256,carryRecordSha256:carryHash});
  for(const [name]of Object.entries(job.receipt.evidenceHashes||{}))put(path.join(siteDir,name),fs.readFileSync(f.safe(path.join(job.sourceDirectory,'sites',job.siteId),name)));
  const rows=job.rows.map(row=>{put(path.join(directory,row.outputFile),fs.readFileSync(f.safe(job.sourceDirectory,row.outputFile)));return {...row,freezeSha256:to.sha256,carriedFromFreezeSha256:plan.old.sha256,carryRecordSha256:carryHash};});
  put(path.join(directory,'rows.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  json(path.join(siteDir,'complete.json'),{...job.receipt,freezeSha256:to.sha256,carriedFromFreezeSha256:plan.old.sha256,carryRecordSha256:carryHash,originalReceiptSha256:job.sourceReceiptSha256});
  dirs.push(directory);
 }
 return {directory:base,directories:dirs,...plan.summary,dryRun:false,toFreezeSha256:to.sha256};
}
module.exports={V3,POLICIES,OPERATIONAL,read,digest,relative,oldFreeze,dependencies,boundRegistry,loaderProof,siteInput,plan,materialize};
if(require.main===module){try{
 const args=process.argv.slice(2),dry=args.includes('--dry-run'),to=dry?undefined:f.verify(),p=plan({to});
 if(!dry&&!args.includes('--write'))throw Error('Usage: eval-carry.cjs --dry-run | --write --output=NEW_DIRECTORY');
 const out=args.find(a=>a.startsWith('--output='))?.slice(9),result=dry?p.summary:materialize(p,{to,outputDirectory:out});console.log(JSON.stringify(result,null,2));
}catch(e){console.error(e.stack);process.exitCode=1;}}
