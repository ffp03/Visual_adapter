'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const freeze=require('../../../backend/agent/eval-freeze.cjs');
const ROOT=path.resolve(__dirname,'../../..');
function fixture(){
 const root=path.join(ROOT,'workspace/revision/evaluation/tests',crypto.randomUUID());fs.mkdirSync(root,{recursive:true});
 const files=freeze.sourceFiles(ROOT);
 for(const f of files){fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.copyFileSync(path.join(ROOT,f),path.join(root,f));}
 const retained=freeze.retained(),promptFile='workspace/revision/dev-runs/fixture/prompt.txt',stateFile=path.join(root,'workspace/revision/dev-runs/fixture/iteration.json');
 fs.mkdirSync(path.dirname(stateFile),{recursive:true});fs.writeFileSync(path.join(root,promptFile),retained.prompt);
 fs.writeFileSync(stateFile,JSON.stringify({folder:path.dirname(stateFile),prompt:retained.prompt}));
 fs.mkdirSync(path.join(root,'workspace/revision/dev-runs/run7'),{recursive:true});fs.writeFileSync(path.join(root,'workspace/revision/dev-runs/run7/final.json'),JSON.stringify({iterationFile:stateFile}));
 const sites=Array.from({length:40},(_,n)=>{
  const siteId='eval-'+String(n+1).padStart(2,'0'),host='fixture'+(n+1)+'.test',prefix='workspace/revision/corpus/eval/'+siteId;
  const site={siteId,host,split:'eval',pages:Array.from({length:5},(_,i)=>{
   const id=siteId+'-p'+(i+1),text='Page '+(i+1)+' reading content has enough substantial words and characters to pass the reference-free gate. '+('Useful reading content stays available. '.repeat(9));
   const html='<main class="reading"><h1>Title '+(i+1)+'</h1><p>'+text+'</p></main><footer>Footer noise</footer>',sha256=freeze.sha(html),folder=path.join(root,prefix,id);
   fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'rendered-dom.html'),html);
   const ref=JSON.stringify({content:[{id:'title',role:'title',text:'Title '+(i+1),required:true},{id:'body',role:'body',text,required:true}],noise:[{id:'footer',kind:'footer',text:'Footer noise'}],neutral:[]});
   fs.writeFileSync(path.join(folder,'reference.json'),ref);fs.writeFileSync(path.join(folder,'reference-lint.json'),JSON.stringify({pass:true,sourceSha256:sha256,referenceSha256:freeze.sha(ref)}));
   return {pageId:id,url:'https://'+host+'/'+id,finalUrl:'https://'+host+'/'+id,sha256};
  })};
  fs.writeFileSync(path.join(root,prefix,'site-manifest.json'),JSON.stringify(site));return site;
 });
 fs.writeFileSync(path.join(root,'workspace/revision/corpus/manifest.json'),JSON.stringify({sites}));
 const testsReceipt=path.join(root,'checks.json');fs.writeFileSync(testsReceipt,JSON.stringify({ok:true,commands:[{status:0},{status:0}],sourceHashes:Object.fromEntries(files.map(f=>[f,freeze.sha(fs.readFileSync(path.join(root,f)))]))}));
 return {root,testsReceipt};
}
function sealed(){const f=fixture();freeze.create(f);return f;}
function modelFactory(policy,ledger){
 const fake={provider:'deepseek',model:'fixture-model',effort:'none',ledger,calls:0,payload:messages=>({model:'fixture-model',max_tokens:1024,messages}),close(){},async configure(){},checkLogin(){},async generate(){
  this.calls++;
  const rule={schemaVersion:3,name:'Fixture',applicability:{hostname:'fixture1.test',anchors:[{selector:'main.reading',min:1,max:1}]},regions:[{role:'body',selector:'main.reading',multiple:false,required:true}],exclude:[],reveal:[],provenance:{model:'fixture-model',inductionPages:policy==='P3'?1:2,createdAt:'2026-11-21T00:00:00Z'}};
  return {content:JSON.stringify(policy.startsWith('P2')?{main:'main.reading',exclude:[],name:'Fixture'}:{action:'submit',rule}),usage:{prompt_tokens:100,completion_tokens:20,prompt_cache_hit_tokens:0}};
 }};return fake;
}
module.exports={fixture,sealed,modelFactory};
