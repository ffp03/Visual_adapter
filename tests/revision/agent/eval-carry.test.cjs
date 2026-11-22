'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const f=require('../../../backend/agent/eval-freeze.cjs'),h=require('../../../backend/agent/eval-run.cjs'),c=require('../../../backend/agent/eval-carry.cjs');
const workflow=require('../../../backend/agent/eval-v4.cjs'),{sealed,modelFactory}=require('./evaluation-fixture.cjs');
function snapshot(root){
 const old=f.verify({root}),archive=path.join(root,'workspace/revision/freeze/archive/v3');
 for(const file of f.sourceFiles(root)){const to=path.join(archive,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to,fs.constants.COPYFILE_EXCL);}
 const registry=c.boundRegistry(root,old),recordHashes=old.manifest.sites.flatMap(s=>s.pages.map(p=>{const record=registry.resolve(p.id,'eval');return {id:p.id,sha256:f.sha(JSON.stringify({...record,file:'C:\\Dev\\Visual_adapter\\'+c.relative(root,record.file).replaceAll('/','\\')}))};}));
 const file=path.join(root,'workspace/revision/evaluation/v4/before.json');fs.mkdirSync(path.dirname(file),{recursive:true});h.json(file,{freezeSha256:old.sha256,sourceFiles:f.sourceFiles(root),recordHashes});
 return old;
}
function refreeze(fixture){
 const root=fixture.root,archive=path.join(root,'workspace/revision/freeze/archive/v3');
 for(const file of [f.FILE,f.MANIFEST])fs.renameSync(path.join(root,file),path.join(archive,path.basename(file)));
 fs.appendFileSync(path.join(root,'backend/agent/eval-score.cjs'),'\n// fixture orchestration change');
 const receipt=JSON.parse(fs.readFileSync(fixture.testsReceipt));receipt.sourceHashes=Object.fromEntries(f.sourceFiles(root).map(file=>[file,c.digest(path.join(root,file))]));fs.writeFileSync(fixture.testsReceipt,JSON.stringify(receipt));return f.create(fixture);
}
test('carry dry-run verifies all historical loader records and completed rows without writing; changed generators, duplicate sites and output drift stop',async()=>{
 const fixture=sealed(),root=fixture.root;
 const result=await h.runPolicy({root,policy:'P0',siteIds:['eval-01'],onEvent:()=>{}}),old=snapshot(root);
 const beforeLedger=fs.readFileSync(path.join(root,'workspace/revision/ledger.jsonl')),beforeFreeze=fs.readFileSync(path.join(root,f.FILE)),beforeDirs=fs.readdirSync(path.join(root,'workspace/revision/results'));
 const plan=c.plan({root,fromHash:old.sha256});assert.equal(plan.summary.totalRows,3);assert.equal(plan.summary.policies.P0.sites,1);assert.equal(plan.summary.policies['P4-local'],undefined);assert.equal(plan.summary.loaderRecordProof.records.length,200);
 assert.ok(plan.summary.loaderRecordProof.records.every(r=>r.v3Sha256===r.historicalPathSha256));
 assert.deepEqual(fs.readFileSync(path.join(root,'workspace/revision/ledger.jsonl')),beforeLedger);assert.deepEqual(fs.readFileSync(path.join(root,f.FILE)),beforeFreeze);assert.deepEqual(fs.readdirSync(path.join(root,'workspace/revision/results')),beforeDirs);
 const gen=path.join(root,'backend/agent/loop.cjs'),genBytes=fs.readFileSync(gen);fs.appendFileSync(gen,'\n// changed');assert.throws(()=>c.plan({root,fromHash:old.sha256}),/carry-generating-file-changed:backend\/agent\/loop.cjs/);fs.writeFileSync(gen,genBytes);
 assert.throws(()=>c.plan({root,fromHash:old.sha256,directories:[result.directory,result.directory]}),/duplicate-completed-site/);
 const row=h.lines(path.join(result.directory,'rows.jsonl'))[0];fs.appendFileSync(path.join(result.directory,row.outputFile),'changed');assert.throws(()=>c.plan({root,fromHash:old.sha256}),/carry-source-output-hash/);
});
test('carry records bind both freezes, unchanged dependencies, loader proof and ledger accounting; adoption resumes without rewriting originals',async()=>{
 const fixture=sealed(),root=fixture.root;
 const result=await h.runPolicy({root,policy:'P3',siteIds:['eval-01'],runnerFactory:modelFactory,onEvent:()=>{}}),old=snapshot(root),sourceRows=fs.readFileSync(path.join(result.directory,'rows.jsonl')),to=refreeze(fixture);
 const plan=c.plan({root,fromHash:old.sha256,to}),outputDirectory=path.join(root,'workspace/revision/results/eval-v4-carry-test'),ledgerBytes=fs.readFileSync(path.join(root,'workspace/revision/ledger.jsonl'));
 const adopted=c.materialize(plan,{root,to,outputDirectory});assert.equal(adopted.directories.length,1);
 const dir=adopted.directories[0],carry=JSON.parse(fs.readFileSync(path.join(dir,'carry.json'))),row=h.lines(path.join(dir,'rows.jsonl'))[0];
 assert.equal(carry.fromFreezeSha256,old.sha256);assert.equal(carry.toFreezeSha256,to.sha256);assert.equal(carry.requestsGenerated,0);assert.equal(carry.requestsCarried,1);assert.equal(carry.unchangedFileHashes['backend/agent/loop.cjs'],old.freeze.files['backend/agent/loop.cjs']);assert.equal(row.freezeSha256,to.sha256);
 assert.equal(row.carryRecordSha256,c.digest(path.join(dir,'carry.json')));assert.equal(row.outputSha256,h.lines(path.join(result.directory,'rows.jsonl'))[0].outputSha256);
 const bytes=fs.readFileSync(path.join(dir,'carry.json'));c.materialize(plan,{root,to,outputDirectory});assert.deepEqual(fs.readFileSync(path.join(dir,'carry.json')),bytes);assert.deepEqual(fs.readFileSync(path.join(result.directory,'rows.jsonl')),sourceRows);assert.deepEqual(fs.readFileSync(path.join(root,'workspace/revision/ledger.jsonl')),ledgerBytes);
 const score=require('../../../backend/agent/eval-score.cjs').run({root,siteIds:['eval-01'],directories:[dir]});assert.equal(score.rows.length,1);assert.equal(score.summary.all.policies.P3.accounting.modelRequests,1);
});
test('coordinator generation resumes finished sites, serializes Codex, enforces the local cap, and refuses incomplete final coverage',async()=>{
 const fixture=sealed(),root=fixture.root;
 // Two finished P1 sites suffice to prove the pre-existing completions are skipped.
 await h.runPolicy({root,policy:'P1',siteIds:['eval-01','eval-02'],onEvent:()=>{}});
 const ctx=workflow.discover({root});assert.ok(ctx.jobs.get('P1:eval-01').complete);
 assert.throws(()=>workflow.coverage(ctx),/v4-score-incomplete/);
 await assert.rejects(workflow.generate({root,policy:'P4-Codex',concurrency:2}),/concurrency-limit/);
 await assert.rejects(workflow.generate({root,policy:'P4-local',concurrency:5}),/concurrency-limit/);
 await assert.rejects(workflow.generate({root,policy:'P1',deadline:NaN}),/invalid-deadline/);
 await assert.rejects(workflow.generate({root,policy:'P4-Codex',runnerFactory:()=>{throw Error('must-not-request');}}),/sample-carry-required/);
 // Restrict the test manifest supplied to discovery's generation dependency via
 // the existing deadline: no remaining site may start and finished bytes stay fixed.
 const before=fs.readFileSync(path.join(ctx.jobs.get('P1:eval-01').directory,'rows.jsonl'));
 await assert.rejects(workflow.generate({root,policy:'P1',deadline:Date.now()-1}),/evaluation-deadline/);
 assert.deepEqual(fs.readFileSync(path.join(ctx.jobs.get('P1:eval-01').directory,'rows.jsonl')),before);
});

