'use strict';
const fs=require('node:fs'),path=require('node:path');const {spawn}=require('node:child_process');
const p0=require('../../tests/revision/eval/policies/p0-reader.cjs'),p1=require('../../tests/revision/eval/policies/p1-readability.cjs');
const {hash}=require('./ledger.cjs');
const {PageRegistry}=require('./pages.cjs');
const ROOT=path.resolve(__dirname,'../..'),CACHE=process.env.REVISION_BASELINE_CACHE?path.resolve(process.env.REVISION_BASELINE_CACHE):path.join(ROOT,'workspace/revision/dev-runs/baseline-cache-v3');
if(!CACHE.startsWith(path.join(ROOT,'workspace/revision/dev-runs')+path.sep))throw Error('baseline-cache-outside-development-runs');
const FILES=['extension/procedure-core.js','tests/revision/eval/policies/p0-reader.cjs','tests/revision/eval/policies/p1-readability.cjs','tests/revision/eval/policies/common.cjs','tests/revision/eval/dom.cjs','tests/revision/eval/score.cjs','tests/revision/eval/text.cjs','tests/revision/eval/lcs.cjs'];
const versionHash=()=>hash(FILES.map(f=>[f,hash(fs.readFileSync(path.join(ROOT,f)))]));
function synchronous(pages){return pages.map(doc=>{
 const page={html:doc.documentElement.outerHTML,url:doc.location.href};
 return {P0:p0.run(page),P1:p1.run(page)};
});}
async function bounded(policy,page,{timeoutMs=120000,registry=new PageRegistry()}={}){
 const canonical=registry.resolve(typeof page==='string'?page:page.id);
 if(typeof page==='object'&&page.sha256&&page.sha256!==canonical.sha256)throw Error('baseline-source-hash-mismatch:'+page.id);page=canonical;
 return fromRecord(policy,canonical,{timeoutMs});
}
async function fromRecord(policy,canonical,{timeoutMs=120000,cacheDirectory=CACHE}={}){
 const page=canonical;
 const source=Buffer.from(canonical.html,'utf8'),sourceHash=hash(source);
 if(page.sha256&&sourceHash!==page.sha256)throw Error('baseline-source-hash-mismatch:'+page.id);
 fs.mkdirSync(cacheDirectory,{recursive:true});const version=versionHash(),file=path.join(cacheDirectory,hash({sourceHash,url:page.url,policy,version,timeoutMs})+'.json');
 if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));
 const output=await new Promise(resolve=>{
  const child=spawn(process.execPath,['--max-old-space-size=8192',path.join(ROOT,'tests/revision/eval/policy-worker.cjs')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',done=false;const started=Date.now();
  const finish=out=>{if(done)return;done=true;clearTimeout(timer);resolve({...out,sourceHash,baselineVersion:version,timeoutMs});};
  const timer=setTimeout(()=>{child.kill();finish({html:'',text:'',ok:false,reason:'runtime-timeout:'+timeoutMs+'ms',latencyMs:null});},timeoutMs);
  child.stdout.on('data',b=>{stdout+=b;if(stdout.length>64000000){child.kill();finish({html:'',text:'',ok:false,reason:'runtime-baseline-response-bound'});}});
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-4096);});
  child.stdin.on('error',()=>{});child.on('error',()=>finish({html:'',text:'',ok:false,reason:'runtime-baseline-launch-failed'}));
  child.on('close',code=>{try{const data=JSON.parse(stdout);if(code!==0||typeof data.html!=='string'||typeof data.ok!=='boolean')throw Error();finish(data);}catch{finish({html:'',text:'',ok:false,reason:'runtime-baseline-worker-error',diagnostics:stderr,latencyMs:Date.now()-started});}});
  child.stdin.end(JSON.stringify({policy,page:{html:source.toString('utf8'),url:page.url},options:{}}));
 });
 try{fs.writeFileSync(file,JSON.stringify(output),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
 return output;
}
async function forPages(pages,options){return Promise.all(pages.map(async p=>({P0:await bounded('P0',p,options),P1:await bounded('P1',p,options)})));}
async function prepare(){const registry=new PageRegistry(),manifest=JSON.parse(fs.readFileSync(registry.manifestFile,'utf8')),pages=[];let next=0;
 for(const site of manifest.sites)for(const p of site.pages)try{const canonical=registry.resolve(p.id||p.pageId);pages.push({id:canonical.id,file:canonical.file,url:canonical.url,sha256:canonical.sha256});}catch(e){console.log(JSON.stringify({event:'baseline-skipped',id:p.id||p.pageId,reason:e.message}));}
 await Promise.all(Array.from({length:3},async()=>{while(next<pages.length){const p=pages[next++];for(const policy of ['P0','P1']){console.log(JSON.stringify({event:'baseline-start',page:p.id,policy}));const b=await bounded(policy,p);console.log(JSON.stringify({event:'baseline-ready',page:p.id,policy,ok:b.ok,reason:b.reason,characters:b.text?.length}));}}}));}
if(require.main===module)prepare().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={synchronous,bounded,forPages,versionHash,fromRecord};
