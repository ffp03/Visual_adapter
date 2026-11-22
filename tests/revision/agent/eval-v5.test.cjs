'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('../../../backend/agent/eval-freeze.cjs'),h=require('../../../backend/agent/eval-run.cjs'),c=require('../../../backend/agent/eval-carry.cjs'),v=require('../../../backend/agent/eval-v5.cjs');
const {fixture,modelFactory}=require('./evaluation-fixture.cjs');
function refreshReceipt(ctx){const receipt=JSON.parse(fs.readFileSync(ctx.testsReceipt));receipt.sourceHashes=Object.fromEntries(f.sourceFiles(ctx.root).map(file=>[file,c.digest(path.join(ctx.root,file))]));fs.writeFileSync(ctx.testsReceipt,JSON.stringify(receipt));}
function prior(){
 const ctx=fixture(),root=ctx.root,file=path.join(root,v.LOCAL),current=fs.readFileSync(file);
 const before=current.toString().replace(" if(body!==undefined&&!Object.keys(headers).some(name=>name.toLowerCase()==='content-length'))headers={...headers,'Content-Length':Buffer.byteLength(body,'utf8')};\n",'');
 assert.notEqual(before,current.toString());fs.writeFileSync(file,before);refreshReceipt(ctx);
 const old=f.create(ctx),registry=c.boundRegistry(root,old);
 const records=old.manifest.sites.flatMap(s=>s.pages.map(p=>{const record=registry.resolve(p.id,'eval'),historical={...record,file:'C:\\Dev\\Visual_adapter\\'+c.relative(root,record.file).replaceAll('/','\\')};return {id:p.id,v4Sha256:f.sha(JSON.stringify(historical)),historicalPathSha256:f.sha(JSON.stringify(historical))};}));
 const work=path.join(root,'workspace/revision/evaluation/v4');fs.mkdirSync(work,{recursive:true});h.json(path.join(work,'freeze-v4-receipt.json'),{toFreezeSha256:old.sha256,loaderRecordProof:{toFreezeSha256:old.sha256,records,pathMapping:'Windows checkout -> current root'}});
 const snapshot=path.join(root,v.WORK,'before',v.LOCAL);fs.mkdirSync(path.dirname(snapshot),{recursive:true});fs.writeFileSync(snapshot,before);
 fs.writeFileSync(path.join(root,'workspace/revision/freeze/FREEZE-LOG.md'),'# Prior v4 log\r\n');
 return {...ctx,old,current,apply(){fs.writeFileSync(file,current);refreshReceipt(ctx);}};
}
const quiet={onEvent:()=>{}};
test('v5 dry-run combines nested carry and fresh v4 jobs, proves local-only transport, checks all loader records and writes nothing',async()=>{
 const ctx=prior(),{root,old}=ctx;
 const p0=await h.runPolicy({root,policy:'P0',siteIds:['eval-01'],...quiet});
 const nested=path.join(root,'workspace/revision/results/eval-v4-carry-fixture/P0/eval-01');fs.mkdirSync(path.dirname(nested),{recursive:true});fs.renameSync(p0.directory,nested);
 const carryRecord={toFreezeSha256:old.sha256,fromFreezeSha256:f.sha('v3 fixture')};h.json(path.join(nested,'carry.json'),carryRecord);
 const carryHash=c.digest(path.join(nested,'carry.json')),provenance={carryRecordSha256:carryHash,carriedFromFreezeSha256:carryRecord.fromFreezeSha256};
 for(const name of ['run.json','sites/eval-01/complete.json']){const file=path.join(nested,name);fs.writeFileSync(file,JSON.stringify({...JSON.parse(fs.readFileSync(file)),...provenance}));}
 const rowFile=path.join(nested,'rows.jsonl');fs.writeFileSync(rowFile,h.lines(rowFile).map(row=>JSON.stringify({...row,...provenance})).join('\n')+'\n');
 const sample=await h.runPolicy({root,policy:'P4-Codex',siteIds:['eval-02'],runnerFactory:modelFactory,...quiet});
 const more=await h.runPolicy({root,policy:'P4-Codex',siteIds:['eval-01'],runnerFactory:modelFactory,...quiet});
 await h.runPolicy({root,policy:'P1',siteIds:['eval-01'],...quiet});
 h.json(path.join(root,'workspace/revision/evaluation/v4/carry-index.json'),{toFreezeSha256:old.sha256,directories:[nested,sample.directory]});
 ctx.apply();
 const paths=[f.FILE,'workspace/revision/ledger.jsonl','workspace/revision/evaluation/v4/carry-index.json'],before=paths.map(file=>fs.readFileSync(path.join(root,file))),dirs=fs.readdirSync(path.join(root,'workspace/revision/results'));
 const p=v.plan({root,fromHash:old.sha256});
 assert.equal(p.summary.totalSites,4);assert.equal(p.summary.totalRows,12);assert.equal(p.summary.policies['P4-Codex'].sites,2);assert.equal(p.summary.policies.P1.rows,3);assert.equal(p.summary.policies['P4-local'],undefined);
 assert.equal(p.summary.changedFiles[0].file,v.LOCAL);assert.equal(p.summary.loaderRecordProof.records.length,200);
 assert.ok(p.summary.loaderRecordProof.records.every(r=>r.v4Sha256===r.historicalPathSha256));assert.equal(p.summary.transportProof.routes['P4-local'],'LocalRunner');
 assert.ok(Object.entries(p.summary.transportProof.routes).every(([p,r])=>p==='P4-local'||r!=='LocalRunner'));
 paths.forEach((file,i)=>assert.deepEqual(fs.readFileSync(path.join(root,file)),before[i]));assert.deepEqual(fs.readdirSync(path.join(root,'workspace/revision/results')),dirs);
 assert.throws(()=>v.requireComplete(p),/incomplete-source-campaign/);
 assert.throws(()=>v.plan({root,fromHash:old.sha256,directories:[more.directory,more.directory]}),/duplicate-completed-site/);
 const loaderFile=path.join(root,'workspace/revision/evaluation/v4/freeze-v4-receipt.json'),savedLoader=fs.readFileSync(loaderFile),loader=JSON.parse(savedLoader);loader.loaderRecordProof.records[0].v4Sha256='bad';loader.loaderRecordProof.records[0].historicalPathSha256='bad';fs.writeFileSync(loaderFile,JSON.stringify(loader));assert.throws(()=>v.plan({root,fromHash:old.sha256}),/loader-record-changed/);fs.writeFileSync(loaderFile,savedLoader);
 fs.appendFileSync(path.join(nested,'carry.json'),' ');assert.throws(()=>v.plan({root,fromHash:old.sha256}),/source-carry-hash/);
 const generator=path.join(root,'backend/agent/loop.cjs');fs.appendFileSync(generator,'\n// changed generator');assert.throws(()=>v.plan({root,fromHash:old.sha256}),/carry-generating-file-changed:backend\/agent\/loop.cjs/);
});

