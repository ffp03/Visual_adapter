'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const freeze=require('../../../backend/agent/eval-freeze.cjs');
const {PageRegistry}=require('../../../backend/agent/pages.cjs');
const harness=require('../../../backend/agent/eval-run.cjs'),scoring=require('../../../backend/agent/eval-score.cjs');
const {Ledger}=require('../../../backend/agent/ledger.cjs');
const ROOT=path.resolve(__dirname,'../../..');
const {fixture,sealed,modelFactory,historicalVerify}=require('./evaluation-fixture.cjs');
test('evaluation refuses a missing, malformed, changed or unreceipted freeze; matching freeze loads only canonical eval sources',()=>{
 const f=fixture(),registry=new PageRegistry({root:f.root});assert.throws(()=>registry.resolve('eval-01-p3','eval'),/evaluation-freeze-required:missing/);
 const valid=freeze.create(f);assert.equal(valid.freeze.schemaVersion,1);assert.equal(valid.freeze.settings.turns,6);assert.equal(valid.freeze.promptSha256,freeze.sha(fs.readFileSync(f.promptFile)));
 assert.throws(()=>historicalVerify({root:f.root}),/evaluation-freeze-required:prompt-mismatch/);
 assert.equal(registry.resolve('eval-01-p3','eval').site,'fixture1.test');
 const l=new Ledger({root:f.root});assert.equal(l.totals().requests,0);assert.equal(l.totals().pending,0);
 const core=path.join(f.root,'extension/procedure-core.js');fs.appendFileSync(core,'\n// changed');
 assert.throws(()=>registry.load('eval-01-p3','eval'),/hash-mismatch:extension\/procedure-core.js/);
 const malformed=fixture();fs.mkdirSync(path.join(malformed.root,'workspace/revision/freeze'),{recursive:true});fs.writeFileSync(path.join(malformed.root,freeze.FILE),'{');
 assert.throws(()=>new PageRegistry({root:malformed.root}).resolve('eval-01-p3','eval'),/invalid-json/);
 const noReceipt=sealed();fs.renameSync(path.join(noReceipt.root,'workspace/revision/ledger.jsonl'),path.join(noReceipt.root,'ledger.archived.jsonl'));fs.writeFileSync(path.join(noReceipt.root,'workspace/revision/ledger.jsonl'),'');
 assert.throws(()=>freeze.verify({root:noReceipt.root}),/missing-ledger-receipt/);
});
test('evaluation guard refuses cross-site and held-out induction; settings/source checks bind creation to offline tests',async()=>{
 const f=sealed(),l=new harness.EvaluationLedger({root:f.root,siteId:'eval-01',policy:'P4-on',experiment:'fixture'}),r=modelFactory('P4-on',l);
 assert.throws(()=>l.registry.resolve('eval-02-p3'),/cross-site-read-refused/);
 await assert.rejects(l.run(r,[],{pageIds:['eval-01-p3']}),/induction-scope/);assert.equal(r.calls,0);
 const changed=fixture();fs.appendFileSync(path.join(changed.root,'backend/agent/eval-run.cjs'),'\n// change');assert.throws(()=>freeze.create(changed),/offline-check-source-changed/);
});
test('all evaluation policies write compatible rows, P2-nr replays free, finished sites never rerun, P3 has only p3',async()=>{
 const f=sealed(),dirs={},calls={};
 for(const policy of harness.POLICIES){
  const result=await harness.runPolicy({root:f.root,policy,siteIds:['eval-01'],sourceDirectory:policy==='P2-nr-fresh'?dirs['P2-fresh']:policy==='P2-nr-shared'?dirs['P2-shared']:undefined,
   runnerFactory:(p,l)=>{const r=modelFactory(p,l);calls[p]=r;return r;},onEvent:()=>{}});
  assert.equal(result.stopped,null,policy);dirs[policy]=result.directory;
  const rows=harness.lines(path.join(result.directory,'rows.jsonl'));assert.equal(rows.length,policy==='P3'?1:policy.endsWith('shared')?4:3,policy);
  assert.ok(rows.every(r=>r.policy===policy&&r.ok),policy+JSON.stringify(rows.map(r=>r.reason)));
  if(policy==='P1')for(const row of rows){const page=new PageRegistry({root:f.root}).resolve(row.id,'eval');assert.equal(fs.readFileSync(path.join(result.directory,row.outputFile),'utf8'),require('../eval/policies/p1-reader-view.cjs').run(page).html);}
  assert.throws(()=>harness.newRun(policy,['eval-01'],freeze.verify({root:f.root}),{root:f.root}),/existing-site-use-resume/);
  const expectedRequests=policy.startsWith('P2-nr')||['P0','P1'].includes(policy)?0:policy==='P2-fresh'?3:1;
  assert.equal(rows.reduce((s,r)=>s+r.modelRequests,0),expectedRequests,policy+' accounting');
  assert.equal(new Set(rows.flatMap(r=>r.requestIds)).size,rows.flatMap(r=>r.requestIds).length,policy+' request IDs charged once');
  const before=fs.readFileSync(path.join(result.directory,'rows.jsonl'),'utf8');
  await harness.runPolicy({root:f.root,policy,siteIds:['eval-01'],directory:result.directory,runnerFactory:()=>{throw Error('finished-site-reran');},onEvent:()=>{}});
  assert.equal(fs.readFileSync(path.join(result.directory,'rows.jsonl'),'utf8'),before);
 }
 assert.equal(calls['P2-fresh'].calls,3);assert.equal(calls['P2-shared'].calls,1);assert.equal(calls['P3'].calls,1);
 assert.equal(harness.lines(path.join(dirs['P2-nr-fresh'],'rows.jsonl')).reduce((s,r)=>s+r.modelRequests,0),0);
 const result=scoring.run({root:f.root,siteIds:['eval-01'],directories:Object.values(dirs)});
 assert.equal(result.rows.length,37);assert.equal(result.summary.all.policies.P3.pages,1);assert.equal(result.summary.all.comparisons.find(c=>c.policyB==='P3').measures.cleanPass.pages,1);
 assert.equal(result.summary.all.resamples,10000);assert.ok(!result.summary.all.policies.P3.failuresByReason['missing-policy-row']);
 assert.equal(result.summary.all.policies['P2-shared'].accounting.modelRequests,1);
 assert.equal(result.summary.all.policies['P2-shared'].accounting.promptTokens,100);
 assert.ok(result.summary.all.policies['P2-shared'].accounting.costEstimate>0);
 assert.equal(result.summary.all.bySite['fixture1.test'].policies['P2-shared'].accounting.modelRequests,1);
 assert.equal(result.summary.all.policies['P4-on'].accounting.modelRequests,1);
 assert.equal(result.summary.all.comparisons.length,9);
 assert.ok(result.summary.all.comparisons.some(c=>c.policyA==='P4-off'&&c.policyB==='P4-on'));
 const codexDifference=result.summary.all.comparisons.find(c=>c.policyA==='P4-Codex'&&c.policyB==='P4-on');assert.equal(codexDifference.measures.cleanPass.pages,3);assert.equal(codexDifference.cohort,'frozen-Codex-sites');
 const applicability=await require('../../../backend/agent/eval-applicability.cjs').run({root:f.root,sourceDirectory:dirs['P4-on'],siteIds:['eval-01']});
 assert.equal(applicability.summary.declined,1);assert.equal(applicability.summary.modelRequests,0);assert.equal(applicability.summary.rows[0].fallback,true);
 const candidates=path.join(dirs['P2-fresh'],'sites/eval-01/candidates.json');fs.appendFileSync(candidates,' ');
 const replayRoot=path.join(f.root,'workspace/revision/results', 'eval-P2-nr-fresh-tamper');
 fs.mkdirSync(path.join(replayRoot,'sites'),{recursive:true});
 harness.json(path.join(replayRoot,'run.json'),{schemaVersion:1,policy:'P2-nr-fresh',siteIds:['eval-01'],freezeSha256:freeze.verify({root:f.root}).sha256,experiment:'tamper-fixture'});
 const rejected=await harness.runPolicy({root:f.root,policy:'P2-nr-fresh',siteIds:['eval-01'],directory:replayRoot,sourceDirectory:dirs['P2-fresh'],onEvent:()=>{}});
 assert.match(rejected.stopped,/candidate-hash-mismatch/);
 assert.equal(new Ledger({root:f.root}).totals().pending,0);
});
test('interrupted sites fail unfinished outputs, reconcile reserved requests, and never repeat model calls',async()=>{
 const f=sealed(),verified=freeze.verify({root:f.root}),directory=harness.newRun('P4-on',['eval-01'],verified,{root:f.root});
 const siteDir=path.join(directory,'sites/eval-01');fs.mkdirSync(siteDir);harness.json(path.join(siteDir,'start.json'),{startedAt:new Date().toISOString()});
 const config=JSON.parse(fs.readFileSync(path.join(directory,'run.json'))),l=new harness.EvaluationLedger({root:f.root,siteId:'eval-01',policy:'P4-on',experiment:config.experiment});
 l.append({id:'interrupted-fixture',event:'request',paid:true,policy:'eval',site:'fixture1.test',experiment:config.experiment,outcome:'started',reservedCost:.01});
 await harness.runPolicy({root:f.root,policy:'P4-on',siteIds:['eval-01'],directory,runnerFactory:()=>{throw Error('must-not-request');},onEvent:()=>{}});
 assert.equal(l.totals().pending,0);assert.equal(l.totals().paidRequests,1);assert.equal(l.totals().dollars,.01);
 const rows=harness.lines(path.join(directory,'rows.jsonl'));assert.equal(rows.length,3);assert.ok(rows.every(r=>!r.ok&&r.fallback&&r.reason==='interrupted-site-not-retried'));assert.equal(rows.reduce((s,r)=>s+r.modelRequests,0),1);
 assert.equal(JSON.parse(fs.readFileSync(path.join(siteDir,'complete.json'))).resumed,true);
});
test('applicability pairs are seeded, cover all 40 sites once, and never self-pair',()=>{
 const {pairs}=require('../../../backend/agent/eval-applicability.cjs'),sites=Array.from({length:40},(_,i)=>({siteId:'eval-'+String(i+1).padStart(2,'0')})),p=pairs(sites);
 assert.deepEqual(p,pairs([...sites].reverse()));assert.equal(new Set(p.map(x=>x.targetSiteId)).size,40);assert.ok(p.every(x=>x.sourceSiteId!==x.targetSiteId&&x.targetPage===x.targetSiteId+'-p3'));
});

