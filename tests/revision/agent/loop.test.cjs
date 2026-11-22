const {test,afterEach}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {runLoop,PROMPT_HASH}=require('../../../backend/agent/loop.cjs');const {oneShot,SYSTEM_PROMPT:OCTOBER}=require('../../../backend/agent/one-shot.cjs');const {modelInputText}=require('../../../backend/model-evidence.cjs');
const {close,pages,rule,ledger,fake}=require('./helpers.cjs');afterEach(close);
test('scripted outline/query/preview/submit loop admits P4 and accounts every turn',async()=>{
 const ds=pages(),r=rule({exclude:['.template']}),runner=fake([{action:'outline',page:1,node:'n1',depth:3},{action:'query',selector:'main'},{action:'preview',rule:r},{action:'submit',rule:r}]),l=ledger();
 const out=await runLoop({pages:ds,runner,ledger:l});assert.equal(out.accepted,true,JSON.stringify(out));assert.equal(out.turns,4);assert.equal(out.accounting.promptTokens,400);assert.equal(out.accounting.completionTokens,80);assert.equal(out.accounting.failures,0);assert.equal(out.promptHash,PROMPT_HASH);assert.equal(l.totals().requests,4);assert.ok(!JSON.stringify(runner.calls).includes('<main'));
});
test('exactly six requests, last must submit, remaining-turn feedback explicit',async()=>{
 const runner=fake(Array.from({length:6},()=>({action:'query',selector:'main'}))),l=ledger();const out=await runLoop({pages:pages(),runner,ledger:l});assert.equal(out.accepted,false);assert.equal(out.reason,'final-turn-must-submit');assert.equal(out.turns,6);assert.equal(runner.calls.length,6);assert.equal(out.accounting.failures,1);assert.equal(JSON.parse(runner.calls[5].at(-1).content).mustSubmit,true);assert.equal(l.totals().failures,1);
});
test('every provider sees bounded history with initial outlines, action lines and only latest observation',async()=>{
 for(const provider of ['scripted','deepseek','pc11','codex']){
  const r=rule(),runner=fake([{action:'outline',page:1,node:'n1',depth:3},{action:'query',selector:'.body'},{action:'preview',rule:r},{action:'submit',rule:r}],{provider}),l=ledger();
  const result=await runLoop({...(provider==='scripted'?{pages:pages()}:{pageIds:['fixture-p1','fixture-p2']}),runner,ledger:l});assert.equal(result.accepted,true);
  for(let i=0;i<runner.calls.length;i++){
   const messages=runner.calls[i];assert.equal(messages.length,3);assert.deepEqual(messages.slice(0,2),runner.calls[0].slice(0,2));
   const state=JSON.parse(messages[2].content);assert.equal(state.actionLog.length,i);assert.ok(state.actionLog.every(line=>!line.includes('\n')));
   if(i===2){assert.ok(Array.isArray(state.response));assert.ok(!messages[2].content.includes('[collapsed]'));}
   if(i===3){assert.equal(state.response.accepted,true);assert.ok(!messages[2].content.includes('"matches"'));}
  }
 }
});
test('invalid actions consume turns; invalid final JSON is a counted failure; gate rejection stays rejected',async()=>{
 const ds=pages();const runner=fake(['not JSON',{action:'no-such-action'},{action:'submit',rule:rule({exclude:['.body']})}]),l=ledger();const out=await runLoop({pages:ds,runner,ledger:l});assert.equal(out.accepted,false);assert.equal(out.reason,'gate-rejected');assert.equal(out.turns,3);assert.equal(out.accounting.failures,3);assert.equal(l.totals().failures,3);
 const bad=await runLoop({pages:ds,runner:fake(['{}']),ledger:ledger(),maxTurns:1});assert.equal(bad.reason,'invalid-final-rule');assert.equal(bad.turns,1);
});
test('provider failure is one counted request with no retry; guard refusal is zero provider requests',async()=>{
 const failed=fake([Error('offline'),{action:'submit',rule:rule()}]);const out=await runLoop({pages:pages(),runner:failed,ledger:ledger()});assert.equal(out.reason,'provider-error');assert.equal(out.turns,1);assert.equal(failed.calls.length,1);
 const r=fake([],{provider:'deepseek'}),l=ledger({maxDevRequests:0});const refused=await runLoop({pageIds:['fixture-p1','fixture-p2'],runner:r,ledger:l});assert.equal(refused.reason,'budget');assert.equal(refused.turns,0);assert.equal(r.calls.length,0);
});
test('P3 accepts one page and shows no repeat flags; wrong mode counts are rejected',async()=>{
 const ds=pages(),runner=fake([{action:'submit',rule:rule()}]);const out=await runLoop({pages:[ds[0]],mode:'P3',runner,ledger:ledger()});assert.equal(out.accepted,true);assert.ok(!runner.calls[0][1].content.includes('repeat='));await assert.rejects(runLoop({pages:ds,mode:'P3',runner,ledger:ledger()}),/mode-page-count/);
});
test('rejected previews remain counted when a later submission succeeds; raw action interface works',async()=>{
 const ds=pages(),runner=fake([{action:'preview',rule:rule({exclude:['.body']})},{action:'submit',rule:rule()}]),l=ledger();
 const out=await runLoop({pages:ds,runner,ledger:l});assert.equal(out.accepted,true);assert.equal(out.accounting.failures,1);assert.equal(l.totals().failures,1);
 const raw={provider:'scripted',model:'scripted',async generate(){return {action:'submit',rule:rule()};}};assert.equal((await runLoop({pages:ds,runner:raw,ledger:ledger()})).accepted,true);
});
test('DOM runtime errors settle submitted requests as failures and decline use-time safely',async()=>{
 const v3=require('../../../extension/procedure-v3.js'),ds=pages(),r=rule(),runner=fake([{action:'submit',rule:r}]),l=ledger();
 const generate=runner.generate.bind(runner);runner.generate=async(...args)=>{const result=await generate(...args);ds[0].createElement=()=>{throw Error('synthetic DOM failure');};return result;};
 const out=await runLoop({pages:ds,runner,ledger:l});assert.equal(out.accepted,false);assert.equal(out.reason,'runtime-error');assert.equal(out.accounting.failures,1);assert.equal(l.totals().failures,1);assert.equal(l.totals().pending,0);
 assert.equal(v3.useTime(ds[0],r,0.9).fallback,true);
});
test('October one-shot keeps byte-identical original prompt and model-evidence input, through same ledger',async()=>{
 const source=fs.readFileSync(require.resolve('../../../backend/deepseek-runner.cjs'),'utf8');const quoted=source.match(/role: 'system', content: ('[^\n]*')/)[1];assert.equal(OCTOBER,Function('return '+quoted)());
 const runner=fake([{main:'main',exclude:[],name:'Article'}]),l=ledger(),evidence={schemaVersion:1,sourceCounts:{prose:2},representedCounts:{prose:1},locators:[]};const out=await oneShot({html:'<main>input</main>',evidence,runner,ledger:l});assert.equal(out.accepted,true);assert.equal(runner.calls[0][1].content,modelInputText('<main>input</main>',evidence));assert.equal(l.entries()[0].experimentPolicy,'P2');assert.equal(JSON.parse(fs.readFileSync(require('node:path').join(l.directory,l.entries()[0].payloadFile),'utf8')).max_tokens,1024);
 const invalid=await oneShot({html:'x',runner:fake(['bad JSON']),ledger:ledger()});assert.equal(invalid.reason,'invalid');
});