test('v5 freeze archives v4 records and source hashes, binds the full receipt, preserves CRLF and adds one ledger event in an isolated fixture',()=>{
 const ctx=prior(),{root,old}=ctx;ctx.apply();
 const receipt=JSON.parse(fs.readFileSync(ctx.testsReceipt)),file=path.join(root,f.FILE),before=fs.readFileSync(file),ledger=fs.readFileSync(path.join(root,'workspace/revision/ledger.jsonl'));
 receipt.ok=false;fs.writeFileSync(ctx.testsReceipt,JSON.stringify(receipt));assert.throws(()=>v.prepare({...ctx,fromHash:old.sha256}),/full-test-receipt-required/);
 assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readFileSync(path.join(root,'workspace/revision/ledger.jsonl')),ledger);
 receipt.ok=true;fs.writeFileSync(ctx.testsReceipt,JSON.stringify(receipt));
 const record=v.prepare({...ctx,fromHash:old.sha256}),to=f.verify({root});assert.equal(record.toFreezeSha256,to.sha256);assert.equal(record.fromFreezeSha256,old.sha256);
 assert.equal(c.digest(path.join(root,'workspace/revision/freeze/archive/v4/evaluation-freeze.json')),old.sha256);
 assert.equal(c.digest(path.join(root,'workspace/revision/freeze/archive/v4',v.LOCAL)),old.freeze.files[v.LOCAL]);
 assert.deepEqual(record.changedFiles.map(d=>d.file),[v.LOCAL]);assert.equal(record.loaderRecordProof.records.length,200);
 const log=fs.readFileSync(path.join(root,'workspace/revision/freeze/FREEZE-LOG.md'),'utf8');assert.match(log,/Freeze v5/);assert.equal(log.replaceAll('\r\n','').includes('\n'),false);
 assert.equal(h.lines(path.join(root,'workspace/revision/ledger.jsonl')).filter(e=>e.event==='freeze').length,2);
 assert.equal(to.freeze.execution.bootstrapResamples,10000);assert.deepEqual(to.freeze.scoreThresholds,old.freeze.scoreThresholds);assert.deepEqual(to.freeze.settings,old.freeze.settings);
});