test('Readability wrapper renders title and byline, avoids a normalized duplicate and escapes metadata',()=>{
 const {createDOM}=require('../eval/dom.cjs'),{formatArticle,run}=require('../eval/policies/p1-readability.cjs');
 const dom=createDOM('<p>fixture</p>'),doc=dom.window.document;
 try{
  const title=formatArticle({title:'Reading title',content:'<p>Body</p>'},doc);assert.equal(title,'<h1>Reading title</h1><p>Body</p>');
  assert.equal(formatArticle({title:'T',byline:'Author',content:'<p>Body</p>'},doc),'<h1>T</h1><p>Author</p><p>Body</p>');
  const duplicate=formatArticle({title:'Full Width Ｔitle',byline:'Author',content:'<h2> Full   Width Title </h2><p>Body</p>'},doc);
  assert.doesNotMatch(duplicate,/<h1>/);assert.match(duplicate,/^<p>Author<\/p><h2>/);
  const escaped=formatArticle({title:'<img src=x onerror="bad"> & title',byline:'<script>bad()</script> & author',content:'<p>Body</p>'},doc);
  const root=doc.createElement('div');root.innerHTML=escaped;assert.equal(root.querySelectorAll('img,script').length,0);assert.equal(root.querySelector('h1').textContent,'<img src=x onerror="bad"> & title');assert.equal(root.querySelector('p').textContent,'<script>bad()</script> & author');
  const integrated=run('<html><head><title>Metadata title</title><meta name="author" content="Metadata Author"></head><body><article><h1>Metadata title</h1><p>'+('Substantive prose for an article. '.repeat(40))+'</p></article></body></html>');
  assert.equal(integrated.ok,true);assert.match(integrated.html,/^<h1>Metadata title<\/h1><p>Metadata Author<\/p>/);
 }finally{dom.window.close();}
});

