'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const freeze=require('../../../backend/agent/eval-freeze.cjs'),harness=require('../../../backend/agent/eval-run.cjs');
const {fixture,modelFactory,archiveV5}=require('./evaluation-fixture.cjs');

const read=file=>JSON.parse(fs.readFileSync(file));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));
const v6=()=>fixture({legacy:false});
const quiet={siteIds:['eval-01'],onEvent:()=>{}};

test('v6 binds the settled iteration, prompt, executable bytes and offline receipt',()=>{
 const f=v6(),created=freeze.create(f),{root}=f;
 const {promptHash,gateHash,viewsHash,viewComponents}=read(f.iterationFile);
 assert.equal(created.freeze.schemaVersion,2);
 assert.deepEqual(created.freeze.settings,{...freeze.SETTINGS,check:'output'});
 assert.equal(created.freeze.promptSha256,promptHash);
 assert.deepEqual(created.freeze.settled,{
  file:path.relative(root,f.settledFile).split(path.sep).join('/'),
  iterationFile:path.relative(root,f.iterationFile).split(path.sep).join('/'),
  completionFile:path.relative(root,f.completionFile).split(path.sep).join('/'),
  promptFile:created.freeze.promptFile,promptHash,gateHash,viewsHash,viewComponents
 });
 assert.equal(freeze.verify({root}).sha256,created.sha256);
 assert.throws(()=>freeze.create(f),/freeze-already-exists/);
 for(const [file,reason] of [
  [f.promptFile,/hash-mismatch:.*prompt\.txt/],
  [f.iterationFile,/hash-mismatch:.*iteration\.json/],
  [path.join(root,'extension/procedure-v3.js'),/hash-mismatch:extension\/procedure-v3\.js/],
  [path.join(root,'backend/agent/outline.cjs'),/hash-mismatch:backend\/agent\/outline\.cjs/],
  [path.join(root,'backend/agent/catalog.cjs'),/hash-mismatch:backend\/agent\/catalog\.cjs/],
  [f.testsReceipt,/offline-check-receipt-hash-mismatch/]
 ]){
  const saved=fs.readFileSync(file);
  fs.appendFileSync(file,' ');
  assert.throws(()=>freeze.verify({root}),reason);
  fs.writeFileSync(file,saved);
 }
 const receipt=read(f.testsReceipt);
 receipt.sourceHashes['backend/agent/outline.cjs']='0'.repeat(64);
 write(f.testsReceipt,receipt);
 write(created.file,{...created.freeze,offlineChecks:{...created.freeze.offlineChecks,sha256:freeze.sha(fs.readFileSync(f.testsReceipt))}});
 assert.throws(()=>freeze.verify({root,requireReceipt:false}),/offline-check-source-changed/);
});

test('v6 creation rejects unsettled prompt or source hashes before writing evidence',()=>{
 const f=v6(),{root}=f,state=read(f.iterationFile);
 for(const [file,reason] of [
  [f.promptFile,/settled-prompt-hash-mismatch/],
  [path.join(root,'extension/procedure-v3.js'),/settled-file-hash-mismatch:extension\/procedure-v3\.js/],
  [path.join(root,'backend/agent/outline.cjs'),/settled-file-hash-mismatch:backend\/agent\/outline\.cjs/],
  [path.join(root,'backend/agent/catalog.cjs'),/settled-file-hash-mismatch:backend\/agent\/catalog\.cjs/]
 ]){
  const saved=fs.readFileSync(file);
  fs.appendFileSync(file,' ');
  assert.throws(()=>freeze.create(f),reason);
  fs.writeFileSync(file,saved);
 }
 write(f.iterationFile,{...state,prompt:'changed prompt field'});
 assert.throws(()=>freeze.create(f),/settled-prompt-hash-mismatch/);
 write(f.iterationFile,{...state,viewsHash:'0'.repeat(64)});
 assert.throws(()=>freeze.create(f),/settled-views-hash-mismatch/);
 assert.equal(fs.existsSync(path.join(root,freeze.MANIFEST)),false);
});

test('v6 checks manifest continuity against archived v5 and retains the refused manifest',()=>{
 const before=freeze.create(v6()).manifest,f=v6(),{root}=f;
 before.sites[0].pages[2].heldOut=false;
 archiveV5(root,before);
 assert.throws(()=>freeze.create(f),/v6-manifest-differs:eval-01-p3/);
 assert.equal(fs.existsSync(path.join(root,freeze.FILE)),false);
 assert.equal(fs.existsSync(path.join(root,freeze.MANIFEST)),true);
 assert.throws(()=>freeze.create(f),/evaluation-manifest-already-exists/);
 fs.renameSync(path.join(root,freeze.MANIFEST),path.join(root,'refused-manifest.json'));
 before.sites[0].pages[2].heldOut=true;
 archiveV5(root,before);
 assert.deepEqual(freeze.create(f).manifest,before);
});

