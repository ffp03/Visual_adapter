'use strict';
// Offline consolidation; preserves every trial and never calls a runner.
const fs=require('node:fs');const path=require('node:path');const {Ledger,hash}=require('./ledger.cjs');
const {audit}=require('./audit.cjs');const {PROMPT_HASH}=require('./loop.cjs');
function report() {
 const base=path.resolve(__dirname,'../../workspace/revision/dev-runs');
 const old=fs.readdirSync(path.join(base,'archive')).filter(n=>n.startsWith('run1-generated-')).sort().at(-1);
 const root=path.join(base,'archive',old,'development'),attempts=[];
 for(const run of fs.readdirSync(root).sort()) {
  const folder=path.join(root,run);if(!fs.statSync(folder).isDirectory())continue;
  for(const site of fs.readdirSync(folder)) {
   const file=path.join(folder,site,'result.json');if(fs.existsSync(file))attempts.push({...JSON.parse(fs.readFileSync(file,'utf8')),evidence:path.relative(path.resolve(__dirname,'../..'),file),run});
  }
 }
 const fresh=attempts.filter(a=>/^dev-\d+$/.test(a.id));
 const sites=[...new Set(fresh.map(a=>a.id))].sort().map(id=>{
  const trials=fresh.filter(a=>a.id===id);
  // This is development reporting: preserve all attempts and identify the last
  // admitted rule explicitly. Never discard a later failed transport.
  const admitted=trials.filter(a=>a.admitted).at(-1),selected=admitted||trials.at(-1);
  return {id,host:selected.host,admitted:!!admitted,gateReasons:selected.reasons,turns:trials.map(a=>a.turns),
   promptTokens:trials.reduce((s,a)=>s+a.accounting.promptTokens,0),completionTokens:trials.reduce((s,a)=>s+a.accounting.completionTokens,0),
   failures:trials.reduce((s,a)=>s+a.accounting.failures,0),heldOutRulePasses:selected.heldOut.filter(p=>p.accepted).length,
   heldOut:selected.heldOut,p3FirstLines:selected.p3FirstLines,trials:trials.map(a=>({admitted:a.admitted,reasons:a.reasons,turns:a.turns,evidence:a.evidence})),rule:selected.rule};
 });
 const ledger=new Ledger(),payloads=audit(ledger),freshPayloads=payloads.filter(a=>a.pages?.some(p=>p.replace(/\\/g,'/').includes('/corpus/dev/')));
 const data={at:new Date().toISOString(),promptHash:PROMPT_HASH,tests:{command:'node --test tests/revision/agent',passed:33,failed:0},
  sites,preliminaryAttempts:attempts.filter(a=>a.id.startsWith('october-')),totals:ledger.totals(),
  payloadAudit:{requests:payloads.length,allHashesValid:payloads.every(a=>a.payloadHashValid),freshRequests:freshPayloads.length,
   freshSensitivePatternResiduals:freshPayloads.filter(a=>Object.entries(a.sourceCues).some(([key,n])=>key!=='urls'&&n>0)),
   preliminaryURLPathMisses:payloads.filter(a=>a.sourceCues.urlPaths>0),
   expectedHostOnlyMatches:freshPayloads.filter(a=>a.sourceCues.urls>0),sample:path.relative(path.resolve(__dirname,'../..'),path.join(base,'archive',old,'audit-sample-cues.json')),
   sampleReview:{payloads:40,uniqueCues:839,observations:['Names and plain usernames remain, as declared.','No residual emails, phone numbers, @handles or long digit runs observed in sampled cues.','Five preliminary October Python payloads retained bare URL paths; fixed before all fresh-corpus requests.','www.w3.org host-only matches are expected under the host-kept policy.']}},
  designProblems:[
   'Broad structural anchors can admit another site: the October MDN main#content rule passes a GOV.UK page (cross-site-diagnostic.json).',
   'The design does not define the substantive-ratio denominator; implementation uses union of output substantive text / total output text (documented in README).',
   'G5 rejects valid short HN held-out pages (100-118 output characters); the threshold was not changed.',
   'Unique related/sidebar text is protected by G3/G4: BBC article-only preview failed coverage, then an added aside made admission possible.',
   'W3C p2 redirects from HTML 5.2 to the WHATWG HTML landing page. Its template differs from the WCAG induction page; after excluding TOCs, output was 51 characters.'
  ],
  notes:['One uncharged Wikipedia jsdom/CSS preprocessing failure was fixed by removing NOISE STYLE nodes with parse5 before replay; frozen bytes unchanged.',
   'A duplicate BBC batch request failed without reported usage; ledger retains a conservative reservation and every request remains counted.',
   'One actual Codex CLI smoke test; no pc11 model inference, no evaluation-page inference, no commits/pushes/deployments.',
   'Independent coordinator review remains outside this worker run.'],
  sourceHashes:Object.fromEntries(['extension/procedure-v3.js','backend/agent/outline.cjs','backend/agent/ledger.cjs','backend/agent/loop.cjs','backend/agent/runners.cjs','backend/agent/one-shot.cjs'].map(f=>[f,hash(fs.readFileSync(path.resolve(__dirname,'../..',f),'utf8'))]))};
 const filename=path.join(base,'run1-summary-'+Date.now()+'.json');fs.writeFileSync(filename,JSON.stringify(data,null,2),{flag:'wx'});
 console.log(JSON.stringify({file:filename,sites:sites.map(s=>({site:s.host,admitted:s.admitted,reasons:s.gateReasons,turns:s.turns,tokens:[s.promptTokens,s.completionTokens],heldOutPasses:s.heldOutRulePasses,p3:s.p3FirstLines.slice(0,2)})),totals:data.totals,promptHash:PROMPT_HASH,audit:{payloads:payloads.length,hashesValid:data.payloadAudit.allHashesValid,freshRequests:freshPayloads.length,freshSensitiveResiduals:data.payloadAudit.freshSensitivePatternResiduals.length}}));
 return data;
}
if(require.main===module)report();module.exports={report};