test('host binding removes exactly one leading www in both loader paths; other hosts and subdomains remain refused',()=>{
 const {sameHostname}=require('../../../backend/agent/pages.cjs');
 for(const [a,b,accepted]of [['example.test','www.example.test',true],['www.example.test','example.test',true],['www.www.example.test','example.test',false],['docs.example.test','example.test',false],['example.test','other.test',false]])assert.equal(sameHostname(a,b),accepted);
 const f=fixture(),manifestFile=path.join(f.root,'workspace/revision/corpus/manifest.json'),m=JSON.parse(fs.readFileSync(manifestFile));
 for(const p of m.sites[0].pages)p.finalUrl=p.url.replace('fixture1.test','www.fixture1.test');
 m.sites[1].host='www.fixture2.test';
 m.sites[2].pages[0].finalUrl=m.sites[2].pages[0].url.replace('fixture3.test','docs.fixture3.test');
 m.sites[3].pages[0].finalUrl='https://other.test/foreign';fs.writeFileSync(manifestFile,JSON.stringify(m));freeze.create(f);
 const registry=new PageRegistry({root:f.root});assert.equal(registry.resolve('eval-01-p3','eval').site,'fixture1.test');assert.equal(registry.resolve('eval-02-p3','eval').site,'www.fixture2.test');
 assert.throws(()=>registry.resolve('eval-03-p1','eval'),/evaluation-page-left-host/);assert.throws(()=>registry.resolve('eval-04-p1','eval'),/evaluation-page-left-host/);
 const dev={split:'dev',sites:[{siteId:'dev-fixture',host:'fixture.test',pages:[]}]};
 const html='<main>Development</main>',folder=path.join(f.root,'workspace/revision/corpus/dev/dev-fixture/dev-fixture-p1');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'rendered-dom.html'),html);
 const page={pageId:'dev-fixture-p1',url:'https://www.fixture.test/page',sha256:freeze.sha(html)};dev.sites[0].pages=[page];const devFile=path.join(f.root,'workspace/revision/corpus/dev-manifest.json');fs.writeFileSync(devFile,JSON.stringify(dev));assert.equal(registry.resolve(page.pageId).site,'fixture.test');
 dev.sites[0].host='www.fixture.test';page.url='https://fixture.test/page';fs.writeFileSync(devFile,JSON.stringify(dev));assert.equal(registry.resolve(page.pageId).site,'www.fixture.test');
 page.url='https://docs.fixture.test/page';fs.writeFileSync(devFile,JSON.stringify(dev));assert.throws(()=>registry.resolve(page.pageId),/development-page-left-host/);
});

