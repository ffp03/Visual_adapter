// Explicitly authorized, one-shot development pilot. No retries, no live-site reads.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const base = __dirname, root = path.resolve(base, '../../..');
const { DeepSeekRunner, sharedKey } = require(path.join(root, 'backend/deepseek-runner.cjs'));
const { cleanHTML } = require(path.join(root, 'backend/local-ai.cjs'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function writeNew(file, value) {
 const staging=file+'.staged-'+crypto.randomUUID();
 const handle=fs.openSync(staging,'wx');
 try{fs.writeFileSync(handle,JSON.stringify(value,null,2));fs.fsyncSync(handle);}finally{fs.closeSync(handle);}
 fs.linkSync(staging,file); // Atomic no-replace publication; retain staged originals.
}
const pilot = path.join(base, 'fresh-development-pilot');
const out = path.join(pilot, 'live-v2');
const runtimeFiles = ['extension/content.js','extension/background.js','extension/procedure-core.js',
 'backend/deepseek-runner.cjs','backend/model-evidence.cjs','backend/local-ai.cjs',
 'backend/procedure-families.cjs','backend/validation-transport.cjs','tests/local/holdout.cjs'];
const authorization = {
 date:'2026-10-21', userApproval:'User replied go to up to80 new DeepSeek calls capped atUSD1; then requested retained-success regression alongside fresh44.',
 maxCalls:80, maxUsd:1, pilotMaxCalls:4, pilotMaxUsd:0.25, reserveUsd:0.0625,
 automaticRetries:false, initialIds:['site01-1-historical-input','site01-1-bounded-evidence'],
 subsequentIds:['site13-1-historical-input','site13-1-bounded-evidence'],
 pricing:{url:'https://api-docs.deepseek.com/quick_start/pricing/', verifiedOn:'2026-10-21',
 model:'deepseek-flash', documentedVersion:'DeepSeek-V4.1-Flash-1017',
 peakUsdPerMillion:{inputMiss:0.30,inputHit:0.006,output:1.20},
 accounting:'Peak list-price estimate, not a verified bill; missing or invalid usage retains the full reservation.'},
 scope:'Four-call paired development input diagnostic first. Fresh44 sealed until satisfactory development and runtime/prompt/scorer freeze. Prior successful32 must also be retested and reported as regression.',
 noAdditionalCallsFromThisProgram:true
};
function withLock(folder, fn) {
 const lock=path.join(folder,'budget.lock');
 const handle=fs.openSync(lock,'wx');
 try { return fn(); }
 finally { fs.closeSync(handle); fs.renameSync(lock,path.join(folder,'lock-history',crypto.randomUUID()+'.released')); }
}
function ledger(folder) {
 const events=fs.readdirSync(path.join(folder,'events')).filter(n=>/^\d{3}-(a-reserved|b-outcome)\.json$/.test(n)).sort().map(n=>read(path.join(folder,'events',n)));
 const calls=new Map();
 for(const e of events) {
  if(e.phase==='reserved') {if(calls.has(e.id)) throw Error('Duplicate reservation'); calls.set(e.id,{reservation:e});}
  else {const c=calls.get(e.id);if(!c||c.outcome)throw Error('Invalid ledger ordering');c.outcome=e;}
 }
 let chargedUsd=0;
 for(const c of calls.values()) chargedUsd+=c.outcome?.estimatedUsd ?? c.reservation.reserveUsd;
 return {calls,chargedUsd};
}
function reserve(folder,id,hashes,limits=authorization) {
 return withLock(folder,()=>{
  const state=ledger(folder);
  if(state.calls.has(id))throw Error('This attempt already exists; no retry allowed');
  if(state.calls.size>=limits.maxCalls||state.chargedUsd+limits.reserveUsd>limits.maxUsd+1e-12)throw Error('Global budget exhausted');
  const pilotCalls=[...state.calls.values()].filter(c=>c.reservation.scope==='development-pilot');
  const pilotCharged=pilotCalls.reduce((s,c)=>s+(c.outcome?.estimatedUsd??c.reservation.reserveUsd),0);
  if(pilotCalls.length>=limits.pilotMaxCalls||pilotCharged+limits.reserveUsd>limits.pilotMaxUsd+1e-12)throw Error('Pilot budget exhausted');
  const e={phase:'reserved',id,scope:'development-pilot',at:new Date().toISOString(),sequence:state.calls.size+1,reserveUsd:limits.reserveUsd,...hashes};
  writeNew(path.join(folder,'events',String(e.sequence).padStart(3,'0')+'-a-reserved.json'),e);
  return e;
 });
}
function usageCost(usage) {
 if(!usage||!Number.isSafeInteger(usage.prompt_tokens)||!Number.isSafeInteger(usage.completion_tokens)||usage.prompt_tokens<0||usage.completion_tokens<0)return null;
 const hit=usage.prompt_cache_hit_tokens??0;
 if(!Number.isSafeInteger(hit)||hit<0||hit>usage.prompt_tokens)return null;
 return ((usage.prompt_tokens-hit)*0.30+hit*0.006+usage.completion_tokens*1.20)/1e6;
}
function finish(folder,reservation,value) {
 withLock(folder,()=>{
  const state=ledger(folder),c=state.calls.get(reservation.id);
  if(!c||c.outcome)throw Error('Cannot complete reservation');
  const estimate=value.success===true&&Number.isFinite(value.estimatedUsd)&&value.estimatedUsd>=0?value.estimatedUsd:null;
  writeNew(path.join(folder,'events',String(reservation.sequence).padStart(3,'0')+'-b-outcome.json'),
   {phase:'outcome',id:reservation.id,at:new Date().toISOString(),...value,
    estimatedUsd:estimate,reportedEstimateUsd:value.reportedEstimateUsd??value.estimatedUsd??null});
 });
}
function freeze() {
 if(fs.existsSync(out))throw Error('Live folder already exists; preserve it');
 fs.mkdirSync(out);fs.mkdirSync(path.join(out,'events'));fs.mkdirSync(path.join(out,'lock-history'));
 writeNew(path.join(out,'authorization.json'),authorization);
 writeNew(path.join(out,'freeze.json'),{at:new Date().toISOString(),
  authorizationSha256:sha(fs.readFileSync(path.join(out,'authorization.json'))),
  protocolSha256:sha(fs.readFileSync(path.join(pilot,'protocol.json'))),
  scriptSha256:sha(fs.readFileSync(__filename)),
  runtime:Object.fromEntries(runtimeFiles.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))])),
  requests:read(path.join(pilot,'protocol.json')).records.map(r=>({id:r.seed+'-'+r.variant,sha256:r.requestSha256}))});
 return {prepared:true,liveCalls:0,authorization:authorization.maxCalls,maxUsd:authorization.maxUsd};
}
function verifyFreeze() {
 const frozen=read(path.join(out,'freeze.json'));
 if(sha(fs.readFileSync(path.join(out,'authorization.json')))!==frozen.authorizationSha256||
  JSON.stringify(read(path.join(out,'authorization.json')))!==JSON.stringify(authorization)||
  sha(fs.readFileSync(path.join(pilot,'protocol.json')))!==frozen.protocolSha256||
  sha(fs.readFileSync(__filename))!==frozen.scriptSha256)throw Error('Authorization, protocol or runner changed');
 for(const[f,h]of Object.entries(frozen.runtime))if(sha(fs.readFileSync(path.join(root,f)))!==h)throw Error('Runtime freeze mismatch');
 return frozen;
}
async function request(id,{offline=false}={}) {
 const frozen=verifyFreeze();
 if(!authorization.initialIds.includes(id)&&!authorization.subsequentIds.includes(id))throw Error('Attempt outside four-call scope');
 if(!offline&&authorization.subsequentIds.includes(id)) {
  const checkpoint=read(path.join(out,'bbc-checkpoint.json'));
  const state=ledger(out);
  if(checkpoint.decision!=='continue-to-stanford'||authorization.initialIds.some(x=>!state.calls.get(x)?.outcome||
   checkpoint.outcomeHashes?.[x]!==sha(fs.readFileSync(path.join(out,x,'provider-result.json')))))throw Error('BBC checkpoint absent or invalid');
 }
 const record=read(path.join(pilot,'protocol.json')).records.find(r=>r.seed+'-'+r.variant===id);
 if(!record||frozen.requests.find(r=>r.id===id)?.sha256!==record.requestSha256)throw Error('Request not frozen');
 const savedBytes=fs.readFileSync(path.join(pilot,record.request));
 if(sha(savedBytes)!==record.requestSha256)throw Error('Prepared request changed');
 const expected=JSON.stringify(JSON.parse(savedBytes));
 const folder=path.join(base,'development/promoted',record.seed);
 for(const[file,hash]of [['source.html',record.sourceSha256],['references.json',record.seedReferenceSha256]])
  if(sha(fs.readFileSync(path.join(folder,file)))!==hash)throw Error('Development source/reference changed');
 if(sha(fs.readFileSync(path.join(base,'development/promoted',record.partner,'references.json')))!==record.partnerReferenceSha256)throw Error('Partner reference changed');
 const old=record.variant==='historical-input';
 const htmlFile=old?path.join(folder,'model-input.html'):path.join(base,'investigation/parent-repaired-samples-v3',record.seed,'analysis.html');
 if(sha(fs.readFileSync(htmlFile))!==record.sourceInputSha256)throw Error('Model input changed');
 const html=fs.readFileSync(htmlFile,'utf8');
 const evidence=old?undefined:read(path.join(base,'investigation/parent-repaired-samples-v3',record.seed,'metadata.json')).modelEvidence;
 let reservation,callFolder,receipt={};
 const apiKey=offline?'explicit-offline-fake-only':sharedKey();
 const runner=new DeepSeekRunner({apiKey,timeoutMs:60000,fetchRequest:async(url,options)=>{
  if(url!=='https://api.deepseek.com/chat/completions'||options.body!==expected||options.method!=='POST')throw Error('Exact provider request mismatch');
  const body=JSON.parse(options.body);
  if(body.model!=='deepseek-flash'||body.max_tokens!==1024||body.thinking.type!=='disabled'||body.stream!==false||
   Buffer.byteLength(options.body)>160000||body.messages.reduce((s,m)=>s+Buffer.byteLength(m.content),0)>128000)throw Error('Request budget shape mismatch');
  if(offline)return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"main":"main","exclude":[],"name":"Offline"}'}}]}));
  reservation=reserve(out,id,{requestFileSha256:record.requestSha256,wireRequestSha256:sha(options.body)});
  callFolder=path.join(out,id);fs.mkdirSync(callFolder);
  writeNew(path.join(callFolder,'started.json'),reservation);
  const response=await fetch(url,options);
  receipt={status:response.status,requestId:response.headers.get('x-request-id')||null,providerDate:response.headers.get('date')||null};
  writeNew(path.join(callFolder,'response-metadata.json'),receipt);
  if(!response.ok){await response.body?.cancel();return new Response('',{status:response.status,headers:receipt.requestId?{'x-request-id':receipt.requestId}:{}});}
  const chunks=[];let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>262144){await response.body.cancel().catch(()=>{});throw Error('Response exceeded bound');}chunks.push(chunk);}
  const raw=Buffer.concat(chunks);
  fs.writeFileSync(path.join(callFolder,'raw-response.json'),raw,{flag:'wx'});
  try{const data=JSON.parse(raw);receipt={...receipt,servedModel:data.model||null,usage:data.usage||null,requestId:receipt.requestId||data.id||null,rawResponseSha256:sha(raw)};}catch{}
  return new Response(raw,{status:response.status,headers:receipt.requestId?{'x-request-id':receipt.requestId}:{}});
 }});
 const started=Date.now();
 try {
  const result=await runner.generate(old?html:cleanHTML(html),evidence);
  if(offline)return{id,offline:true,exactRequestMatched:true,liveCalls:0};
  writeNew(path.join(callFolder,'provider-result.json'),result);
  const estimatedUsd=usageCost(result.usage);
  finish(out,reservation,{success:true,...receipt,estimatedUsd,elapsedMs:Date.now()-started,
   resultSha256:sha(fs.readFileSync(path.join(callFolder,'provider-result.json'))),accountingWarning:estimatedUsd===null?'Usage unavailable; reservation retained':estimatedUsd>authorization.reserveUsd?'Actual estimate exceeds reserved bound':null});
  return{id,success:true,requestId:result.requestId,servedModel:result.servedModel,usage:result.usage,estimatedUsd,elapsedMs:Date.now()-started};
 } catch(error) {
  if(reservation)finish(out,reservation,{success:false,...receipt,error:'Provider generation failed; no retry',estimatedUsd:null,reportedEstimateUsd:usageCost(receipt.usage),elapsedMs:Date.now()-started});
  throw Error(reservation?'Provider generation failed; no retry; reservation/outcome retained':'Pilot preflight failed; no live reservation');
 } finally{runner.close();}
}
module.exports={reserve,finish,ledger,usageCost,withLock,authorization};
if(require.main===module)(async()=>{
 const command=process.argv[2];
 let result;
 if(command==='freeze')result=freeze();
 else if(command==='offline-check'){for(const id of [...authorization.initialIds,...authorization.subsequentIds])console.log(JSON.stringify(await request(id,{offline:true})));return;}
 else if(command==='run')result=await request(process.argv[3]);
 else if(command==='status'){verifyFreeze();const s=ledger(out);result={attempts:s.calls.size,estimatedOrReservedUsd:s.chargedUsd,maxCalls:authorization.maxCalls,maxUsd:authorization.maxUsd};}
 else throw Error('Use freeze, offline-check, run ID or status');
 console.log(JSON.stringify(result));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
