'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Module=require('node:module');
const freeze=require('../../../backend/agent/eval-freeze.cjs');
const ROOT=path.resolve(__dirname,'../../..');
const PROMPT='Synthetic retained development prompt for offline evaluation tests.';
const legacyRoots=new Set();
const historicalVerify=freeze.verify;
function registerLegacyRoot(root){
 // Exercise the v1 code with synthetic pins confined to these fixture roots.
 // Production pins still apply everywhere else, including the real checkout.
 if(!legacyRoots.size){
  const filename=require.resolve('../../../backend/agent/eval-freeze.cjs'),legacy=new Module(filename,module);
  legacy.filename=filename;legacy.paths=module.paths;
  let source=fs.readFileSync(filename,'utf8');
  for(const [file,expected] of Object.entries(freeze.EXPECTED)){
   const bytes=file==='prompt'?PROMPT:fs.readFileSync(path.join(root,file));
   if(!source.includes(expected))throw Error('legacy-fixture-pin-missing:'+file);
   source=source.replace(expected,freeze.sha(bytes));
  }
  legacy._compile(source,filename);
  for(const name of ['create','verify','retained']){
   const original=freeze[name];
   freeze[name]=(...args)=>{
    const candidate=name==='retained'?args[0]:args[0]?.root;
    return (legacyRoots.has(candidate)?legacy.exports[name]:original)(...args);
   };
  }
 }
 legacyRoots.add(root);
}
function offlineReceipt(root){
 const commands=freeze.offlineCommands(root).map(args=>({args,status:0}));
 const sourceHashes=freeze.offlineSourceHashes(root);
 return {ok:true,commands,sourceHashes,sourceHashesAfter:sourceHashes};
}
function archiveV5(root,manifest){
 const folder=path.join(root,'workspace/revision/freeze/archive/v5'),archiveManifest=path.join(folder,'evaluation-manifest.json'),archiveFreeze=path.join(folder,'evaluation-freeze.json');
 const bytes=JSON.stringify(manifest);
 fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(archiveManifest,bytes);
 fs.writeFileSync(archiveFreeze,JSON.stringify({schemaVersion:1,manifest:freeze.MANIFEST,files:{[freeze.MANIFEST]:freeze.sha(bytes)}}));
 return {archiveManifest,archiveFreeze};
}
function fixture({legacy=true}={}){
 const root=path.join(ROOT,'workspace/revision/evaluation/tests',crypto.randomUUID());fs.mkdirSync(root,{recursive:true});
 const files=legacy?freeze.sourceFiles(ROOT):Object.keys(freeze.offlineSourceHashes(ROOT));
 for(const f of files){fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.copyFileSync(path.join(ROOT,f),path.join(root,f));}
 const folder=path.join(root,'workspace/revision/dev-runs/fixture/iteration-1'),promptFile=path.join(folder,'prompt.txt'),iterationFile=path.join(folder,'iteration.json');
 const settledFile=path.join(root,'workspace/revision/dev-runs',legacy?'run7':'fixture','final.json');
 const sourceHashes=Object.fromEntries(files.map(f=>[f,freeze.sha(fs.readFileSync(path.join(root,f)))]));
 const viewComponents=['outline.cjs','catalog.cjs'].map(file=>({file,sha256:sourceHashes['backend/agent/'+file]}));
 const output=path.join(root,'workspace/revision/results/capability-agent-1-fixture'),completionFile=path.join(output,'P4-on-complete-1.json');
 fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(promptFile,PROMPT);
 const state={index:1,folder,output,prompt:PROMPT,promptHash:freeze.sha(PROMPT),
  gateHash:sourceHashes['extension/procedure-v3.js'],viewsHash:freeze.sha(JSON.stringify(viewComponents)),viewComponents};
 fs.writeFileSync(iterationFile,JSON.stringify(state));
 if(!legacy){
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(completionFile,JSON.stringify({policy:'P4-on',check:'output',trials:1,stopped:false,promptHash:state.promptHash,gateHash:state.gateHash,siteIds:['dev-02']}));
 }
 fs.mkdirSync(path.dirname(settledFile),{recursive:true});fs.writeFileSync(settledFile,JSON.stringify({iterationFile}));
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
 const original='workspace/revision/corpus/manifest.json';
 let archive;
 if(!legacy){
  const archivedSites=sites.map(site=>{
   const prefix='workspace/revision/corpus/eval/'+site.siteId;
   return {...site,mixedFamily:site.siteId==='eval-38',siteManifest:prefix+'/site-manifest.json',pages:site.pages.map((p,i)=>{
    const base=prefix+'/'+p.pageId,referenceFile=base+'/reference.json';
    return {...p,id:p.pageId,siteId:site.siteId,sourceFile:base+'/rendered-dom.html',referenceFile,referenceSha256:freeze.sha(fs.readFileSync(path.join(root,referenceFile))),lintFile:base+'/reference-lint.json',heldOut:i>=2};
   })};
  });
  archive=archiveV5(root,{schemaVersion:1,split:'eval',sourceManifest:original,sourceManifestSha256:freeze.sha(fs.readFileSync(path.join(root,original))),sites:archivedSites});
 }
 const testsReceipt=path.join(root,'checks.json');fs.writeFileSync(testsReceipt,JSON.stringify(legacy?{ok:true,commands:[{status:0},{status:0}],sourceHashes}:offlineReceipt(root)));
 if(legacy)registerLegacyRoot(root);
 return {root,testsReceipt,...(legacy?{}:{settledFile,completionFile,...archive}),promptFile,iterationFile};
}
function sealed(){const f=fixture();freeze.create(f);return f;}
function modelFactory(policy,ledger){
 const fake={provider:'deepseek',model:'fixture-model',effort:'none',ledger,calls:0,payload:messages=>({model:'fixture-model',max_tokens:1024,messages}),close(){},async configure(){},checkLogin(){},async generate(){
  this.calls++;
  const rule={schemaVersion:3,name:'Fixture',applicability:{hostname:'fixture1.test',anchors:[{selector:'main.reading',min:1,max:1}]},regions:[{role:'body',selector:'main.reading',multiple:false,required:true}],exclude:[],reveal:[],provenance:{model:'fixture-model',inductionPages:policy==='P3'?1:2,createdAt:'2026-11-21T00:00:00Z'}};
  return {content:JSON.stringify(policy.startsWith('P2')?{main:'main.reading',exclude:[],name:'Fixture'}:{action:'submit',rule}),usage:{prompt_tokens:100,completion_tokens:20,prompt_cache_hit_tokens:0}};
 }};return fake;
}
module.exports={fixture,sealed,modelFactory,historicalVerify,archiveV5};
