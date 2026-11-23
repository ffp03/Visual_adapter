'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {isDeepStrictEqual}=require('node:util');
const freeze=require('./eval-freeze.cjs'),{Ledger,hash,BoundaryError}=require('./ledger.cjs'),{PageRegistry}=require('./pages.cjs');
const baseline=require('./baselines.cjs'),{runLoop}=require('./loop.cjs'),{oneShot}=require('./one-shot.cjs');
const {DeepSeekRunner,LocalRunner,CodexRunner}=require('./runners.cjs');
const v3=require('../../extension/procedure-v3.js');
const {executeBounded}=require('../../tests/revision/eval/bounded.cjs');
const POLICIES=Object.freeze(['P0','P1','P2-fresh','P2-shared','P2-nr-fresh','P2-nr-shared','P3','P4-on','P4-off','P4-cue0','P4-full','P4-local','P4-Codex']);
const emit=e=>console.log(JSON.stringify({at:new Date().toISOString(),...e}));
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'});
const lines=file=>fs.existsSync(file)?fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(JSON.parse):[];
class EvaluationRegistry extends PageRegistry{
 constructor({root=freeze.ROOT,siteId}={}){super({root});this.siteId=siteId;}
 resolve(id,policy='eval'){
  if(!['eval','evaluation'].includes(policy))throw new BoundaryError('evaluation-registry-policy-required');
  if(this.siteId&&!id.startsWith(this.siteId+'-'))throw new BoundaryError('evaluation-cross-site-read-refused:'+id);
  return super.resolve(id,policy);
 }
 records(ids,policy='eval'){return super.records(ids,policy);}
 load(id,policy='eval'){return super.load(id,policy);}
}
class EvaluationLedger extends Ledger{
 constructor({siteId,policy,experiment,root=freeze.ROOT,deadline=Infinity}={}){
  super({root});this.registry=new EvaluationRegistry({root,siteId});this.label=policy;this.experiment=experiment;this.siteId=siteId;this.deadline=deadline;this.lastTransportFailure=null;
 }
 checkDeadline(){if(Date.now()>=this.deadline)throw new BoundaryError('evaluation-deadline');}
 guard(info){this.checkDeadline();const records=super.guard(info);this.checkDeadline();return records;}
 async run(runner,messages,metadata={}){
  this.checkDeadline();
  const allowed=this.label==='P3'?[this.siteId+'-p3']:this.label==='P2-fresh'?[3,4,5].map(i=>this.siteId+'-p'+i):this.label==='P2-shared'?[this.siteId+'-p1']:[1,2].map(i=>this.siteId+'-p'+i);
  if(!metadata.pageIds?.length||metadata.pageIds.some(id=>!allowed.includes(id)))throw new BoundaryError('evaluation-induction-scope');
  // Check again at dispatch: reservation/file I/O can itself cross the deadline.
  const guarded=Object.create(runner);
  guarded.payload=m=>runner.payload?runner.payload(m):{model:runner.model||'scripted',messages:m};
  guarded.generate=(messages,context)=>{this.checkDeadline();context.checkDeadline=()=>this.checkDeadline();return runner.generate(messages,context);};
  try{return await super.run(guarded,messages,{...metadata,policy:'eval',experimentPolicy:this.label,experiment:this.experiment});}
  catch(error){if(error.transportCause)this.lastTransportFailure=error.transportCause;throw error;}
 }
}
function accounting(ledger,experiment,site){
 const requests=new Map();
 for(const e of ledger.entries()){
  if(e.event==='request'&&e.experiment===experiment&&e.site===site)requests.set(e.id,e);
  else if(requests.has(e.id))requests.set(e.id,{...requests.get(e.id),...e});
 }
 const values=[...requests.values()];
 return {modelRequests:values.length,promptTokens:values.reduce((s,e)=>s+(e.tokens?.prompt||0),0),completionTokens:values.reduce((s,e)=>s+(e.tokens?.completion||0),0),cachedTokens:values.reduce((s,e)=>s+(e.tokens?.cached||0),0),costEstimate:values.reduce((s,e)=>s+(e.costEstimate??e.reservedCost??0),0),unknownUsageRequests:values.filter(e=>!e.tokens).length,requestIds:values.map(e=>e.id)};
}
function reconcile(ledger,experiment,site){
 const requests=new Map();
 for(const e of ledger.entries()){
  if(e.event==='request'&&e.experiment===experiment&&e.site===site)requests.set(e.id,e);
  else if(requests.has(e.id))requests.set(e.id,{...requests.get(e.id),...e});
 }
 for(const e of requests.values())if(e.outcome==='started')ledger.settle(e.id,{outcome:'provider-error',reason:'interrupted-request-not-retried',costEstimate:e.reservedCost||0,costBasis:'conservative-reservation-interrupted',latencyMs:null});
 return requests.size;
}
function targets(site,policy){return policy==='P3'?[site.pages[2]]:policy.endsWith('shared')?site.pages.slice(1):site.pages.slice(2);}
function writeRow(directory,row,html){
 const outputFile=row.id+'-'+row.policy+'.html',file=path.join(directory,outputFile);
 // An interrupted HTML write is retained if identical; never overwrite evidence.
 if(fs.existsSync(file)){if(hash(fs.readFileSync(file))!==hash(html))throw Error('orphan-output-differs:'+outputFile);}
 else fs.writeFileSync(file,html,{flag:'wx'});
 const complete={...row,outputFile,outputSha256:hash(html)};
 fs.appendFileSync(path.join(directory,'rows.jsonl'),JSON.stringify(complete)+'\n');return complete;
}
function outputRoot(root){return path.join(root,'workspace/revision/results');}
function newRun(policy,siteIds,verified,{root=freeze.ROOT}={}){
 const results=outputRoot(root);fs.mkdirSync(results,{recursive:true});
 for(const entry of fs.readdirSync(results,{withFileTypes:true})){
  if(!entry.isDirectory()||!entry.name.startsWith('eval-'+policy+'-'))continue;
  const prior=path.join(results,entry.name),file=path.join(prior,'run.json');if(!fs.existsSync(file))continue;
  const config=JSON.parse(fs.readFileSync(file));
  if(config.policy===policy&&config.freezeSha256===verified.sha256&&siteIds.some(id=>config.siteIds.includes(id)))throw Error('evaluation-existing-site-use-resume:'+prior);
 }
 const directory=path.join(outputRoot(root),'eval-'+policy+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,6));
 fs.mkdirSync(path.join(directory,'sites'),{recursive:true});
 json(path.join(directory,'run.json'),{schemaVersion:1,policy,siteIds,freezeSha256:verified.sha256,startedAt:new Date().toISOString(),experiment:'evaluation:'+policy+':'+path.basename(directory),siteConcurrency:1});
 return directory;
}
function runnerFor(policy,ledger){
 if(policy==='P4-local')return new LocalRunner({ledger});
 if(policy==='P4-Codex'){
  // Extraction-only uniform JSON-action transport uses codex-runner.cjs's
  // credential allowlist. Pin the model instead of inheriting its v2 default.
  const runner=new CodexRunner({ledger,timeoutMs:180000});runner.model='gpt-6.1-sol';runner.effort='medium';return runner;
 }
 return new DeepSeekRunner({ledger,thinking:!['P2-fresh','P2-shared','P3','P4-off'].includes(policy)});
}
function trialRecord(result,check){
 return {check,accepted:result.accepted,reason:result.reason||null,reasons:result.reasons||[],rule:result.rule||null,turns:result.turns||0,accounting:result.accounting||null,history:result.history||[],promptHash:result.promptHash,inductionMedianRatio:result.inductionMedianRatio,
  fatal:result.fatal||false,error:result.error||null,gate:result.gate?{accepted:result.gate.accepted,reasons:result.gate.reasons,advisory:result.gate.advisory,pages:result.gate.pages.map(p=>({accepted:p.accepted,reasons:p.reasons,advisory:p.advisory,textLength:p.textLength,html:p.html,uniqueCoverage:p.uniqueCoverage?.ratio,g6:p.g6?{baseline:p.g6.baseline,protected:p.g6.protected,preserved:p.g6.preserved}:null}))}:null};
}
async function runPolicy({policy,siteIds,directory,sourceDirectory,deadline=Date.now()+120*60000,runnerFactory=runnerFor,root=freeze.ROOT,onEvent=emit}={}){
 if(!POLICIES.includes(policy))throw Error('unknown-evaluation-policy');
 if(!Number.isFinite(deadline))throw Error('evaluation-invalid-deadline');
 const verified=freeze.verify({root});
 const options={policy,siteIds,directory,sourceDirectory,deadline,runnerFactory,root,onEvent};
 if(verified.freeze.schemaVersion===1)return runVerifiedPolicy(verified,options);
 if(sourceDirectory!==undefined||policy.startsWith('P2-nr'))throw Error('v6-source-or-carry-refused');
 const work=path.join(root,'workspace/revision/evaluation/v6'),owner=path.join(work,'generation.lock'),archive=path.join(work,'lock-receipts');
 fs.mkdirSync(archive,{recursive:true});
 let fd;
 try{fd=fs.openSync(owner,'wx');}
 catch(error){if(error.code==='EEXIST')throw Error('v6-generation-locked');throw error;}
 try{
  fs.writeSync(fd,JSON.stringify({pid:process.pid,policy,at:new Date().toISOString()}));
  return await runVerifiedPolicy(verified,options);
 }finally{
  fs.closeSync(fd);
  fs.renameSync(owner,path.join(archive,crypto.randomUUID()+'.json'));
 }
}
async function runVerifiedPolicy(verified,{policy,siteIds,directory,sourceDirectory,deadline,runnerFactory,root,onEvent}){
 const check=verified.freeze.settings.check||'gate',agentPolicy=policy.startsWith('P4')||policy==='P3';
 const v6=verified.freeze.schemaVersion===2;
 const baselineCache=path.join(root,'workspace/revision/evaluation',v6?path.join('v6','baseline-cache',verified.sha256):'baseline-cache');
 if(!Array.isArray(siteIds)||!siteIds.length||new Set(siteIds).size!==siteIds.length)throw Error('named-sites-required');
 const sites=siteIds.map(id=>{const s=verified.manifest.sites.find(s=>s.siteId===id);if(!s)throw Error('unknown-evaluation-site:'+id);return s;});
 if(policy==='P4-Codex'&&siteIds.some(id=>!verified.freeze.execution.Codex.siteIds.includes(id)))throw Error('Codex-outside-frozen-ten-site-subset');
 directory=directory?path.resolve(directory):newRun(policy,siteIds,verified,{root});
 if(!directory.startsWith(outputRoot(root)+path.sep))throw Error('evaluation-output-outside-results');
 const config=JSON.parse(fs.readFileSync(path.join(directory,'run.json')));
 if(v6&&(['carriedFrom','carriedFromFreezeSha256','carryRecordSha256'].some(key=>Object.hasOwn(config,key))||fs.existsSync(path.join(directory,'carry.json'))))throw Error('v6-source-or-carry-refused');
 if(config.policy!==policy||config.freezeSha256!==verified.sha256||JSON.stringify(config.siteIds)!==JSON.stringify(siteIds))throw Error('resume-configuration-mismatch');
 const owner=path.join(directory,'run.lock');let lock;
 if(fs.existsSync(owner)){
  const previous=JSON.parse(fs.readFileSync(owner));let alive=true;
  if(!Number.isSafeInteger(previous.pid)||previous.pid<1)throw Error('evaluation-lock-owner-invalid');
  try{process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
  if(alive)throw Error('evaluation-run-locked:owner-alive');
  const archive=path.join(directory,'lock-receipts');fs.mkdirSync(archive,{recursive:true});fs.renameSync(owner,path.join(archive,'interrupted-'+crypto.randomUUID()+'.json'));
 }
 let stopped=null;
 try{
  try{lock=fs.openSync(owner,'wx');}
  catch(e){if(e.code==='EEXIST')throw Error('evaluation-run-locked:inspect-owner-before-resuming');throw e;}
  const lockRecord=JSON.stringify({pid:process.pid,at:new Date().toISOString()});
  if(fs.writeSync(lock,lockRecord)!==Buffer.byteLength(lockRecord))throw Error('evaluation-lock-write-incomplete');
  for(const site of sites){
   if(Date.now()>=deadline){stopped='time-cap';break;}
   const siteDir=path.join(directory,'sites',site.siteId);fs.mkdirSync(siteDir,{recursive:true});
   if(fs.existsSync(path.join(siteDir,'complete.json'))){onEvent({event:'site-already-complete',policy,siteId:site.siteId});continue;}
   const started=performance.now(),ledger=new EvaluationLedger({siteId:site.siteId,policy,experiment:config.experiment,root,deadline}),registry=ledger.registry;
   const scope=targets(site,policy),rows=lines(path.join(directory,'rows.jsonl')).filter(r=>r.siteId===site.siteId),done=new Set(rows.map(r=>r.id));
   const startFile=path.join(siteDir,'start.json'),interrupted=fs.existsSync(startFile);
   if(interrupted)reconcile(ledger,config.experiment,site.host);
   else json(startFile,{startedAt:new Date().toISOString(),policy,siteId:site.siteId,targets:scope.map(p=>p.id),ledgerBefore:ledger.totals()});
   onEvent({event:'site-start',policy,siteId:site.siteId,interrupted});
   let runner=null,trial=null,reason=interrupted?'interrupted-site-not-retried':null,candidateTrials=[],fatal=null;
   if(interrupted&&policy==='P2-fresh')candidateTrials=site.pages.map(p=>{const f=path.join(siteDir,p.id+'-candidate.json');return fs.existsSync(f)?{id:p.id,...JSON.parse(fs.readFileSync(f))}:null;}).filter(Boolean);
   if(interrupted&&policy==='P2-shared'&&fs.existsSync(path.join(siteDir,'trial.json')))candidateTrials=[{id:site.pages[0].id,...JSON.parse(fs.readFileSync(path.join(siteDir,'trial.json')))}];
   const timer=setTimeout(()=>{fatal='time-cap';runner?.close();},Math.max(1,deadline-Date.now()));
   const beforeAccounted=Object.fromEntries(['modelRequests','promptTokens','completionTokens','cachedTokens','costEstimate','unknownUsageRequests'].map(k=>[k,rows.reduce((s,r)=>s+(r[k]||0),0)]));
   const accountedRequestIds=new Set(rows.flatMap(r=>r.requestIds||[]));
   let charged=false;
   const save=async(page,result,{fallbackAllowed=false,charge=false,promptHash=verified.freeze.promptSha256,extra={}}={})=>{
    const deliveryStarted=performance.now();
    const canonical=registry.resolve(page.id);let html=result.html||'',fallback=false;
    if(!result.ok&&fallbackAllowed){const b=await baseline.fromRecord('P0',canonical,{cacheDirectory:baselineCache});html=b.html;fallback=true;}
    const account=charge?accounting(ledger,config.experiment,site.host):{};
    if(charge)for(const key of Object.keys(beforeAccounted))account[key]-=beforeAccounted[key];
    if(charge){account.requestIds=account.requestIds.filter(id=>!accountedRequestIds.has(id));for(const id of account.requestIds)accountedRequestIds.add(id);}
    const row=writeRow(directory,{id:page.id,site:site.host,siteId:site.siteId,policy,ok:result.ok===true,reason:result.ok?null:result.reason||'runtime-error',fallback,
     modelRequests:account.modelRequests||0,promptTokens:account.promptTokens||0,completionTokens:account.completionTokens||0,cachedTokens:account.cachedTokens||0,costEstimate:account.costEstimate||0,
     unknownUsageRequests:account.unknownUsageRequests||0,requestIds:account.requestIds||[],sourceSha256:canonical.sha256,referenceSha256:page.referenceSha256,promptHash,freezeSha256:verified.sha256,latencyMs:(result.latencyMs||0)+performance.now()-deliveryStarted,...(agentPolicy?{check}:{}),...(!result.ok&&ledger.lastTransportFailure?{transportCause:ledger.lastTransportFailure}:{}),...extra},html);
    done.add(page.id);onEvent({event:'output',policy,id:page.id,ok:row.ok,fallback,modelRequests:row.modelRequests});return row;
   };
   try{
    if(!interrupted&&!['P0','P1'].includes(policy)&&!policy.startsWith('P2-nr')){
     runner=runnerFactory(policy,ledger);ledger.checkDeadline();if(policy==='P4-local')await runner.configure({checkDeadline:()=>ledger.checkDeadline()});if(policy==='P4-Codex')runner.checkLogin();
     if(agentPolicy){
      trial=await runLoop({pageIds:(policy==='P3'?[site.pages[2]]:site.pages.slice(0,2)).map(p=>p.id),policy:'eval',mode:policy==='P3'?'P3':'P4',runner,ledger,site:site.host,
       cueLength:policy==='P4-cue0'?0:policy==='P4-full'?'full':60,maxTurns:6,systemPrompt:fs.readFileSync(path.join(root,verified.freeze.promptFile),'utf8'),onEvent,check,
       provenance:{settingsHash:hash(verified.freeze.settings),gateHash:verified.freeze.files['extension/procedure-v3.js'],viewsHash:verified.freeze.settled?.viewsHash||verified.freeze.files['backend/agent/outline.cjs']}});
      json(path.join(siteDir,'trial.json'),trialRecord(trial,check));if(trial.fatal)fatal=trial.error||'fatal-provider-error';
     }else if(policy==='P2-shared'){
      const r=await oneShot({pageId:site.pages[0].id,runner,ledger,policy:'eval'});candidateTrials.push({id:site.pages[0].id,...r});trial=r;
      if(r.accepted){trial={...r,compiled:executeBounded('compile',registry.resolve(site.pages[0].id),r.rule,{timeoutMs:120000})};}
      json(path.join(siteDir,'trial.json'),trial);
     }
    }
    let source;
    if(policy.startsWith('P2-nr')){
     if(!sourceDirectory)throw Error('P2-nr-needs-original-output-directory');
     const sourceConfig=JSON.parse(fs.readFileSync(path.join(sourceDirectory,'run.json'))),expected=policy==='P2-nr-fresh'?'P2-fresh':'P2-shared';
     if(sourceConfig.policy!==expected||sourceConfig.freezeSha256!==verified.sha256||!sourceConfig.siteIds.includes(site.siteId))throw Error('P2-nr-source-binding');
     if(!fs.existsSync(path.join(sourceDirectory,'sites',site.siteId,'complete.json')))throw Error('P2-nr-source-site-not-complete');
     const sourceFolder=path.join(sourceDirectory,'sites',site.siteId),complete=JSON.parse(fs.readFileSync(path.join(sourceFolder,'complete.json'))),candidateBytes=fs.readFileSync(path.join(sourceFolder,'candidates.json'));
     if(complete.freezeSha256!==verified.sha256||complete.evidenceHashes?.['candidates.json']!==hash(candidateBytes))throw Error('P2-nr-candidate-hash-mismatch');
     source=JSON.parse(candidateBytes);
    }
    for(const page of scope){
     if(done.has(page.id))continue;
     const tick=performance.now();let result,extra={},promptHash=verified.freeze.promptSha256;
     if(interrupted||fatal)result={ok:false,html:'',reason:reason||fatal};
     else if(policy==='P1')result=await require('../../tests/revision/eval/policies/p1-reader-view.cjs').fromRecord(registry.resolve(page.id));
     else if(policy==='P0')result=await baseline.fromRecord(policy,registry.resolve(page.id),{cacheDirectory:v6?path.join(baselineCache,'P0'):baselineCache});
     else if(policy.startsWith('P2-nr')){
      const original=source.find(t=>t.id===(policy.endsWith('shared')?site.pages[0].id:page.id));
      if(!original){result={ok:false,html:'',reason:'interrupted-original-no-candidate'};promptHash=require('./one-shot.cjs').PROMPT_HASH;}
      else {
      promptHash=original.promptHash;result=original.accepted?executeBounded('P2-nr',registry.resolve(page.id),original.rule,{timeoutMs:120000}):{ok:false,reason:original.reason||'invalid',html:''};
      extra={replayedFrom:path.resolve(sourceDirectory),candidateLedgerId:original.ledgerId||null};
      }
     }else if(policy==='P2-fresh'){
      const r=await oneShot({pageId:page.id,runner,ledger,policy:'eval'});candidateTrials.push({id:page.id,...r});
      // Persist every candidate before compilation so an interruption cannot lose it.
      json(path.join(siteDir,page.id+'-candidate.json'),r);promptHash=r.promptHash;
      result=r.accepted?executeBounded('P2',registry.resolve(page.id),r.rule,{timeoutMs:120000}):{ok:false,reason:r.reason,html:''};
     }else if(policy==='P2-shared'){
      promptHash=trial.promptHash;result=trial.accepted&&trial.compiled.ok?executeBounded('P2',registry.resolve(page.id),trial.rule,{procedure:trial.compiled.procedure,timeoutMs:120000}):{ok:false,reason:trial.reason||trial.compiled?.reason||'invalid',html:''};
     }else{
      if(!trial.accepted)result={ok:false,reason:trial.reasons?.join(';')||trial.reason||'gate-rejected',html:''};
      else{
       let verdict;
       if(policy==='P3'&&check!=='output')verdict=trial.gate.pages[0];
       else{
        const dom=registry.load(page.id);
        try{verdict=v3.useTime(dom.window.document,trial.rule,undefined,{check});}
        finally{dom.window.close();}
       }
       result={ok:verdict.accepted,html:verdict.html,reason:verdict.reasons.join(';')||'not-applicable'};
       if(verdict.advisory)extra={advisory:policy==='P3'?[...new Set([...trial.gate.pages[0].advisory,...verdict.advisory])]:verdict.advisory};
      }
     }
     const charge=policy==='P2-fresh'||!charged&&!policy.startsWith('P2-nr')&&!['P0','P1'].includes(policy);
     // Fresh requests are charged once per page; other inductions once per site.
     if(policy==='P2-fresh'){
      const prior=lines(path.join(directory,'rows.jsonl')).filter(r=>r.siteId===site.siteId);
      for(const k of Object.keys(beforeAccounted))beforeAccounted[k]=prior.reduce((s,r)=>s+(r[k]||0),0);
     }
     const includeInduction=charge&&(policy.startsWith('P4')||policy==='P3'||policy==='P2-shared');
     await save(page,{...result,latencyMs:performance.now()-(includeInduction?started:tick)},{fallbackAllowed:policy.startsWith('P4')||policy==='P3',charge,promptHash,extra});
     if(charge)charged=true;
    }
   }catch(error){
    if(error.transportCause)ledger.lastTransportFailure=error.transportCause;
    reason=error.message;fatal=error.fatal?reason:fatal;onEvent({event:'site-error',policy,siteId:site.siteId,reason});
    for(const page of scope)if(!done.has(page.id)){
     await save(page,{ok:false,html:'',reason:'runtime-error:'+reason},{fallbackAllowed:policy.startsWith('P4')||policy==='P3',charge:!charged&&!policy.startsWith('P2-nr')});charged=true;
    }
    // Configuration/freeze/replay errors must stop, not become an apparent normal run.
    if(/freeze|P2-nr|scope|binding/.test(reason))fatal=reason;
   }finally{clearTimeout(timer);runner?.close();}
   if(!fs.existsSync(path.join(siteDir,'candidates.json')))json(path.join(siteDir,'candidates.json'),candidateTrials);
   const evidenceHashes=Object.fromEntries(fs.readdirSync(siteDir).filter(f=>f.endsWith('.json')).sort().map(f=>[f,hash(fs.readFileSync(path.join(siteDir,f)))]));
   const account=accounting(ledger,config.experiment,site.host),receipt={policy,siteId:site.siteId,finishedAt:new Date().toISOString(),wallMs:performance.now()-started,interrupted,...(interrupted?{resumed:true}:{}),reason,fatal,accounting:account,rows:scope.map(p=>p.id),evidenceHashes,freezeSha256:verified.sha256,ledgerAfter:ledger.totals()};
   if(scope.some(p=>!done.has(p.id)))throw Error('site-output-incomplete');
   json(path.join(siteDir,'complete.json'),receipt);onEvent({event:'site-complete',...receipt});
   if(fatal){stopped=fatal;break;}
  }
 }finally{
  if(lock!==undefined){
   try{fs.closeSync(lock);}
   finally{
    const archive=path.join(directory,'lock-receipts');fs.mkdirSync(archive,{recursive:true});fs.renameSync(owner,path.join(archive,crypto.randomUUID()+'.json'));
   }
  }
 }
 return {directory,policy,stopped};
}
function offlineChecks({root=freeze.ROOT}={}){
 const sourceHashes=freeze.offlineSourceHashes(root),commands=freeze.offlineCommands(root);
 const folder=path.join(root,'workspace/revision/evaluation/checks-'+Date.now());fs.mkdirSync(folder,{recursive:true});
 const results=commands.map((args,i)=>{const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:16000000,windowsHide:true});fs.writeFileSync(path.join(folder,'checks-'+i+'.log'),(r.stdout||'')+(r.stderr||''),{flag:'wx'});return {args,status:r.status,error:r.error?.message||null,log:path.join(folder,'checks-'+i+'.log')};});
 let sourceHashesAfter=null,sourceError=null;
 try{sourceHashesAfter=freeze.offlineSourceHashes(root);}
 catch(error){sourceError=error.message;}
 const sourceChanged=!isDeepStrictEqual(sourceHashes,sourceHashesAfter);
 const summary={at:new Date().toISOString(),ok:!sourceChanged&&results.every(r=>r.status===0&&r.error===null),commands:results,sourceChanged,sourceError};
 const file=path.join(folder,'receipt.json');json(file,{...summary,sourceHashes,sourceHashesAfter});emit({event:'offline-checks',file,...summary});return file;
}
module.exports={POLICIES,EvaluationRegistry,EvaluationLedger,accounting,reconcile,targets,writeRow,newRun,runnerFor,runPolicy,offlineChecks,lines,json};
if(require.main===module){const [command,...args]=process.argv.slice(2);(async()=>{
 if(command==='check')return offlineChecks();
 if(command==='freeze'){const result=freeze.create({testsReceipt:args[0],settledFile:args[1]});return emit({event:'frozen',sha256:result.sha256,files:Object.keys(result.freeze.files).length});}
 if(command==='verify'){const result=freeze.verify();return emit({event:'freeze-valid',sha256:result.sha256});}
 if(command==='run'){const [policy,sites,...flags]=args,get=k=>flags.find(f=>f.startsWith('--'+k+'='))?.slice(k.length+3);const result=await runPolicy({policy,siteIds:sites.split(','),directory:get('resume'),sourceDirectory:get('source')??(flags.includes('--source')?'':undefined),deadline:get('deadline')?Date.parse(get('deadline')):undefined});emit({event:'run-complete',...result});if(result.stopped)process.exitCode=1;return;}
 throw Error('Usage: eval-run.cjs check | freeze CHECK_RECEIPT [SETTLED_POINTER] | verify | run POLICY SITE_IDS [--resume=DIR] [--source=P2_DIR] [--deadline=ISO]');
 })().catch(error=>{console.error(error.stack);process.exitCode=1;});}
