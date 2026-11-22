const {test,afterEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const v3=require('../../../extension/procedure-v3.js'),{Ledger}=require('../../../backend/agent/ledger.cjs'),{runLoop}=require('../../../backend/agent/loop.cjs');
const {redact}=require('../../../backend/agent/privacy.cjs'),{residuals}=require('../../../backend/agent/audit.cjs');
const {doc,close,rule,ledger,fake,prose}=require('./helpers.cjs');afterEach(close);
const messages=[{role:'system',content:'fixture task'},{role:'user',content:'safe fixture data'}];
const rawRun=(l,r,meta)=>Ledger.prototype.run.call(l,r,messages,meta);
const baseline=d=>({P0:{ok:true,html:d.body.innerHTML},P1:{ok:false,html:''}});
test('review 7: omitted IDs and evaluation path metadata refuse before any paid transport',async()=>{
 const l=ledger(),r=fake(['{}'],{provider:'deepseek'});
 for(const meta of [{policy:'dev'},{policy:'dev',pages:['corpus/eval/site/p1']},{policy:'dev',pageIds:['not-listed']}])await assert.rejects(rawRun(l,r,meta),e=>e.name==='BoundaryError');
 assert.equal(r.calls.length,0);assert.equal(l.totals().paidRequests,0);assert.equal(l.entries().filter(e=>e.event==='request').length,0);
 await assert.rejects(runLoop({pages:[doc('<main>private eval A</main>'),doc('<main>private eval B</main>')],runner:r,ledger:l}),/page-ids-required/);
 await assert.rejects(runLoop({pageIds:['fixture-p1','fixture-p2'],pages:[doc('private eval')],runner:r,ledger:l}),/caller-documents/);assert.equal(r.calls.length,0);
});
test('review 7: canonical IDs determine sources, not caller paths; all evaluation providers remain frozen',async()=>{
 const l=ledger(),r=fake(['{}'],{provider:'deepseek'});await rawRun(l,r,{policy:'dev',pageIds:['fixture-p1'],pages:['corpus/eval/site/p1']});
 const request=l.entries().find(e=>e.event==='request');assert.deepEqual(request.pageIds,['fixture-p1']);assert.ok(request.pages[0].includes(path.join('corpus','dev','fixture')));assert.ok(!request.pages[0].includes(path.join('corpus','eval')));
 fs.writeFileSync(path.join(l.root,'workspace/revision/evaluation-freeze.json'),JSON.stringify({approved:true}));
 for(const provider of ['deepseek','pc11','codex'])for(const policy of ['eval','evaluation']){
  const runner=fake([],{provider});await assert.rejects(rawRun(l,runner,{policy,pageIds:['fixture-p1']}),/evaluation-freeze-required/);assert.equal(runner.calls.length,0);
 }
 const good=fake([{action:'submit',rule:rule()}],{provider:'deepseek'});const out=await runLoop({pageIds:['fixture-p1','fixture-p2'],pagePaths:['corpus/eval/ignored'],baselines:[{P0:{ok:true,html:'private eval baseline'}}],runner:good,ledger:l});assert.equal(out.accepted,true);
 assert.ok(!JSON.stringify(good.calls).includes('private eval'));
});
test('review 7: a manifest entry pointing outside the development corpus is refused',async()=>{
 const l=ledger(),file=path.join(l.root,'workspace/revision/corpus/eval/eval.html');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'private evaluation');
 const manifestFile=l.registry.manifestFile,manifest=JSON.parse(fs.readFileSync(manifestFile));manifest.sites[0].pages[0].sourceFile=file;fs.writeFileSync(manifestFile,JSON.stringify(manifest));
 await assert.rejects(rawRun(l,fake([],{provider:'deepseek'}),{policy:'dev',pageIds:['fixture-p1']}),/outside-corpus/);
});
test('review 8: nested substantive elements count 80 physical characters once for G5',()=>{
 const d=doc('<main class="reading"><h1>T</h1><ul><li><blockquote><p>'+'x'.repeat(80)+'</p></blockquote></li></ul></main>');
 const out=v3.gate([d],rule(),{mode:'P3',baselines:[baseline(d)]});assert.equal(out.accepted,true,JSON.stringify(out.reasons));assert.equal(out.pages[0].substantiveCharacters,80);assert.equal(out.pages[0].minimumTextLength,40);
});
test('review 9: a span-selected preserved source paragraph passes G3, G6 and use-time coverage',()=>{
 const body='Eighty characters of prose remain present through a span selector and preserve their text.';
 const d=doc(`<main class="reading"><h1>T</h1><p><span id="body">${body}</span></p></main>`),r=rule({regions:[{role:'title',selector:'h1',multiple:false,required:true},{role:'body',selector:'#body',multiple:false,required:true}]});
 const out=v3.gate([d],r,{mode:'P3',baselines:[baseline(d)]});assert.equal(out.accepted,true,JSON.stringify(out.reasons));assert.equal(out.pages[0].uniqueCoverage.ratio,1);assert.equal(out.pages[0].g6.missing.length,0);assert.equal(v3.useTime(d,r).substantiveCoverage.ratio,1);
});
test('review 9: wrapper aliases do not invent duplicate preserved sibling occurrences',()=>{
 const text=prose('Same text'),d=doc(`<main class="reading"><h1>T</h1><p><span id="body-a">${text}</span></p><p><span id="body-b">${text}</span></p></main>`);
 const r=rule({regions:[{role:'title',selector:'h1',multiple:false,required:true},{role:'body',selector:'#body-a',multiple:false,required:true}]});
 assert.equal(v3.gate([d],r,{mode:'P3',baselines:[baseline(d)]}).accepted,false);
 r.regions[1]={role:'body',selector:'span[id^="body-"]',multiple:true,required:true};assert.equal(v3.gate([d],r,{mode:'P3',baselines:[baseline(d)]}).accepted,true);
});
test('review 10: international phones, query-only bare URLs and non-ASCII digits are redacted and audited',()=>{
 const raw='+33 6 12 34 56 78; +49 30 123456; +1 (705) 555-1234; example.org?token=secret; ١٢٣٤٥٦; १२३४५६; ۱۲۳۴۵۶';
 const before=residuals(raw);assert.ok(before.phones>=3);assert.ok(before.urlPaths>=1);assert.ok(before.digitRuns>=3);
 const cleaned=redact(raw);for(const value of ['+33','+49','705','token=secret','١٢٣٤٥٦','१२३४५६','۱۲۳۴۵۶'])assert.ok(!cleaned.includes(value),cleaned);assert.ok(cleaned.includes('example.org'));
 const after=residuals(cleaned);assert.equal(after.phones,0);assert.equal(after.urlPaths,0);assert.equal(after.digitRuns,0);
});
test('review 11: rendered form values, option text and selected/checked state are removed without mutating source',()=>{
 const d=doc('<main class="reading"><h1>T</h1><select><option selected value="private">private</option></select><button value="secret"><span>Submit</span></button><textarea>textarea-private</textarea><input checked value="input-private"><p>'+prose('reading')+'</p></main>');d.querySelector('input').value='dirty-private';
 const before=d.body.innerHTML,out=v3.render(d,rule()),html=out.innerHTML;
 for(const secret of ['private','secret','selected','checked'])assert.ok(!html.includes(secret),html);
 assert.equal(out.querySelector('select').options.length,0);assert.equal(out.querySelector('textarea').value,'');assert.equal(out.querySelector('input').value,'');assert.equal(out.querySelector('button').value,'');assert.equal(d.body.innerHTML,before);
});
test('review 12: each srcset candidate is resolved and filtered even beside data:image',()=>{
 const d=doc('<main class="reading"><h1>T</h1><img srcset="data:image/png;base64,AAAA 1x, /large.png 2x, javascript:alert(1) 3x, data:text/html,evil 4x, /huge.png 5x"></main>');
 const srcset=v3.render(d,rule()).querySelector('img').getAttribute('srcset');assert.equal(srcset,'data:image/png;base64,AAAA 1x, https://example.test/large.png 2x, https://example.test/huge.png 5x');
 const exact=v3.srcsetCandidates('data:image/png;base64,AAAA 1x, /large.png 2x',d);assert.ok(exact.includes('https://example.test/large.png 2x'));assert.ok(!srcset.includes('javascript:'));assert.ok(!srcset.includes('data:text'));
});
test('capability progress stops after two non-improving iterations and does not accept clean/noise tradeoffs',()=>{
 const {assess}=require('../../../backend/agent/progress.cjs');
 const summary=(clean,noise,recall=1)=>({policies:Object.fromEntries([['P4-off',clean,noise,recall],['P0',.3,.4,1],['P1',.4,.3,1]].map(([p,c,n,r])=>[p,{measures:{cleanPass:{estimate:c},noiseLeakage:{estimate:n},contentRecall:{estimate:r}}}]))});
 const first=assess(summary(.5,.2));assert.equal(first.target,true);assert.equal(first.nonImproving,0);
 const second=assess(summary(.6,.25),first);assert.equal(second.improved,false);assert.equal(second.stop,false);
 const third=assess(summary(.5,.2),second);assert.equal(third.stop,true);assert.equal(third.nonImproving,2);
 const better=assess(summary(.6,.1),second);assert.equal(better.improved,true);assert.equal(better.nonImproving,0);
 const lostRecall=assess(summary(.7,.05,.99),first);assert.equal(lostRecall.improved,false);assert.equal(lostRecall.target,false);
 const tie=assess(summary(.4,.3));assert.equal(tie.nonImproving,1);assert.equal(assess(summary(.4,.3),tie).stop,true);
 const tradeoff=assess(summary(.5,.5));const refining=assess(summary(.6,.4),tradeoff);assert.equal(refining.improved,true);assert.equal(refining.nonImproving,0);assert.equal(refining.target,false);
});