test('v6 hashes actual rendered DOM and references at creation and verification',()=>{
 const f=v6(),{root}=f,[page]=read(f.archiveManifest).sites[0].pages;
 const captures=[page.sourceFile,page.referenceFile].map(file=>path.join(root,file));
 const assertCaptureDiffers=verify=>{
  for(const file of captures){
   const bytes=fs.readFileSync(file);
   fs.appendFileSync(file,' ');
   try{assert.throws(verify,/v6-capture-differs:eval-01-p1/);}
   finally{fs.writeFileSync(file,bytes);}
  }
 };
 assertCaptureDiffers(()=>freeze.create(f));
 freeze.create(f);
 assertCaptureDiffers(()=>freeze.verify({root}));
});

test('v6 requires both archive files and binds both hashes',()=>{
 const f=v6(),{root}=f;
 for(const file of [f.archiveManifest,f.archiveFreeze]){
  fs.renameSync(file,file+'.saved');
  try{assert.throws(()=>freeze.create(f),/v6-archive-required/);}
  finally{fs.renameSync(file+'.saved',file);}
 }
 const before=fs.readFileSync(f.archiveManifest);
 fs.appendFileSync(f.archiveManifest,' ');
 assert.throws(()=>freeze.create(f),/v6-archived-manifest-hash-mismatch/);
 fs.writeFileSync(f.archiveManifest,before);
 const {freeze:created}=freeze.create(f);
 for(const file of [f.archiveManifest,f.archiveFreeze]){
  const bytes=fs.readFileSync(file),relative=path.relative(root,file).split(path.sep).join('/');
  assert.equal(created.files[relative],freeze.sha(bytes));
  fs.appendFileSync(file,' ');
  try{assert.throws(()=>freeze.verify({root}),/hash-mismatch:.*archive\/v5/);}
  finally{fs.writeFileSync(file,bytes);}
 }
});

test('v6 rejects URL, site order, and page order changes against v5',()=>{
 for(const [change,reason] of [
  [m=>{m.sites[0].pages[0].url+='?changed';},/v6-manifest-differs:eval-01-p1/],
  [m=>{m.sites[0].pages[0].finalUrl+='?changed';},/v6-manifest-differs:eval-01-p1/],
  [m=>{[m.sites[0],m.sites[1]]=[m.sites[1],m.sites[0]];},/v6-manifest-differs:eval-01/],
  [m=>{const p=m.sites[0].pages;[p[0],p[1]]=[p[1],p[0]];},/v6-manifest-differs:eval-01-p1/]
 ]){
  const f=v6(),archived=read(f.archiveManifest);
  change(archived);archiveV5(f.root,archived);
  assert.throws(()=>freeze.create(f),reason);
 }
});

test('v6 requires an unstopped output completion and a consistent settled pointer',()=>{
 const f=v6(),completion=read(f.completionFile),pointer=read(f.settledFile);
 fs.renameSync(f.completionFile,f.completionFile+'.saved');
 assert.throws(()=>freeze.create(f),/settled-output-completion-required/);
 for(const change of [{check:'gate'},{policy:'P4-off'},{stopped:true},{trials:0},{promptHash:'bad'},{gateHash:'bad'},{siteIds:[]}]){
  write(f.completionFile,{...completion,...change});
  assert.throws(()=>freeze.create(f),/settled-output-completion-required/);
 }
 write(f.completionFile,completion);
 for(const change of [{settled:false},{check:'gate'},{promptHash:'bad'},{gateHash:'bad'},{selectedIteration:3}]){
  write(f.settledFile,{...pointer,...change});
  assert.throws(()=>freeze.create(f),/settled-pointer-mismatch/);
 }
 write(f.settledFile,{...pointer,settled:true,check:'output',selectedIteration:1,siteIds:['dev-02']});
 const {freeze:created}=freeze.create(f);
 assert.equal(created.files[created.settled.completionFile],freeze.sha(fs.readFileSync(f.completionFile)));
 fs.appendFileSync(f.completionFile,' ');
 assert.throws(()=>freeze.verify({root:f.root}),/hash-mismatch:.*P4-on-complete-1\.json/);
});