test('v5 adoption preserves source output, accounting and prior carry chains, is resumable, and rejects post-plan drift',async()=>{
 const ctx=prior(),{root,old}=ctx;
 const result=await h.runPolicy({root,policy:'P3',siteIds:['eval-01'],runnerFactory:modelFactory,...quiet}),source=fs.readFileSync(path.join(result.directory,'rows.jsonl'));
 ctx.apply();v.prepare({...ctx,fromHash:old.sha256});const to=f.verify({root}),p=v.plan({root,fromHash:old.sha256,to}),ledger=fs.readFileSync(path.join(root,'workspace/revision/ledger.jsonl'));
 const adopted=v.materialize(p,{root,to}),dir=adopted.directories[0],record=JSON.parse(fs.readFileSync(path.join(dir,'carry.json'))),row=h.lines(path.join(dir,'rows.jsonl'))[0];
 assert.equal(record.fromFreezeSha256,old.sha256);assert.equal(record.toFreezeSha256,to.sha256);assert.equal(record.requestsGenerated,0);assert.equal(record.requestsCarried,1);
 assert.equal(record.unchangedFileHashes['backend/agent/loop.cjs'],old.freeze.files['backend/agent/loop.cjs']);assert.equal(row.freezeSha256,to.sha256);assert.equal(row.carryRecordSha256,c.digest(path.join(dir,'carry.json')));
 assert.equal(row.outputSha256,h.lines(path.join(result.directory,'rows.jsonl'))[0].outputSha256);
 const bytes=fs.readFileSync(path.join(dir,'carry.json'));v.materialize(p,{root,to});assert.deepEqual(fs.readFileSync(path.join(dir,'carry.json')),bytes);
 assert.deepEqual(fs.readFileSync(path.join(result.directory,'rows.jsonl')),source);assert.deepEqual(fs.readFileSync(path.join(root,'workspace/revision/ledger.jsonl')),ledger);
 h.json(path.join(root,v.WORK,'carry-index.json'),adopted);assert.ok(v.discover({root}).jobs.get('P3:eval-01').complete);
 fs.appendFileSync(path.join(result.directory,h.lines(path.join(result.directory,'rows.jsonl'))[0].outputFile),'drift');assert.throws(()=>v.materialize(p,{root,to}),/carry-source-output-hash/);
});

function withHarness(stub,other={}){
 const filename=path.resolve(__dirname,'../../../backend/agent/eval-v5.cjs'),mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 const original=mod.require.bind(mod);mod.require=name=>name==='./eval-run.cjs'?{...h,...stub}:Object.hasOwn(other,name)?other[name]:original(name);mod._compile(fs.readFileSync(filename,'utf8'),filename);return mod.exports;
}
test('v5 local generation has a global lock, caps concurrency at four, resumes all completed sites and rejects incomplete score coverage',async()=>{
 const ctx=prior(),{root,old}=ctx;ctx.apply();v.prepare({...ctx,fromHash:old.sha256});
 let active=0,peak=0,calls=0,release;const gate=new Promise(resolve=>release=resolve);
 const workflow=withHarness({async runPolicy({directory,siteIds,policy,runnerFactory}){
  calls++;active++;peak=Math.max(peak,active);runnerFactory(policy,{});
  await gate;await new Promise(resolve=>setTimeout(resolve,2));
  const folder=path.join(directory,'sites',siteIds[0]);fs.mkdirSync(folder,{recursive:true});h.json(path.join(folder,'complete.json'),{policy,siteId:siteIds[0],freezeSha256:JSON.parse(fs.readFileSync(path.join(directory,'run.json'))).freezeSha256});active--;return {stopped:null};
 }});
 const runnerFactory=()=>({close(){}});
 await assert.rejects(workflow.generate({root,policy:'P4-local',concurrency:5,runnerFactory}),/concurrency-limit/);
 await assert.rejects(workflow.generate({root,policy:'P1',runnerFactory}),/generation-policy/);
 await assert.rejects(workflow.generate({root,policy:'P4-local',deadline:NaN,runnerFactory}),/invalid-deadline/);
 const first=workflow.generate({root,policy:'P4-local',concurrency:4,runnerFactory,...quiet});
 try{await assert.rejects(workflow.generate({root,policy:'P4-local',runnerFactory}),/generation-locked/);}finally{release();}
 const result=await first;assert.deepEqual(result.remaining,[]);assert.equal(peak,4);assert.equal(calls,40);
 await workflow.generate({root,policy:'P4-local',concurrency:4,runnerFactory,...quiet});assert.equal(calls,40);
 const context=v.discover({root});assert.throws(()=>v.coverage(context,{includeLocal:true}),/score-incomplete/);
 const all=new Map();for(const policy of h.POLICIES)for(const s of context.verified.manifest.sites){if(policy==='P4-Codex'&&!context.verified.freeze.execution.Codex.siteIds.includes(s.siteId))continue;all.set(policy+':'+s.siteId,{complete:true});}
 const complete={...context,jobs:all};assert.deepEqual(v.coverage(complete,{includeLocal:true}),h.POLICIES);all.delete('P4-local:eval-01');assert.throws(()=>v.coverage(complete,{includeLocal:true}),/P4-local:eval-01/);
});

