'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const freeze=require('./eval-freeze.cjs'),harness=require('./eval-run.cjs'),{Ledger}=require('./ledger.cjs');
const {htmlText}=require('../../tests/revision/eval/score.cjs');
const WORK=path.join(freeze.ROOT,'workspace/revision/evaluation');
function service(service,phase,{directory,reason}={}){
 const event={operation_id:'wp-e1-eval02-'+service,service,agent:'codex',session:'WP-E1',task:'Visual_adapter / evaluation freeze and one-site sample',operation:'Frozen eval-02 policy sample',phase,account:'unavailable',service_project:service==='arbutus-cloud'?'local Qwen3.8-27B-abliterated':service==='codex'?'ChatGPT authenticated extraction-only':'DeepSeek Flash',request_id:directory?path.basename(directory):'unavailable',error_code:reason||'unavailable'};
 fs.mkdirSync(path.join(WORK,'service-input'),{recursive:true});const input=path.join(WORK,'service-input',service+'-'+phase+'-'+Date.now()+'.json');harness.json(input,event);
 const skill=path.join(process.env.USERPROFILE,'.agents/skills/service-use'),python=path.join(skill,'.venv/Scripts/python.exe');
 const r=spawnSync(python,[path.join(skill,'scripts/service_log.py'),'record','--project-root',freeze.ROOT,'--input',input],{encoding:'utf8',windowsHide:true});
 if(r.status!==0)throw Error('service-local-record-failed:'+service+':'+r.status);
}
async function run({deadline=Date.parse('2026-11-21T12:01:00Z')}={}){
 const verified=freeze.verify(),stateFile=path.join(WORK,'eval-02-sample.json');let state;
 if(fs.existsSync(stateFile))state=JSON.parse(fs.readFileSync(stateFile));
 else {state={startedAt:new Date().toISOString(),freezeSha256:verified.sha256,siteId:'eval-02',policies:{}};harness.json(stateFile,state);}
 if(state.freezeSha256!==verified.sha256||state.siteId!=='eval-02')throw Error('sample-state-freeze-mismatch');
 // Append-only policy events survive an orchestration crash before final receipt.
 const journal=path.join(WORK,'eval-02-sample-events.jsonl'),events=harness.lines(journal),dirs={...state.policies};
 for(const e of events)if(e.event==='policy-directory')dirs[e.policy]=e.directory;
 const append=e=>fs.appendFileSync(journal,JSON.stringify({at:new Date().toISOString(),...e})+'\n');
 for(const policy of harness.POLICIES){
  if(Date.now()>=deadline)throw Error('sample-time-cap');
  const provider=policy==='P4-local'?'arbutus-cloud':policy==='P4-Codex'?'codex':!['P0','P1'].includes(policy)&&!policy.startsWith('P2-nr')?'deepseek-api':null;
  if(provider&&!harness.lines(journal).some(e=>e.event==='service-start'&&e.provider===provider)){
   service(provider,'started');append({event:'service-start',provider});
  }
  if(!dirs[policy]){dirs[policy]=harness.newRun(policy,['eval-02'],verified);append({event:'policy-directory',policy,directory:dirs[policy]});}
  const result=await harness.runPolicy({policy,siteIds:['eval-02'],directory:dirs[policy],sourceDirectory:policy==='P2-nr-fresh'?dirs['P2-fresh']:policy==='P2-nr-shared'?dirs['P2-shared']:undefined,deadline});
  append({event:'policy-result',...result});
  if(result.stopped){if(provider)service(provider,'partial',{directory:result.directory,reason:result.stopped});throw Error('sample-stopped:'+policy+':'+result.stopped);}
 }
 const scored=require('./eval-score.cjs').run({siteIds:['eval-02'],directories:Object.values(dirs)});
 const ledger=new Ledger(),requests=ledger.entries().filter(e=>e.event==='request'&&e.experiment?.startsWith('evaluation:')&&Object.values(dirs).some(d=>e.experiment.endsWith(path.basename(d))));
 if(requests.some(e=>e.site!=='fastapi.tiangolo.com'||e.pageIds.some(id=>!id.startsWith('eval-02-'))))throw Error('sample-read-another-site');
 const p2Hash=require('./one-shot.cjs').PROMPT_HASH;
 if(requests.some(e=>e.promptHash!==(e.experimentPolicy.startsWith('P2')?p2Hash:verified.freeze.promptSha256)))throw Error('sample-prompt-hash-mismatch');
 if(ledger.totals().pending!==0)throw Error('sample-pending-requests');
 const content=[];
 for(const [policy,dir] of Object.entries(dirs))for(const row of harness.lines(path.join(dir,'rows.jsonl'))){
  const html=fs.readFileSync(path.join(dir,row.outputFile),'utf8'),text=htmlText(html);
  content.push({policy,id:row.id,ok:row.ok,fallback:row.fallback,characters:text.length,firstText:text.slice(0,260),lastText:text.slice(-160),outputSha256:row.outputSha256});
 }
 const timings=Object.fromEntries(Object.entries(dirs).map(([policy,dir])=>[policy,JSON.parse(fs.readFileSync(path.join(dir,'sites/eval-02/complete.json')))]));
 const result={startedAt:state.startedAt,finishedAt:new Date().toISOString(),freezeSha256:verified.sha256,siteId:'eval-02',directories:dirs,scoreDirectory:scored.directory,timings,content,
  modelRequests:requests.length,paidRequests:requests.filter(r=>r.paid).length,ledgerAfter:ledger.totals(),
  applicability:{status:'deferred',reason:'Real cross-site applicability needs another evaluation site DOM; sample explicitly forbids other-site page reads. Harness is implemented and tested offline; no synthetic result is presented as cross-site evidence.'}};
 harness.json(path.join(WORK,'eval-02-sample-complete-'+Date.now()+'.json'),result);
 for(const provider of ['deepseek-api','arbutus-cloud','codex'])service(provider,'succeeded',{directory:scored.directory});
 console.log(JSON.stringify({event:'sample-complete',scoreDirectory:scored.directory,freezeSha256:verified.sha256,requests:requests.length,paidRequests:result.paidRequests,ledger:result.ledgerAfter}));return result;
}
module.exports={run,service};
if(require.main===module)run().catch(e=>{console.error(e.stack);process.exitCode=1;});
