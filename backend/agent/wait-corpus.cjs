'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');const {hash}=require('./ledger.cjs');
const ROOT=path.resolve(__dirname,'../..'),BASE=path.join(ROOT,'workspace/revision/dev-runs');
const {PageRegistry,sameHostname}=require('./pages.cjs');
async function check(){
 const manifest=path.join(ROOT,'workspace/revision/corpus/dev-manifest.json'),bytes=fs.readFileSync(manifest),data=JSON.parse(bytes);
 if(!data.sites?.some(s=>s.siteId==='dev-12'))return {ready:false,reason:'dev-12-not-listed',sites:data.sites?.length||0,manifestHash:hash(bytes)};
 const registry=new PageRegistry();
 const coherent=()=>{for(const site of data.sites)for(const page of site.pages){if(!sameHostname(new URL(page.finalUrl||page.url).hostname,site.host))continue;registry.resolve(page.id||page.pageId);}if(hash(fs.readFileSync(manifest))!==hash(bytes))throw Error('manifest-changed-during-readiness');};
 try{coherent();}catch(e){return {ready:false,reason:e.message,manifestHash:hash(bytes)};}
 const checker=path.join(ROOT,'tests/revision/capture/check-reference.cjs');
 return new Promise(resolve=>{
  const child=spawn(process.execPath,['--max-old-space-size=8192',checker],{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',finished=false;
  const timer=setTimeout(()=>{child.kill();finish({ready:false,reason:'validator-timeout'});},180000);
  function finish(result){if(finished)return;finished=true;clearTimeout(timer);resolve({...result,manifestHash:hash(bytes),checkerHash:hash(fs.readFileSync(checker)),stdout,stderr});}
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr=(stderr+b).slice(-8192));
  child.on('error',()=>finish({ready:false,reason:'validator-launch-error'}));child.on('close',code=>{try{coherent();finish({ready:code===0,reason:code===0?'ready':'validator-failed',exitCode:code});}catch(e){finish({ready:false,reason:e.message,exitCode:code});}});
 });
}
async function wait({started=Date.now(),fromRound=0}={}){
 fs.mkdirSync(BASE,{recursive:true});const file=path.join(BASE,'corpus-readiness-'+started+'.jsonl');
 for(let round=fromRound;round<=6;round++){
  if(round>0)await new Promise(resolve=>setTimeout(resolve,Math.max(1,started+round*600000-Date.now())));
  const result={at:new Date().toISOString(),round,...await check()};fs.appendFileSync(file,JSON.stringify(result)+'\n');console.log(JSON.stringify({event:'corpus-check',...result}));
  if(result.ready){fs.writeFileSync(file.replace('.jsonl','-ready-round'+round+'.json'),JSON.stringify(result,null,2),{flag:'wx'});return;}
 }
 console.log(JSON.stringify({event:'readiness-expired',file}));process.exitCode=2;
}
if(require.main===module)wait({started:Number(process.argv[2])||Date.now(),fromRound:Number(process.argv[3])||0}).catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={check};