test('v5 report renders all ten measures using the unchanged v4 formatter with explicit complete local status',()=>{
 const {MEASURES}=require('../eval/stats.cjs');const measures=Object.fromEntries(MEASURES.map(k=>[k,{estimate:1,low:1,high:1,pages:3,sites:1}]));
 const policy={pages:3,measures,accounting:{modelRequests:0,promptTokens:0,completionTokens:0,cachedTokens:0,unknownUsageRequests:0,costEstimate:0,latencyMs:0},failures:0,fallbacks:0,failuresByReason:{},failuresByCategory:{},cleanFailureBreakdown:{combinations:{}}};
 const summary={policies:{'P4-local':policy},comparisons:[]};
 const report={freezeSha256:'fixture',ledger:{pending:0},all:summary,withoutEval38:summary,byCategory:{},policyStatus:{'P4-local':{status:'complete'}},notes:[]};
 const text=v.markdown(report);assert.match(text,/# Frozen evaluation v5/);assert.match(text,/P4-local: complete/);for(const measure of MEASURES)assert.ok(text.includes(measure));
 assert.equal(text.replace('# Frozen evaluation v5','# Frozen evaluation v4'),require('../../../backend/agent/eval-v4.cjs').markdown(report));
});

test('v5 report forwards the entire complete cohort to the unchanged scorer and preserves all v4 report sections (scorer double; no resampling)',()=>{
 const ctx=prior(),{root,old}=ctx;ctx.apply();v.prepare({...ctx,fromHash:old.sha256});const verified=f.verify({root}),rows=[];
 const {MEASURES}=require('../eval/stats.cjs'),measures=Object.fromEntries(MEASURES.map(k=>[k,{estimate:1,low:1,high:1,pages:3,sites:1}]));
 const value={pages:3,measures,accounting:{modelRequests:0,promptTokens:0,completionTokens:0,cachedTokens:0,unknownUsageRequests:0,costEstimate:0,latencyMs:0},failures:0,fallbacks:0,failuresByReason:{},failuresByCategory:{},cleanFailureBreakdown:{combinations:{}}};
 for(const policy of h.POLICIES){
  const ids=policy==='P4-Codex'?verified.freeze.execution.Codex.siteIds:verified.manifest.sites.map(s=>s.siteId),directory=h.newRun(policy,ids,verified,{root});
  for(const siteId of ids){const folder=path.join(directory,'sites',siteId);fs.mkdirSync(folder,{recursive:true});h.json(path.join(folder,'complete.json'),{policy,siteId,freezeSha256:verified.sha256});rows.push({policy,siteId,scores:Object.fromEntries(MEASURES.map(k=>[k,1]))});}
 }
 const summary={policies:Object.fromEntries(h.POLICIES.map(p=>[p,value])),comparisons:[],bySite:{}};let called;
 const workflow=withHarness({}, {'./eval-v4.cjs':{cohort:()=>summary,markdown:require('../../../backend/agent/eval-v4.cjs').markdown},'./eval-score.cjs':{run(options){called=options;fs.mkdirSync(options.outputDirectory,{recursive:true});return {rows,summary:{scoringVersion:verified.freeze.scoringVersion,all:summary,withoutMixedFamily:summary,audited:null,accountingByPolicyAndSite:[],inputs:[]}};}}});
 const result=workflow.report({root,includeLocal:true});assert.equal(called.siteIds.length,40);assert.equal(called.directories.length,h.POLICIES.length);
 assert.equal(result.report.policyStatus['P4-local'].status,'complete');assert.equal(result.report.policyStatus['P4-local'].measuredSites,40);assert.equal(result.report.policyStatus['P4-Codex'].measuredSites,10);
 for(const name of ['all','withoutEval38','audited','byCategory','bySite','accountingByPolicyAndSite','inputs','ledger'])assert.ok(Object.hasOwn(result.report,name));
 assert.ok(result.report.notes.every(n=>!n.includes('pending')));assert.match(fs.readFileSync(path.join(result.directory,'report.md'),'utf8'),/Frozen evaluation v5/);
});