test('freeze tooling refuses an invalid full receipt before archiving and records both source/record paths and the split on a fixture',()=>{
 const fixture=sealed(),root=fixture.root;fs.mkdirSync(path.join(root,'workspace/revision/results'),{recursive:true});
 const old=snapshot(root),log=path.join(root,'workspace/revision/freeze/FREEZE-LOG.md');fs.writeFileSync(log,'# Existing freeze log\r\n');
 const receipt=JSON.parse(fs.readFileSync(fixture.testsReceipt)),before=fs.readFileSync(path.join(root,f.FILE)),ledgerBefore=fs.readFileSync(path.join(root,'workspace/revision/ledger.jsonl'));
 receipt.ok=false;fs.writeFileSync(fixture.testsReceipt,JSON.stringify(receipt));assert.throws(()=>workflow.prepare({root,fromHash:old.sha256,testsReceipt:fixture.testsReceipt}),/full-test-receipt-required/);
 assert.deepEqual(fs.readFileSync(path.join(root,f.FILE)),before);assert.deepEqual(fs.readFileSync(path.join(root,'workspace/revision/ledger.jsonl')),ledgerBefore);
 receipt.ok=true;fs.writeFileSync(fixture.testsReceipt,JSON.stringify(receipt));
 const result=workflow.prepare({root,fromHash:old.sha256,testsReceipt:fixture.testsReceipt}),current=f.verify({root});assert.equal(result.toFreezeSha256,current.sha256);assert.notEqual(current.sha256,old.sha256);
 assert.equal(c.digest(path.join(root,'workspace/revision/freeze/archive/v3/evaluation-freeze.json')),old.sha256);assert.equal(result.loaderRecordProof.records.length,200);assert.ok(result.sourceArchives.every(m=>m.oldPath&&m.newPath&&m.sha256));
 const text=fs.readFileSync(log,'utf8');assert.match(text,/P1 split/);assert.equal(text.replaceAll('\r\n','').includes('\n'),false);
 const freezes=h.lines(path.join(root,'workspace/revision/ledger.jsonl')).filter(e=>e.event==='freeze');assert.equal(freezes.length,2);assert.equal(freezes[1].freezeSha256,current.sha256);
});

test('final report formatting includes all requested pairs and explicit pending local status without a local failure row',()=>{
 const {MEASURES}=require('../eval/stats.cjs'),{SCORING_VERSION}=require('../eval/score.cjs');
 const policies=['P0','P1','P2-fresh','P2-shared','P3','P4-on','P4-off','P4-Codex'];
 const rows=policies.map(policy=>({id:'eval-01-p3',site:'fixture.test',policy,ok:true,fallback:false,sourceSha256:'source',referenceSha256:'reference',scoringVersion:SCORING_VERSION,scores:Object.fromEntries(MEASURES.map(k=>[k,1]))}));
 const summary=workflow.cohort(rows,[]);assert.equal(summary.comparisons.length,9);assert.ok(!summary.policies['P4-local']);
 const text=workflow.markdown({freezeSha256:'fixture',ledger:{pending:0},all:summary,withoutEval38:summary,byCategory:{Fixture:summary},policyStatus:{'P4-local':{status:'pending (not run under v4)'}},notes:[]});
 assert.match(text,/P4-local: pending/);assert.match(text,/P4-off minus P4-on/);assert.match(text,/P4-Codex minus P4-on/);for(const m of MEASURES)assert.ok(text.includes(m));
});
