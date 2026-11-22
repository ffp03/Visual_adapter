'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {sources,load,firstLines}=require('./develop.cjs'),baseline=require('./baselines.cjs');
const {runLoop,SYSTEM_PROMPT}=require('./loop.cjs'),{Families}=require('./families.cjs');
const {DeepSeekRunner,LocalRunner}=require('./runners.cjs'),{Ledger,hash}=require('./ledger.cjs');
const {exclusions}=require('./run2.cjs');
const {freezeValidReferences}=require('../../tests/revision/eval/references.cjs');
const {createOutput}=require('../../tests/revision/eval/output.cjs');
const ROOT=path.resolve(__dirname,'../..'),BASE=path.join(ROOT,'workspace/revision/dev-runs/capability');
const emit=value=>console.log(JSON.stringify({at:new Date().toISOString(),...value}));
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'});
const settings={schemaVersion:3,selectorCharacters:300,turns:6,cueLength:60,G3:{P4:.9,P3:.8},G4LinkDensity:.3,G5:{cap:200,fraction:.5},G6:'all eligible better-baseline blocks',useTimeCoverage:.6};
function writeRow(directory,row,html){
 const file=row.id+'-'+row.policy+'.html';fs.writeFileSync(path.join(directory,file),html,{flag:'wx'});
 const complete={...row,outputFile:file,outputSha256:hash(html)};fs.appendFileSync(path.join(directory,'rows.jsonl'),JSON.stringify(complete)+'\n');return complete;
}
async function prepare({deadline='2026-11-21T10:01:50Z'}={}){
 fs.mkdirSync(BASE,{recursive:true});const directory=path.join(BASE,new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(directory);
 const input=sources(),requested=[],skipped=[];
 // Eligibility is fixed before generation, independent of any policy output.
 const sites=input.sites.filter(site=>{
  if(site.pages.slice(0,2).some(p=>p.skip)){skipped.push({site:site.host,reason:'invalid-induction-final-host',pages:site.pages.filter(p=>p.skip).map(p=>p.id)});return false;}
  return true;
 });
 for(const site of sites)for(const p of site.pages.slice(2,5)){
  if(p.skip){skipped.push({id:p.id,reason:'final-host-left-site'});continue;}
  requested.push({id:p.id,site:site.host,siteId:site.id,url:p.url,sourceFile:path.resolve(ROOT,p.file),referenceFile:path.join(path.dirname(path.resolve(ROOT,p.file)),'reference.json'),sourceSha256:p.sha256});
 }
 // The canonical checker is run unchanged, before scoring. Its page-specific
 // failures are exclusions; a non-page-specific checker error closes preparation.
 emit({event:'reference-check-start'});
 const checker=spawnSync(process.execPath,['--max-old-space-size=8192',path.join(ROOT,'tests/revision/capture/check-reference.cjs')],{encoding:'utf8',timeout:180000,maxBuffer:4000000,windowsHide:true});
 json(path.join(directory,'checker.json'),{status:checker.status,stdout:checker.stdout,stderr:checker.stderr,hash:hash(fs.readFileSync(path.join(ROOT,'tests/revision/capture/check-reference.cjs')))});
 if(checker.error)throw Error('reference-checker-runtime-failure');
 const failed=[...(checker.stdout||'').matchAll(/FAIL\s+([^:\n]+reference\.json):/g)].map(m=>m[1].replace(/\\/g,'/'));
 if(checker.status!==0&&!failed.length)throw Error('reference-checker-global-failure');
 const accepted=requested.filter(p=>{
  if(failed.some(f=>p.referenceFile.replace(/\\/g,'/').endsWith(f))){skipped.push({id:p.id,reason:'check-reference-failed'});return false;}return true;
 });
 const requestFile=path.join(directory,'requested.json');json(requestFile,{pages:accepted});
 const frozen=freezeValidReferences(requestFile,path.join(ROOT,'workspace/revision/results','capability-inputs-'+Date.now()));
 skipped.push(...frozen.snapshot.excluded.map(p=>({id:p.id,reason:'invalid-reference',errors:p.errors})));
 const eligible=new Set(frozen.snapshot.pages.map(p=>p.id));
 const finalSites=sites.map(s=>({...s,targets:s.pages.slice(2,5).filter(p=>eligible.has(p.id))})).filter(s=>s.targets.length);
 if(!finalSites.length){
  const blocked={at:new Date().toISOString(),reason:'no-valid-heldout-references',requestedPages:requested.map(p=>p.id),skipped,
   frozenManifest:frozen.manifestFile,checkerStatus:checker.status,ledger:new Ledger().totals()};
  json(path.join(directory,'blocked.json'),blocked);emit({event:'blocked',reason:blocked.reason,requestedPages:requested.length});
  throw Error('capability-no-valid-heldout-references');
 }
 const baselineFolder=path.join(ROOT,'workspace/revision/results','capability-baselines-'+Date.now());createOutput(baselineFolder);
 for(const site of finalSites)for(const p of site.targets)for(const policy of ['P0','P1']){
  const b=await baseline.bounded(policy,p);writeRow(baselineFolder,{id:p.id,site:site.host,policy,ok:b.ok,reason:b.reason,fallback:false,modelRequests:0,promptTokens:0,completionTokens:0,cachedTokens:0,costEstimate:0,sourceSha256:p.sha256,latencyMs:b.latencyMs??null},b.html);
 }
 const context={directory,deadline,tuningDevCap:670,baselineCache:process.env.REVISION_BASELINE_CACHE||null,manifest:frozen.manifestFile,baselineFolder,sites:finalSites,skipped,settings,settingsHash:hash(settings),ledgerBefore:new Ledger().totals(),
  sourceManifest:input.manifest,sourceManifestHash:hash(fs.readFileSync(path.join(ROOT,input.manifest)))};
 json(path.join(directory,'context.json'),context);emit({event:'prepared',context:path.join(directory,'context.json'),sites:finalSites.map(s=>({site:s.host,pages:s.targets.map(p=>p.id)})),skipped});return context;
}
function iteration(context,index,extraPrompt=''){
 const folder=path.join(context.directory,'iteration-'+index);fs.mkdirSync(folder);const output=path.join(ROOT,'workspace/revision/results','capability-agent-'+index+'-'+Date.now());createOutput(output);
 const prompt=SYSTEM_PROMPT+(extraPrompt?'\n'+extraPrompt:'');fs.writeFileSync(path.join(folder,'prompt.txt'),prompt,{flag:'wx'});
 const viewComponents=['outline.cjs','catalog.cjs'].map(file=>({file,sha256:hash(fs.readFileSync(path.join(__dirname,file)))}));
 const state={index,folder,output,prompt,promptHash:hash(prompt),gateHash:hash(fs.readFileSync(path.join(ROOT,'extension/procedure-v3.js'))),viewsHash:hash(viewComponents),viewComponents,settingsHash:context.settingsHash};
 const snapshot=path.join(folder,'source-snapshot');fs.mkdirSync(snapshot);
 for(const file of ['outline.cjs','catalog.cjs'])fs.copyFileSync(path.join(__dirname,file),path.join(snapshot,file));
 fs.copyFileSync(path.join(ROOT,'extension/procedure-v3.js'),path.join(snapshot,'procedure-v3.js'));
 json(path.join(folder,'iteration.json'),state);emit({event:'iteration-created',file:path.join(folder,'iteration.json'),promptHash:state.promptHash});return state;
}
async function policyRun(context,state,policy,{maxSites=Infinity}={}){
 const local=policy==='P4-local',thinking=policy==='P4-on',p3=policy==='P3';
 if(!['P4-off','P4-on','P4-local','P3'].includes(policy))throw Error('invalid-capability-policy');
 const ledger=new Ledger({maxDevRequests:context.tuningDevCap??670}),runner=local?new LocalRunner({ledger}):new DeepSeekRunner({ledger,thinking}),families=new Families(),trials=[];
 const stopFile=path.join(context.directory,'STOP.json');let stopped=false;
 const stop=reason=>{stopped=true;runner.close();if(!fs.existsSync(stopFile))json(stopFile,{at:new Date().toISOString(),reason});};
 const watch=setInterval(()=>{if(fs.existsSync(stopFile))stop('campaign-stop');if(Date.now()>Date.parse(context.deadline))stop('time-cap');},1000);
 async function generate(site,pages){
  const doms=pages.map(load),docs=doms.map(d=>d.window.document),baselines=await baseline.forPages(pages);
  try{
   const result=await runLoop({pageIds:pages.map(p=>p.id),runner,ledger,mode:p3?'P3':'P4',site:site.host,baselines,systemPrompt:state.prompt,onEvent:emit,
    provenance:{iteration:state.index,experiment:'capability-'+policy,gateHash:state.gateHash,viewsHash:state.viewsHash,settingsHash:state.settingsHash}});
   const trial={site:site.host,siteId:site.id,policy,pages:pages.map(p=>p.id),admitted:result.accepted,reasons:result.reasons,turns:result.turns,accounting:result.accounting,rule:result.rule,
    gate:result.gate?.pages.map(p=>({accepted:p.accepted,reasons:p.reasons,g6:p.g6?{baseline:p.g6.baseline,protected:p.g6.protected,preserved:p.g6.preserved,missing:p.g6.missing.map(b=>({text:b.protectedText,characters:b.protectedCharacters}))}:null})),
    excluded:result.accepted?exclusions(docs,result.rule):[],history:result.history};
   trials.push(trial);fs.appendFileSync(path.join(state.folder,policy+'-trials.jsonl'),JSON.stringify(trial)+'\n');
   if(result.accepted&&!p3)families.add(result.rule,result.gate);
   if(result.fatal||result.reason==='budget')stop(result.error||result.reason);
   emit({event:'admission',site:site.host,policy,accepted:result.accepted,reasons:result.reasons,turns:result.turns});
   return {result,doms,docs,trial};
  }catch(error){for(const d of doms)d.window.close();throw error;}
 }
 try{
  if(local){emit({event:'local-preflight'});await runner.configure();}
  const existing=fs.existsSync(path.join(state.output,'rows.jsonl'))?fs.readFileSync(path.join(state.output,'rows.jsonl'),'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(r=>r.policy===policy):[];
  const completed=new Set(existing.map(r=>r.id));let visited=0;
  for(const site of context.sites){
   if(site.targets.every(p=>completed.has(p.id)))continue;
   if(site.targets.some(p=>completed.has(p.id)))throw Error('partial-site-output-requires-recovery:'+site.id);
   if(visited++>=maxSites)break;
   if(stopped||fs.existsSync(stopFile))break;
   let shared;if(!p3)shared=await generate(site,site.pages.slice(0,2));
   try{for(let i=0;i<site.targets.length;i++){
    if(stopped||fs.existsSync(stopFile))break;const page=site.targets[i],generated=p3?await generate(site,[page]):shared;
    const {result}=generated,held=p3?null:load(page),doc=held?held.window.document:generated.docs[0];
    try{
     const verdict=result.accepted?(p3?result.gate.pages[0]:families.select(doc)):{accepted:false,reasons:result.reasons};
     const fallback=!verdict.accepted,basic=fallback?await baseline.bounded('P0',page):null,html=fallback?basic.html:verdict.html;
     const charge=p3||i===0,account=result.accounting;
     const row=writeRow(state.output,{id:page.id,site:site.host,policy,ok:verdict.accepted,reason:verdict.accepted?null:verdict.reasons?.join(';')||'agent-declined',fallback,
      modelRequests:charge?account.requests:0,promptTokens:charge?account.promptTokens:0,completionTokens:charge?account.completionTokens:0,cachedTokens:charge?account.cachedTokens:0,
      usageUnknown:charge?account.unknownUsageRequests:0,costEstimate:charge?account.costEstimate||0:0,sourceSha256:page.sha256,promptHash:state.promptHash,gateHash:state.gateHash,viewsHash:state.viewsHash,iteration:state.index},html);
     emit({event:'output',id:page.id,site:site.host,policy,ok:row.ok,fallback,firstLines:firstLines(doc,html).slice(0,2)});
    }finally{held?.window.close();if(p3)for(const d of generated.doms)d.window.close();}
   }}finally{if(shared)for(const d of shared.doms)d.window.close();}
  }
 }catch(error){emit({event:'policy-error',policy,error:error.message,fatal:!!error.fatal});stop(error.message);throw error;}
 finally{clearInterval(watch);runner.close();json(path.join(state.folder,policy+'-complete-'+Date.now()+'.json'),{policy,trials:trials.length,stopped,families:families.toJSON(),ledger:ledger.totals()});}
}
function scoreboard(context,state){
 const {run}=require('../../tests/revision/eval/scoreboard.cjs'),directory=path.join(ROOT,'workspace/revision/results','capability-scoreboard-'+state.index+'-'+Date.now());
 const result=run(context.manifest,[context.baselineFolder,state.output],{outputDirectory:directory});
 const {assess}=require('./progress.cjs'),historyFile=path.join(context.directory,'progress.jsonl');
 const history=fs.existsSync(historyFile)?fs.readFileSync(historyFile,'utf8').split('\n').filter(Boolean).map(JSON.parse):[];
 const progress={iteration:state.index,scoreboard:directory,...assess(result.summary,history.at(-1))};
 fs.appendFileSync(historyFile,JSON.stringify(progress)+'\n');
 if(progress.stop&&!fs.existsSync(path.join(context.directory,'TUNING-STOP.json')))json(path.join(context.directory,'TUNING-STOP.json'),{reason:'two-consecutive-non-improving-iterations',progress});
 json(path.join(state.folder,'scoreboard.json'),{directory,progress});
 emit({event:'progress',...progress});
 emit({event:'scoreboard',directory,policies:result.summary.policies,bySite:result.summary.bySite,skipped:result.summary.skipped});return {...result,directory};
}
if(require.main===module){const [phase,file,extra]=process.argv.slice(2);(async()=>{
 if(phase==='prepare')return prepare();
 const context=JSON.parse(fs.readFileSync(file,'utf8'));
 if(phase==='iteration')return iteration(context,Number(extra));
 const state=JSON.parse(fs.readFileSync(path.join(context.directory,'iteration-'+extra,'iteration.json'),'utf8'));
 if(phase==='score')return scoreboard(context,state);
 if(phase.startsWith('P'))return policyRun(context,state,phase,{maxSites:Number(process.argv.find(a=>a.startsWith('--limit='))?.slice(8))||Infinity});
 throw Error('unknown-phase');})().catch(error=>{console.error(error.stack);process.exitCode=1;});}
module.exports={prepare,iteration,policyRun,scoreboard,writeRow,settings};