test('v3 applicability, use-time selection and family lookup share the one-www host rule',()=>{
 const {JSDOM}=require('jsdom'),v3=require('../../../extension/procedure-v3.js'),{Families}=require('../../../backend/agent/families.cjs');
 const html='<main class="reading"><h1>Title</h1><p>'+('Substantive reading content. '.repeat(20))+'</p></main>';
 const base={schemaVersion:3,name:'Fixture',applicability:{hostname:'fixture.test',anchors:[{selector:'main.reading',min:1,max:1}]},regions:[{role:'body',selector:'main.reading',multiple:false,required:true}],exclude:[],reveal:[],provenance:{model:'fixture',inductionPages:2,createdAt:'2026-11-21T00:00:00Z'}};
 for(const [hostname,bound,accepted]of [['www.fixture.test','fixture.test',true],['fixture.test','www.fixture.test',true],['docs.fixture.test','fixture.test',false],['other.test','fixture.test',false],['www.www.fixture.test','fixture.test',false]]){
  const dom=new JSDOM(html,{url:'https://'+hostname+'/page'}),rule=JSON.parse(JSON.stringify(base));rule.applicability.hostname=bound;
  try{assert.equal(v3.validate(rule,dom.window.document).accepted,accepted);assert.equal(v3.useTime(dom.window.document,rule).accepted,accepted);const families=new Families();families.add(rule,{accepted:true});assert.equal(families.select(dom.window.document).accepted,accepted);}finally{dom.window.close();}
 }
});

