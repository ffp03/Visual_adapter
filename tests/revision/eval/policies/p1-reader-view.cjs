'use strict';
// Scored Firefox Reader View rendering only. Agent evidence keeps p1-readability.cjs.
const {Readability}=require('@mozilla/readability');
const {documentFor,result,failed}=require('./common.cjs');
const {withCssCompatibility}=require('../dom.cjs');
const version=require('@mozilla/readability/package.json').version;
const nonempty=value=>String(value||'').trim().length>0;
const escaped=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function formatArticle(article){return (nonempty(article.title)?'<h1>'+escaped(article.title)+'</h1>':'')+(nonempty(article.byline)?'<p>'+escaped(article.byline)+'</p>':'')+(article.content||'');}
function run(page,baseURL){return withCssCompatibility(skipped=>{
 let dom;try{
  if(version!=='0.6.0')throw Error('readability-version-mismatch:'+version);
  dom=documentFor(page,baseURL);const article=new Readability(dom.window.document.cloneNode(true)).parse();
  return article?result(formatArticle(article),true,null,{readabilityVersion:version,title:article.title,byline:article.byline,cssCompatibilitySkipped:skipped()}):result('',false,'readability-no-article');
 }catch(error){return failed(error);}finally{dom?.window.close();}
});}
// Separate bounded entry point: never changes policy-worker.cjs used by induction.
async function fromRecord(record,{timeoutMs=120000}={}){
 const {spawn}=require('node:child_process'),{performance}=require('node:perf_hooks');
 const started=performance.now();
 return new Promise(resolve=>{
  const child=spawn(process.execPath,['--max-old-space-size=8192',__filename],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',done=false;
  const finish=out=>{if(done)return;done=true;clearTimeout(timer);resolve({...out,latencyMs:performance.now()-started});};
  const timer=setTimeout(()=>{child.kill();finish(result('',false,'runtime-timeout:'+timeoutMs+'ms'));},timeoutMs);
  child.stdout.on('data',b=>{stdout+=b;if(stdout.length>64000000){child.kill();finish(result('',false,'runtime-reader-view-response-bound'));}});
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-4096);});child.stdin.on('error',()=>{});
  child.on('error',()=>finish(result('',false,'runtime-reader-view-launch-failed')));
  child.on('close',code=>{try{const out=JSON.parse(stdout);if(code!==0||typeof out.html!=='string'||typeof out.ok!=='boolean')throw Error();finish(out);}catch{finish({...result('',false,'runtime-reader-view-worker-error'),diagnostics:stderr});}});
  child.stdin.end(JSON.stringify({html:record.html,url:record.url}),'utf8');
 });
}
module.exports={run,formatArticle,fromRecord};
if(require.main===module)process.stdout.write(JSON.stringify(run(JSON.parse(require('node:fs').readFileSync(0,'utf8')))));
