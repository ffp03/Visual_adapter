'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sources,load,firstLines}=require('./develop.cjs');
const v3=require('../../extension/procedure-v3.js'),core=require('../../extension/procedure-core.js');
const {runLoop,PROMPT_HASH}=require('./loop.cjs');const {DeepSeekRunner,LocalRunner}=require('./runners.cjs');const {Ledger,hash}=require('./ledger.cjs');
const {redact}=require('./outline.cjs');
const ROOT=path.resolve(__dirname,'../..'),BASE=path.join(ROOT,'workspace/revision/dev-runs');
const scorerFile=path.join(ROOT,'tests/revision/eval/score.cjs');
const scorer=fs.existsSync(scorerFile)?require(scorerFile):null;
function metrics(html,page,fallback){
 const file=path.join(path.dirname(path.resolve(ROOT,page.file)),'reference.json');
 if(!scorer||!fs.existsSync(file))return {available:false,reason:scorer?'reference-unavailable':'scorer-unavailable'};
 const raw=fs.readFileSync(file,'utf8'),reference=JSON.parse(raw);
 try{
  const s=scorer.score(html,reference,{format:'html',fallback});
  return {...Object.fromEntries(['contentRecall','contentCharacterRecall','noiseLeakage','noiseCharacterShare','titlePresent','titleFirst','orderTau','completePass','cleanPass','noFallbackPass','requiredUnits','noiseUnits'].map(k=>[k,s[k]])),
   available:true,referenceHash:hash(raw),scorerHash:hash(fs.readFileSync(scorerFile))};
 }catch(e){return {available:false,reason:'scoring-error',error:e.message,referenceHash:hash(raw),
  emptyUnits:[...(reference.content||[]),...(reference.noise||[])].filter(u=>!String(u.text||'').trim()).map(u=>u.id)};}
}
function fallbackHTML(doc,page){
 const folder=path.join(BASE,'fallback-cache');fs.mkdirSync(folder,{recursive:true});
 const file=path.join(folder,`${page.sha256||hash(doc.documentElement.outerHTML)}-${hash(fs.readFileSync(path.join(ROOT,'extension/procedure-core.js')))}.html`);
 if(fs.existsSync(file))return fs.readFileSync(file,'utf8');
 const html=core.fallback(doc).html;
 try{fs.writeFileSync(file,html,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||fs.readFileSync(file,'utf8')!==html)throw e;}
 return html;
}
function exclusions(pages,rule){return rule.exclude.map(selector=>{
 const nodes=pages.map(d=>v3.matches(d,selector)),first=nodes.flat().find(n=>v3.text(n));
 return {selector,counts:nodes.map(n=>n.length),firstCue:first?redact(v3.text(v3.clean(first,first.ownerDocument))).slice(0,60):''};
});}
async function run2({provider='deepseek',mode='P4',siteIds=[],concurrency=provider==='local'?2:1,deadline=Date.now()+120*60000}={}){
 if(!['deepseek','local'].includes(provider)||!['P3','P4'].includes(mode)||provider==='local'&&mode!=='P4')throw Error('invalid-run2-policy');
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>(provider==='local'?4:1))throw Error('invalid-run2-concurrency');
 const input=sources();if(!input.manifest.includes('dev-manifest.json'))throw Error('fresh-development-manifest-required');
 const directory=path.join(BASE,'run2',new Date().toISOString().replace(/[:.]/g,'-')+'-'+provider+'-'+mode+'-'+crypto.randomUUID().slice(0,8));fs.mkdirSync(directory,{recursive:true});
 const ledger=new Ledger(),runner=provider==='local'?new LocalRunner({ledger}):new DeepSeekRunner({ledger,thinking:false});
 const report={startedAt:new Date().toISOString(),provider,mode,promptHash:PROMPT_HASH,concurrency,source:input.manifest,
  sourceHash:hash(fs.readFileSync(path.join(ROOT,input.manifest))),ledgerBefore:ledger.totals(),sites:[],
  codeHashes:Object.fromEntries(['extension/procedure-v3.js','backend/agent/loop.cjs','backend/agent/outline.cjs','backend/agent/runners.cjs','backend/agent/ledger.cjs'].map(f=>[f,hash(fs.readFileSync(path.join(ROOT,f)))]))};
 fs.writeFileSync(path.join(directory,'start.json'),JSON.stringify(report,null,2),{flag:'wx'});
 const emit=e=>console.log(JSON.stringify({at:new Date().toISOString(),...e}));let stopped=false,next=0;
 const timer=setTimeout(()=>{stopped=true;report.stopReason='time-cap';runner.close();},Math.max(1,deadline-Date.now()));
 const selected=input.sites.filter(s=>!siteIds.length||siteIds.includes(s.id));
 async function siteJob(site){
  const induction=mode==='P4'?site.pages.slice(0,2):[site.pages[2]],doms=[];
  const row={id:site.id,host:site.host,provider,mode,sourcePages:site.pages.map(p=>({...p})),admitted:false,heldOut:[]};
  const out=path.join(directory,site.id);fs.mkdirSync(out,{recursive:true});
  try{
   if(induction.some(p=>!p||p.skip)){
    Object.assign(row,{skipped:true,reasons:['final-host-left-site'],turns:0,accounting:{requests:0,promptTokens:0,completionTokens:0,cachedTokens:0,failures:0}});return;
   }
   emit({event:'site-start',site:site.host,provider,mode});
   for(const p of induction)doms.push(load(p));
   const docs=doms.map(d=>d.window.document),result=await runLoop({pageIds:induction.map(p=>p.id),runner,ledger,mode,site:site.host,onEvent:emit});
   Object.assign(row,{admitted:result.accepted,reasons:result.reasons,turns:result.turns,accounting:result.accounting,rule:result.rule,history:result.history,
    gate:result.gate?.pages.map(p=>({accepted:p.accepted,reasons:p.reasons,textLength:p.textLength,minimumTextLength:p.minimumTextLength,uniqueCoverage:p.uniqueCoverage?.ratio,substantiveCoverage:p.substantiveCoverage?.ratio})),
    excluded:result.accepted?exclusions(docs,result.rule):[]});
   for(const [i,p] of induction.entries())if(result.gate?.pages[i]?.html)fs.writeFileSync(path.join(out,`induction-${i+1}.html`),result.gate.pages[i].html,{flag:'wx'});
   if(result.fatal){stopped=true;report.stopReason=result.error;runner.close();return;}
   const applyPages=mode==='P4'?site.pages.slice(2,5):[site.pages[2]];
   for(const p of applyPages){
    if(p.skip){row.heldOut.push({page:p.id,skipped:true,reasons:['final-host-left-site']});continue;}
    emit({event:'apply-start',site:site.host,page:p.id,provider,mode});
    const held=mode==='P3'?null:load(p),doc=held?held.window.document:docs[0];
    try{
     const v=result.accepted?(mode==='P3'?result.gate.pages[0]:v3.useTime(doc,result.rule)):{accepted:false,reasons:['induction-not-admitted']};
     const html=v.accepted?v.html:fallbackHTML(doc,p),filename=`${p.id}.html`;
     fs.writeFileSync(path.join(out,filename),html,{flag:'wx'});
     const pageResult={page:p.id,sourceHash:p.sha256,accepted:v.accepted,fallback:!v.accepted,reasons:v.reasons,textLength:v.textLength,
      substantiveCoverage:v.substantiveCoverage?.ratio,firstLines:firstLines(doc,html),scores:metrics(html,p,!v.accepted)};
     row.heldOut.push(pageResult);emit({event:'page-result',site:site.host,provider,mode,...pageResult});
    }finally{held?.window.close();}
   }
   row.p3FirstLines=row.heldOut.find(p=>/-p3(?:-|$)/.test(p.page))?.firstLines||row.heldOut[0]?.firstLines||[];
  }catch(e){Object.assign(row,{admitted:false,reasons:['runtime-error'],error:e.message});if(e.fatal){stopped=true;report.stopReason=e.message;runner.close();}}
  finally{
   for(const d of doms)d.window.close();report.sites.push(row);
   fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(row,null,2),{flag:'wx'});
   emit({event:'site-result',...row});
  }
 }
 try{
  if(provider==='local'){emit({event:'local-preflight'});report.route=await runner.configure();emit({event:'local-ready',...report.route});}
  await Promise.all(Array.from({length:concurrency},async()=>{while(!stopped&&next<selected.length){const site=selected[next++];await siteJob(site);}}));
 }catch(e){stopped=true;report.stopReason=e.message;report.fatal=!!e.fatal;emit({event:'stopped',reason:e.message,fatal:!!e.fatal});}
 finally{
  clearTimeout(timer);runner.close();report.finishedAt=new Date().toISOString();report.ledgerAfter=ledger.totals();report.pendingSites=selected.slice(next).map(s=>s.host);
  fs.writeFileSync(path.join(directory,'complete.json'),JSON.stringify(report,null,2),{flag:'wx'});
  emit({event:'complete',directory,provider,mode,stopReason:report.stopReason,sites:report.sites.length,ledger:report.ledgerAfter,promptHash:PROMPT_HASH});
 }
 return report;
}
if(require.main===module){const args=process.argv.slice(2),arg=(key,def)=>args.find(a=>a.startsWith('--'+key+'='))?.split('=').slice(1).join('=')||def;
 run2({provider:arg('provider','deepseek'),mode:arg('mode','P4'),siteIds:args.filter(a=>a.startsWith('--site=')).map(a=>a.slice(7)),concurrency:Number(arg('concurrency',arg('provider','deepseek')==='local'?'2':'1')),
 deadline:arg('deadline')?Date.parse(arg('deadline')):Date.now()+120*60000}).then(r=>{if(r.stopReason)process.exitCode=1;}).catch(e=>{console.error(e.stack);process.exitCode=1;});}
module.exports={run2,metrics,exclusions,fallbackHTML};