test('six same-process guarded requests reserve atomically and never overrun a lowered paid cap',async()=>{
 const f=sealed(),l=new harness.EvaluationLedger({root:f.root,siteId:'eval-01',policy:'P4-on',experiment:'concurrency-fixture'});l.limits.requests=3;
 let calls=0,active=0,peak=0;const runner={provider:'deepseek',model:'fixture',payload:messages=>({model:'fixture',messages,max_tokens:10}),async generate(){calls++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,20));active--;return {content:'{}',usage:{prompt_tokens:5,completion_tokens:2,prompt_cache_hit_tokens:0}};}};
 const results=await Promise.allSettled(Array.from({length:6},()=>l.run(runner,[{role:'system',content:'Fixture'}],{pageIds:['eval-01-p1']})));
 assert.equal(calls,3);assert.equal(peak,3);assert.equal(results.filter(r=>r.status==='fulfilled').length,3);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.name==='BudgetError').length,3);assert.equal(l.totals().paidRequests,3);assert.equal(l.totals().pending,0);
});

test('score coverage spans carry and site directories, permits declared Codex subset, and rejects missing or duplicate pairs',async()=>{
 const f=sealed(),dirs=[];
 for(const siteId of ['eval-01','eval-02'])dirs.push((await harness.runPolicy({root:f.root,policy:'P0',siteIds:[siteId],onEvent:()=>{}})).directory);
 assert.equal(scoring.run({root:f.root,siteIds:['eval-01','eval-02'],directories:dirs}).rows.length,6);
 assert.throws(()=>scoring.run({root:f.root,siteIds:['eval-01','eval-02'],directories:[dirs[0]]}),/score-missing-policy-row/);
 assert.throws(()=>scoring.run({root:f.root,siteIds:['eval-01','eval-02'],directories:[...dirs,dirs[0]]}),/duplicate-page-policy/);
 const codex=(await harness.runPolicy({root:f.root,policy:'P4-Codex',siteIds:['eval-01'],runnerFactory:modelFactory,onEvent:()=>{}})).directory;
 assert.equal(scoring.run({root:f.root,siteIds:['eval-01','eval-11'],directories:[codex]}).rows.length,3);
 assert.throws(()=>scoring.run({root:f.root,siteIds:['eval-01','eval-02'],directories:[codex]}),/score-missing-policy-row/);
 const configFile=path.join(codex,'run.json'),bytes=fs.readFileSync(configFile),config=JSON.parse(bytes);config.siteIds.push('eval-11');fs.writeFileSync(configFile,JSON.stringify(config));
 assert.throws(()=>scoring.run({root:f.root,siteIds:['eval-01'],directories:[codex]}),/Codex-outside-frozen-subset/);fs.writeFileSync(configFile,bytes);
});

test('evaluation deadline blocks every new turn before reservation and preserves counted requests',async()=>{
 const f=sealed(),l=new harness.EvaluationLedger({root:f.root,siteId:'eval-01',policy:'P4-on',experiment:'deadline-test',deadline:Date.now()+60000});
 const runner=modelFactory('P4-on',l);
 await assert.rejects(harness.runPolicy({root:f.root,policy:'P4-on',siteIds:['eval-01'],deadline:NaN}),/invalid-deadline/);
 await l.run(runner,[{role:'system',content:'Fixture'}],{pageIds:['eval-01-p1']});
 assert.equal(l.totals().requests,1);l.deadline=Date.now()-1;
 await assert.rejects(l.run(runner,[],{pageIds:['eval-01-p1']}),/evaluation-deadline/);
 assert.equal(runner.calls,1);assert.equal(l.totals().requests,1);assert.equal(l.totals().pending,0);
 const result=await harness.runPolicy({root:f.root,policy:'P4-on',siteIds:['eval-01'],runnerFactory:(p,ledger)=>{
  const r=modelFactory(p,ledger);r.generate=async()=>{ledger.deadline=Date.now()-1;return {content:JSON.stringify({action:'query',selector:'main'}),usage:{prompt_tokens:5,completion_tokens:2}};};return r;
 },onEvent:()=>{}});
 const receipt=JSON.parse(fs.readFileSync(path.join(result.directory,'sites/eval-01/complete.json')));
 assert.equal(receipt.accounting.modelRequests,1);assert.ok(harness.lines(path.join(result.directory,'rows.jsonl')).every(r=>r.reason==='boundary'&&r.fallback));
});