test('v6 creation and verification require exactly the successful offline commands and test bytes',()=>{
 const f=v6(),{root}=f,receipt=read(f.testsReceipt);
 for(const file of ['tests/revision/agent/helpers.cjs','tests/revision/capture/check-reference.cjs','tests/revision/eval/runner.test.cjs']){
  assert.match(receipt.sourceHashes[file]||'',/^[a-f0-9]{64}$/);
  const target=path.join(root,file),bytes=fs.readFileSync(target);
  fs.appendFileSync(target,' ');
  try{assert.throws(()=>freeze.create(f),/offline-check-source-changed/);}
  finally{fs.writeFileSync(target,bytes);}
 }
 const forged={...receipt,commands:[{args:['--test','elsewhere'],status:0},receipt.commands[1]]};
 for(const commands of [forged.commands,[...receipt.commands].reverse(),[{...receipt.commands[0],status:1},receipt.commands[1]]]){
  write(f.testsReceipt,{...receipt,commands});
  assert.throws(()=>freeze.create(f),/offline-checks-required/);
 }
 write(f.testsReceipt,{...receipt,sourceHashesAfter:{}});
 assert.throws(()=>freeze.create(f),/offline-check-source-changed/);
 write(f.testsReceipt,receipt);
 const created=freeze.create(f);
 const helper=path.join(root,'tests/revision/agent/helpers.cjs'),before=fs.readFileSync(helper);
 fs.appendFileSync(helper,' ');
 assert.throws(()=>freeze.verify({root}),/offline-check-source-changed/);
 fs.writeFileSync(helper,before);
 write(f.testsReceipt,forged);
 write(created.file,{...created.freeze,offlineChecks:{...created.freeze.offlineChecks,sha256:freeze.sha(fs.readFileSync(f.testsReceipt))}});
 assert.throws(()=>freeze.verify({root,requireReceipt:false}),/offline-checks-required/);
});

test('offline check records the commands it ran and fails a receipt on source drift',()=>{
 const f=v6(),{root}=f,source=path.join(root,'tests/revision/agent/helpers.cjs'),before=freeze.sha(fs.readFileSync(source));
 const commands=[],Module=require('node:module'),filename=require.resolve('../../../backend/agent/eval-run.cjs'),mod=new Module(filename,module);
 mod.filename=filename;mod.paths=module.paths;
 const load=mod.require.bind(mod);
 mod.require=name=>name==='node:child_process'?{spawnSync(executable,args,{cwd}){
  assert.equal(executable,process.execPath);assert.equal(cwd,root);commands.push(args.slice());
  if(commands.length===1)fs.appendFileSync(source,'changed during checks');
  return {status:0};
 }}:load(name);
 mod._compile(fs.readFileSync(filename,'utf8'),filename);
 const receipt=read(mod.exports.offlineChecks({root})),file='tests/revision/agent/helpers.cjs';
 assert.deepEqual(receipt.commands.map(r=>r.args),commands);
 assert.deepEqual(receipt.commands.map(r=>r.status),[0,0]);
 assert.equal(receipt.ok,false);
 assert.equal(receipt.sourceHashes[file],before);
 assert.equal(receipt.sourceHashesAfter[file],freeze.sha(fs.readFileSync(source)));
});

test('v6 serializes generation and refuses source and carried resumes',async()=>{
 const f=v6(),{root}=f,verified=freeze.create(f),options={root,policy:'P4-on',...quiet};
 const lock=path.join(root,'workspace/revision/evaluation/v6/generation.lock');
 fs.mkdirSync(path.dirname(lock),{recursive:true});
 write(lock,{pid:process.pid});
 await assert.rejects(harness.runPolicy(options),/v6-generation-locked/);
 assert.ok(fs.readdirSync(path.join(root,'workspace/revision/results')).every(name=>!name.startsWith('eval-')));
 fs.renameSync(lock,lock+'.fixture');
 await assert.rejects(harness.runPolicy({...options,sourceDirectory:'old-run'}),/v6-source-or-carry-refused/);
 await assert.rejects(harness.runPolicy({...options,policy:'P2-nr-fresh'}),/v6-source-or-carry-refused/);
 const directory=harness.newRun(options.policy,options.siteIds,verified,{root});
 write(path.join(directory,'carry.json'),{fromFreezeSha256:'prior'});
 await assert.rejects(harness.runPolicy({...options,directory}),/v6-source-or-carry-refused/);
 assert.equal(fs.existsSync(lock),false);
 assert.equal(fs.readdirSync(path.join(path.dirname(lock),'lock-receipts')).length,1);
});

