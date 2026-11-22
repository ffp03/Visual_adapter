const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {cost,tokens,hash,pricesAt}=require('../../../backend/agent/ledger.cjs');const {ledger,fake}=require('./helpers.cjs');
const messages=[{role:'system',content:'system prompt'},{role:'user',content:'redacted data'}];
test('reported usage cost counts cache separately; peak/off-peak list prices; invalid usage fails closed',()=>{
 assert.equal(cost({prompt_tokens:1000000,completion_tokens:1000000,prompt_cache_hit_tokens:500000}),1.353);
 assert.equal(cost({prompt_tokens:1000000,completion_tokens:1000000,prompt_cache_hit_tokens:500000},'offPeak'),0.6765);
 assert.equal(pricesAt('2026-11-20T02:00:00Z'),'peak');assert.equal(pricesAt('2026-11-21T02:00:00Z'),'offPeak');
 assert.equal(tokens({prompt_tokens:4,completion_tokens:2,prompt_cache_hit_tokens:5}),null);assert.equal(cost(null),null);
});
test('append-only request, response and assessment, exact payload and prompt hashes, no credentials',async()=>{
 const l=ledger(),r=fake([{action:'query',selector:'main'}],{provider:'deepseek'});
 const result=await l.run(r,messages,{policy:'dev',site:'example.test',pageIds:['fixture-p1'],turn:2});const prefix=fs.readFileSync(l.file,'utf8');l.outcome(result.ledgerId,'invalid',['bad-action']);
 assert.ok(fs.readFileSync(l.file,'utf8').startsWith(prefix));const request=l.entries()[0];const payload=fs.readFileSync(path.join(l.directory,request.payloadFile),'utf8');
 assert.equal(request.promptHash,hash('system prompt'));assert.equal(request.payloadHash,hash(payload));assert.deepEqual(JSON.parse(payload).messages,messages);assert.equal(l.totals().paidRequests,1);assert.equal(l.totals().devRequests,1);assert.equal(l.totals().failures,1);assert.equal(l.totals().cachedTokens,40);
});
test('refuses exact global, development and dollar limits before transport; no phantom paid request',async()=>{
 for(const options of [{maxRequests:1},{maxDevRequests:1},{maxDollars:0.01}]){
  const l=ledger(options),r=fake(['{}','{}'],{provider:'deepseek'});await l.run(r,messages,{policy:'dev'});
  if(options.maxDollars) {l.locked(()=>l.append({event:'assessment',id:l.entries()[0].id,costEstimate:0.01}));}
  await assert.rejects(l.run(r,messages,{policy:'dev'}),e=>['request-cap','development-cap','dollar-cap'].includes(e.message));assert.equal(r.calls.length,1);assert.equal(l.totals().paidRequests,1);assert.equal(l.entries().at(-1).event,'refused');
 }
});
test('dev allowance cannot be raised and paid eval paths are forbidden despite a dev label',async()=>{
 const l=ledger({maxRequests:10000,maxDevRequests:10000,maxDollars:500});assert.deepEqual(l.limits,{dollars:5,requests:2000,dev:780});const r=fake([],{provider:'deepseek'});
 for(const meta of [{policy:'eval'},{policy:'dev',pages:['C:\\Dev\\Visual_adapter\\workspace\\revision\\corpus\\eval\\e01\\p1']},{policy:'other'}])await assert.rejects(l.run(r,messages,meta));assert.equal(r.calls.length,0);
});
test('pending reservations prevent concurrent overrun; transport failures consume requests and conservatively retain unknown usage cost',async()=>{
 const l=ledger({maxDevRequests:1});let release;const r={provider:'deepseek',model:'deepseek-flash',generate:()=>new Promise(resolve=>{release=resolve;})};
 const first=l.run(r,messages,{policy:'dev'});await assert.rejects(l.run(r,messages,{policy:'dev'}),/development-cap/);release({content:'{}',usage:{prompt_tokens:1,completion_tokens:1}});await first;
 const failure=ledger(),runner=fake([Error('network secret must not be logged')],{provider:'deepseek'});await assert.rejects(failure.run(runner,messages,{policy:'dev'}));assert.equal(failure.totals().paidRequests,1);assert.equal(failure.totals().failures,1);assert.ok(failure.totals().dollars>0);assert.ok(!fs.readFileSync(failure.file,'utf8').includes('network secret'));
});
test('Codex and local-model requests logged but excluded from DeepSeek caps; corrupt ledger and lock fail closed',async()=>{
 const l=ledger({maxRequests:0,maxDevRequests:0,maxDollars:0});for(const provider of ['codex','pc11'])await l.run(fake(['{}'],{provider}),messages,{policy:'dev'});assert.equal(l.totals().requests,2);assert.equal(l.totals().paidRequests,0);
 fs.appendFileSync(l.file,'bad-json\n');await assert.rejects(l.run(fake(['{}'],{provider:'deepseek'}),messages,{policy:'dev'}));
 const locked=ledger();fs.writeFileSync(path.join(locked.directory,'ledger.lock'),'held');await assert.rejects(locked.run(fake(['{}']),messages),/ledger-locked/);
});
