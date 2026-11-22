'use strict';
const fs=require('node:fs'),path=require('node:path');const {Ledger,hash}=require('./ledger.cjs');const {audit}=require('./audit.cjs');const {PROMPT_HASH}=require('./loop.cjs');
const ROOT=path.resolve(__dirname,'../..'),BASE=path.join(ROOT,'workspace/revision/dev-runs');
function summarize({testsPassed=null}={}){
 const folder=path.join(BASE,'run2'),trials=[];
 for(const run of fs.readdirSync(folder).sort()){
  const completeFile=path.join(folder,run,'complete.json');if(!fs.existsSync(completeFile))throw Error('incomplete-development-run:'+run);
  const complete=JSON.parse(fs.readFileSync(completeFile,'utf8'));
  for(const r of complete.sites)trials.push({...r,run,promptHash:complete.promptHash,evidence:path.relative(ROOT,path.join(folder,run,r.id,'result.json'))});
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'workspace/revision/corpus/dev-manifest.json'),'utf8'));
 const keys=['deepseek-P4','local-P4','deepseek-P3'];
 const sites=manifest.sites.map(site=>({id:site.siteId,host:site.host,policies:Object.fromEntries(keys.map(key=>{
  const [provider,mode]=key.split('-'),all=trials.filter(t=>t.id===site.siteId&&t.provider===provider&&t.mode===mode);
  const current=all.filter(t=>t.promptHash===PROMPT_HASH).at(-1)||all.at(-1);
  return [key,{...current,totalTrials:all.length,totalRequests:all.reduce((s,t)=>s+(t.accounting?.requests||0),0),
   totalPromptTokens:all.reduce((s,t)=>s+(t.accounting?.promptTokens||0),0),totalCompletionTokens:all.reduce((s,t)=>s+(t.accounting?.completionTokens||0),0),
   tokensUnknown:provider==='local'&&all.some(t=>(t.accounting?.requests||0)>0),
   trials:all.map(t=>({run:t.run,promptHash:t.promptHash,admitted:t.admitted,skipped:!!t.skipped,turns:t.turns,reasons:t.reasons,evidence:t.evidence}))}];
 }))}));
 const l=new Ledger(),entries=l.entries(),requestRows=entries.filter(e=>e.event==='request'),joined=new Map();for(const e of entries)if(e.event!=='refused')joined.set(e.id,{...joined.get(e.id),...e});
 const run2Requests=[...joined.values()].filter(e=>e.event!=='refused'&&e.at>='2026-11-21T04:19:37Z');
 const audited=audit(l),run2Payloads=audited.filter(a=>run2Requests.some(e=>e.id===a.id));
 const historyChecks=run2Payloads.map(a=>{const e=requestRows.find(e=>e.id===a.id),p=JSON.parse(fs.readFileSync(path.join(l.directory,e.payloadFile),'utf8'));
  const state=JSON.parse(p.messages[2].content);return {id:a.id,valid:p.messages.length===3&&p.messages[0].role==='system'&&Array.isArray(state.actionLog)&&state.actionLog.length<6&&state.actionLog.every(s=>!s.includes('\n'))};});
 const data={at:new Date().toISOString(),promptHash:PROMPT_HASH,tests:{command:'node --test tests/revision/agent',workerObservedPassed:testsPassed},sites,trials,
  ledger:l.totals(),run2Accounting:{requests:run2Requests.length,paid:run2Requests.filter(e=>e.paid).length,local:run2Requests.filter(e=>e.provider==='pc11').length,
   paidCostEstimate:run2Requests.filter(e=>e.paid).reduce((s,e)=>s+(e.costEstimate||e.reservedCost||0),0),unknownUsageRequests:run2Requests.filter(e=>!e.tokens).length},
  audit:{allPayloads:audited.length,allHashesValid:audited.every(a=>a.payloadHashValid),run2Payloads:run2Payloads.length,boundedHistoryValid:historyChecks.every(c=>c.valid),
   sensitiveResiduals:run2Payloads.filter(a=>Object.entries(a.sourceCues).some(([k,v])=>k!=='urls'&&v>0))},
  limitations:['W3C P4 and BBC policies skipped when final host differed; replacements pending.',
   'Books reference.json files contain an empty footer unit, rejected by the shared scorer; no units were silently removed.',
   'The local endpoint omitted usage; tokens are unknown, not zero.',
   'Python H1 substring is present but scorer token recall is 0.8 because available joins the author name without a whitespace boundary.',
   'Admission/use-time passes are not semantic clean passes; several draft-reference scores show remaining noise or order issues.',
   'Both pilot prompts and every rejected trial remain in the ledger; comparative rows select the current prompt, never the best admitted trial.'],
  codeHashes:Object.fromEntries(['extension/procedure-v3.js','backend/agent/loop.cjs','backend/agent/outline.cjs','backend/agent/runners.cjs','backend/agent/ledger.cjs'].map(f=>[f,hash(fs.readFileSync(path.join(ROOT,f)))]))};
 const lines=[],headings=[];function add(text,level){if(level)headings.push({text,level});lines.push(text);}
 const percent=v=>(100*v).toFixed(1)+'%';
 add('Visual Adapter — Development Run 2',0);add('Gate revision 7a, bounded history and local-model comparison',1);
 add(`Prompt SHA256: ${PROMPT_HASH}`);add(`Offline tests: ${testsPassed??'not recorded here'} passing (worker-observed). No commits, pushes or deployments.`);
 add(`Run 2: ${data.run2Accounting.paid} paid DeepSeek requests and ${data.run2Accounting.local} unpaid local requests; estimated paid cost $${data.run2Accounting.paidCostEstimate.toFixed(6)}.`);
 add(`Aggregate ledger: ${data.ledger.paidRequests}/250 development requests, $${data.ledger.dollars.toFixed(6)} of $5; request guard 2,000 total; pending ${data.ledger.pending}.`);
 add('Results and per-page scores',1);
 for(const s of sites){
  add(s.host,2);
  for(const key of keys){const r=s.policies[key];add(key,3);
   if(!r.provider){add('Not run.');continue;}
   add(`Status: ${r.skipped?'SKIPPED':r.admitted?'ADMITTED':'REJECTED'}; final trial turns ${r.turns}; all development trial requests ${r.totalRequests}. Reasons: ${(r.reasons||[]).join('; ')||'none'}.`);
   add(`Tokens, prompt/completion: ${r.tokensUnknown?'not reported by provider':r.totalPromptTokens+' / '+r.totalCompletionTokens}; trials ${r.totalTrials}.`);
   for(const p of r.heldOut||[]){add(`${p.page}: ${p.skipped?'skipped':p.fallback?'basic reader fallback':'own rule'}; ${p.reasons?.join('; ')||'no gate reason'}.`);
    add(p.scores?.available?`Content recall ${percent(p.scores.contentRecall)}; noise leakage ${percent(p.scores.noiseLeakage)}; clean pass ${p.scores.cleanPass}; no-fallback clean pass ${p.scores.noFallbackPass}.`:
     `Scores unavailable: ${p.scores?.error||p.scores?.reason||'page skipped'}${p.scores?.emptyUnits?.length?' ('+p.scores.emptyUnits.join(', ')+')':''}.`);
   }
   if(r.p3FirstLines?.length){add('p3 opening lines:');for(const line of r.p3FirstLines.slice(0,2))add(line);}
   if(r.admitted){add('Excluded selectors and first redacted cues:');for(const ex of r.excluded||[])add(`${ex.selector} | induction counts ${ex.counts.join('/')} | ${ex.firstCue||'[no text / no match]'}`);}
  }
 }
 add('Limitations and diagnosis',1);for(const item of data.limitations)add(item);
 add('Traceability and verification',1);add(`All ${data.audit.allPayloads} payload hashes verified: ${data.audit.allHashesValid}. Run 2 bounded history verified: ${data.audit.boundedHistoryValid}. Sensitive cue residuals detected: ${data.audit.sensitiveResiduals.length}. Host-only URL matches are permitted; names/plain usernames can remain.`);
 add('Run 1 evidence was moved under workspace/revision/dev-runs/archive with old/new path and hash receipts; no WP-C-generated runtime folders remain under backend. Raw captures and references were not edited.');
 const stamp=Date.now(),jsonFile=path.join(BASE,'run2-summary-'+stamp+'.json'),textFile=path.join(BASE,'run2-report-'+stamp+'.json');
 fs.writeFileSync(jsonFile,JSON.stringify(data,null,2),{flag:'wx'});fs.writeFileSync(textFile,JSON.stringify({title:lines[0],text:lines.join('\n')+'\n',headings},null,2),{flag:'wx'});
 console.log(JSON.stringify({jsonFile,textFile,sites:sites.map(s=>({site:s.host,...Object.fromEntries(keys.map(k=>{const r=s.policies[k];return [k,{admitted:r.admitted,skipped:r.skipped,turns:r.turns,tokens:[r.totalPromptTokens,r.totalCompletionTokens],unknown:r.tokensUnknown,reasons:r.reasons,passes:r.heldOut?.filter(p=>p.accepted).length}];}))})),ledger:data.ledger,run2:data.run2Accounting,audit:data.audit}));
 return {data,jsonFile,textFile};
}
if(require.main===module)summarize({testsPassed:Number(process.argv.find(a=>a.startsWith('--tests-passed='))?.slice(15))||null});module.exports={summarize};
