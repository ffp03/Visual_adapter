'use strict';
const fs=require('node:fs'),path=require('node:path');
const {run}=require('../../tests/revision/eval/scoreboard.cjs');
const {summarize,pairedDifference}=require('../../tests/revision/eval/stats.cjs');
const {Ledger,hash}=require('./ledger.cjs'),agent=require('./capability-run.cjs');
const BASE='workspace/revision/dev-runs/run7';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const lines=file=>fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(JSON.parse);
const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'});
const final=()=>{const pointer=read(BASE+'/final.json');return{pointer,context:read(pointer.contextFile),state:read(pointer.iterationFile)};};
const brief=summary=>Object.fromEntries(Object.entries(summary.policies).map(([p,v])=>[p,{
 clean:v.measures.cleanPass.estimate,recall:v.measures.contentRecall.estimate,noise:v.measures.noiseLeakage.estimate,own:v.measures.noFallbackPass.estimate,failures:v.failures
}]));
function scoreFinal(){
 const {context,state}=final(),rows=lines(path.join(state.output,'rows.jsonl'));
 for(const policy of ['P4-off','P4-on','P4-local','P3']){
  const selected=rows.filter(r=>r.policy===policy);
  if(selected.length!==36||new Set(selected.map(r=>r.id)).size!==36)throw Error('incomplete-final-policy:'+policy);
  if(selected.some(r=>r.promptHash!==state.promptHash||r.viewsHash!==state.viewsHash||r.gateHash!==state.gateHash))throw Error('final-policy-config-mismatch:'+policy);
 }
 const directory='workspace/revision/results/run7-final-score-'+Date.now();
 const result=run(context.manifest,[context.baselineFolder,state.output],{outputDirectory:directory});
 save(BASE+'/final-score.json',{directory,rows:result.rows.length,promptHash:state.promptHash,viewsHash:state.viewsHash});
 console.log(JSON.stringify({directory,metrics:brief(result.summary)}));
}
function prepareConfirmation(){
 const {context,state}=final(),plan=read(BASE+'/confirmation-plan.json'),totals=new Ledger().totals();
 if(fs.existsSync(path.join(context.directory,'STOP.json')))throw Error('campaign-stopped');
 if(totals.pending||totals.devRequests>670)throw Error('confirmation-reserve-or-pending');
 const ids=new Set(plan.sites.map(s=>s.id)),manifest=read(context.manifest),targets=new Set(plan.sites.flatMap(s=>s.targets));
 const manifestFile=path.join(context.directory,'confirmation-manifest.json');
 save(manifestFile,{...manifest,pages:manifest.pages.filter(p=>targets.has(p.id)),scope:'Predeclared development repeatability subset, not unseen evaluation'});
 const confirmed={...context,tuningDevCap:700,confirmation:true,sites:context.sites.filter(s=>ids.has(s.id)),manifest:manifestFile};
 const contextFile=path.join(context.directory,'context-confirmation.json');save(contextFile,confirmed);
 const confirmationState=agent.iteration(confirmed,5,fs.readFileSync(BASE+'/iteration2-guidance.txt','utf8'));
 if(confirmationState.promptHash!==state.promptHash||confirmationState.viewsHash!==state.viewsHash||confirmationState.gateHash!==state.gateHash)throw Error('confirmation-config-mismatch');
 save(BASE+'/confirmation.json',{contextFile,iterationFile:path.join(confirmationState.folder,'iteration.json'),ledgerBefore:totals});
 console.log(JSON.stringify({contextFile,sites:confirmed.sites.map(s=>s.host),maxRequests:plan.maxPaidRequests}));
}
function scoreConfirmation(){
 const pointer=read(BASE+'/confirmation.json'),context=read(pointer.contextFile),state=read(pointer.iterationFile),rows=lines(path.join(state.output,'rows.jsonl'));
 if(rows.length!==15)throw Error('incomplete-confirmation');
 const directory='workspace/revision/results/run7-confirmation-score-'+Date.now();
 const result=run(context.manifest,[context.baselineFolder,state.output],{outputDirectory:directory});
 save(BASE+'/confirmation-score.json',{directory,rows:result.rows.length,
  paidRequests:new Ledger().totals().devRequests-pointer.ledgerBefore.devRequests});
 console.log(JSON.stringify({directory,metrics:brief(result.summary)}));
}
function compareConfirmation(){
 const main=read(BASE+'/final-score.json'),confirm=read(BASE+'/confirmation-score.json'),original=lines(path.join(main.directory,'rows.jsonl')),repeated=lines(path.join(confirm.directory,'rows.jsonl'));
 const ids=new Set(repeated.map(r=>r.id)),a=original.filter(r=>r.policy==='P4-off'&&ids.has(r.id)),b=repeated.filter(r=>r.policy==='P4-off').map(r=>({...r,policy:'P4-off-confirm'}));
 const comparison=pairedDifference([...a,...b],'P4-off-confirm','P4-off');
 save(BASE+'/confirmation-comparison.json',{original:summarize(a),repeated:summarize(b),comparison});
 console.log(JSON.stringify(Object.fromEntries(['cleanPass','contentRecall','noiseLeakage'].map(k=>[k,comparison.measures[k]]))));
}
if(require.main===module){const phase=process.argv[2];if(phase==='score-final')scoreFinal();else if(phase==='prepare-confirmation')prepareConfirmation();else if(phase==='score-confirmation')scoreConfirmation();else if(phase==='compare-confirmation')compareConfirmation();else throw Error('unknown-phase');}
module.exports={scoreFinal,prepareConfirmation,scoreConfirmation,compareConfirmation,brief};