test('v6 P4 induction and held-out use-time accept thin output with advice and P3 records output mode',async()=>{
 const f=v6(),{root}=f,verified=freeze.create(f);
 const lock=path.join(root,'workspace/revision/evaluation/v6/generation.lock');
 const runnerFactory=(policy,ledger)=>{
  const runner=modelFactory(policy,ledger),generate=runner.generate.bind(runner);
  runner.generate=async messages=>{
   assert.equal(read(lock).policy,policy);
   assert.equal(freeze.sha(messages[0].content),verified.freeze.settled.promptHash);
   const generated=await generate(messages),{action,rule}=JSON.parse(generated.content);
   rule.regions=[{role:'title',selector:'h1',multiple:false,required:true}];
   return {...generated,content:JSON.stringify({action,rule})};
  };
  return runner;
 };
 for(const policy of ['P4-on','P3']){
  const result=await harness.runPolicy({root,policy,runnerFactory,...quiet});
  assert.equal(result.stopped,null);
  const trial=read(path.join(result.directory,'sites/eval-01/trial.json'));
  assert.equal(trial.check,'output');
  assert.equal(trial.accepted,true);
  assert.ok(trial.gate.advisory.includes('p1:G3:unique-coverage'));
  const rows=harness.lines(path.join(result.directory,'rows.jsonl'));
  assert.equal(rows.length,policy==='P3'?1:3);
  assert.ok(rows.every(row=>row.check==='output'&&row.ok&&!row.fallback));
  assert.ok(rows.every(row=>row.advisory.includes('use-time:substantive-coverage')));
  if(policy==='P3')assert.ok(rows[0].advisory.includes('G3:unique-coverage'));
 }
 assert.equal(fs.existsSync(lock),false);
});

test('v6 P3 output declines a rule that violates its anchor on the delivered page',async()=>{
 const {root,...options}=v6();freeze.create({root,...options});
 const result=await harness.runPolicy({root,policy:'P3',...quiet,runnerFactory:(policy,ledger)=>{
  const runner=modelFactory(policy,ledger),generate=runner.generate.bind(runner);
  runner.generate=async messages=>{
   const generated=await generate(messages),action=JSON.parse(generated.content);
   action.rule.applicability.anchors[0].min=action.rule.applicability.anchors[0].max=2;
   return {...generated,content:JSON.stringify(action)};
  };
  return runner;
 }});
 assert.equal(read(path.join(result.directory,'sites/eval-01/trial.json')).accepted,true);
 const [row]=harness.lines(path.join(result.directory,'rows.jsonl'));
 assert.equal(row.ok,false);assert.equal(row.fallback,true);
 assert.match(row.reason,/applicability:anchor-count:main\.reading/);
});

test('v6 archives a partially written run lock and resumes the same run',async t=>{
 const f=v6(),{root}=f,verified=freeze.create(f),policy='P0';
 const directory=harness.newRun(policy,quiet.siteIds,verified,{root});
 const owner=path.join(directory,'run.lock'),open=fs.openSync,writeSync=fs.writeSync;
 let lock;
 const openMock=t.mock.method(fs,'openSync',function(file,...args){
  const fd=open(file,...args);if(file===owner)lock=fd;return fd;
 });
 const writeMock=t.mock.method(fs,'writeSync',function(fd,...args){
  if(fd===lock){writeSync(fd,'{');throw Error('fixture-lock-write-failed');}
  return writeSync(fd,...args);
 });
 const options={root,policy,directory,...quiet};
 await assert.rejects(harness.runPolicy(options),/fixture-lock-write-failed/);
 writeMock.mock.restore();openMock.mock.restore();
 assert.throws(()=>fs.fstatSync(lock),{code:'EBADF'});
 assert.equal(fs.existsSync(owner),false);
 const archive=path.join(directory,'lock-receipts');
 assert.equal(fs.readFileSync(path.join(archive,fs.readdirSync(archive)[0]),'utf8'),'{');
 assert.equal((await harness.runPolicy(options)).stopped,null);
});

test('v6 P0 generation uses a freeze-specific cache and writes fresh baseline rows',async()=>{
 const f=v6(),{root}=f,verified=freeze.create(f);
 const result=await harness.runPolicy({root,policy:'P0',...quiet});
 assert.ok(harness.lines(path.join(result.directory,'rows.jsonl')).every(row=>row.ok&&row.freezeSha256===verified.sha256));
 const evaluation=path.join(root,'workspace/revision/evaluation');
 assert.equal(fs.existsSync(path.join(evaluation,'baseline-cache')),false);
 assert.equal(fs.readdirSync(path.join(evaluation,'v6/baseline-cache',verified.sha256,'P0')).length,3);
});