test('evaluation failure rows retain underlying transport code and message',async()=>{
 const f=sealed(),cause={code:'ECONNRESET',message:'socket reset in fake transport'};
 const result=await harness.runPolicy({root:f.root,policy:'P4-local',siteIds:['eval-01'],runnerFactory:(p,l)=>({...modelFactory(p,l),async generate(){throw Object.assign(Error('provider-request-failed'),{transportCause:cause});}}),onEvent:()=>{}});
 assert.ok(harness.lines(path.join(result.directory,'rows.jsonl')).every(r=>!r.ok&&r.fallback&&JSON.stringify(r.transportCause)===JSON.stringify(cause)));
 assert.equal(new Ledger({root:f.root}).totals().pending,0);
});

test('saved Windows run-7 pointers map to this checkout without modifying historical bytes',()=>{
 const {root,iterationFile}=fixture(),pointer=path.join(root,'workspace/revision/dev-runs/run7/final.json');
 const windows=file=>'C:\\Dev\\Visual_adapter\\'+path.relative(root,file).replaceAll(path.sep,'\\');
 const state=JSON.parse(fs.readFileSync(iterationFile));
 fs.writeFileSync(iterationFile,JSON.stringify({...state,folder:windows(state.folder)}));
 fs.writeFileSync(pointer,JSON.stringify({iterationFile:windows(iterationFile)}));
 const before=fs.readFileSync(pointer),stateBefore=fs.readFileSync(iterationFile);
 assert.equal(freeze.retained(root).promptFile,'workspace/revision/dev-runs/fixture/iteration-1/prompt.txt');
 assert.equal(freeze.checkoutPath('C:\\Dev\\Visual_adapter\\workspace\\fixture'),path.join(ROOT,'workspace/fixture'));
 assert.throws(()=>freeze.checkoutPath('C:\\Dev\\Other\\file'),/unmapped-windows/);
 assert.deepEqual(fs.readFileSync(pointer),before);assert.deepEqual(fs.readFileSync(iterationFile),stateBefore);
});

test('deadline crossed during reservation refuses transport and settles the counted reservation',async()=>{
 const f=sealed(),l=new harness.EvaluationLedger({root:f.root,siteId:'eval-01',policy:'P4-on',experiment:'dispatch-deadline'}),r=modelFactory('P4-on',l),append=l.append.bind(l);
 l.append=e=>{append(e);if(e.event==='request')l.deadline=Date.now()-1;};
 await assert.rejects(l.run(r,[],{pageIds:['eval-01-p1']}),/evaluation-deadline/);
 assert.equal(r.calls,0);assert.equal(l.totals().requests,1);assert.equal(l.totals().pending,0);
});

test('a local request waiting for a concurrency slot checks its deadline before starting transport',async()=>{
 const {LocalRunner}=require('../../../backend/agent/runners.cjs'),f=sealed(),l=new harness.EvaluationLedger({root:f.root,siteId:'eval-01',policy:'P4-local',experiment:'queued-deadline'});
 let calls=0,release,ready;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>ready=resolve);
 const runner=new LocalRunner({ledger:l,fetchRequest:async()=>{calls++;if(calls===4)ready();await gate;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}]}));}});
 const results=Promise.allSettled(Array.from({length:5},()=>l.run(runner,[],{pageIds:['eval-01-p1']})));
 await started;l.deadline=Date.now()-1;release();const settled=await results;
 assert.equal(calls,4);assert.equal(settled.filter(r=>r.status==='rejected'&&/evaluation-deadline/.test(r.reason.message)).length,1);
 assert.equal(l.totals().requests,5);assert.equal(l.totals().pending,0);
});
