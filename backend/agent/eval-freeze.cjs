'use strict';
// No provider, DOM, or ledger dependency: PageRegistry calls this before loading data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const ROOT=path.resolve(__dirname,'../..'),FILE='workspace/revision/freeze/evaluation-freeze.json';
const MANIFEST='workspace/revision/freeze/evaluation-manifest.json';
const V5_DIRECTORY='workspace/revision/freeze/archive/v5';
const V5_MANIFEST=V5_DIRECTORY+'/evaluation-manifest.json',V5_FREEZE=V5_DIRECTORY+'/evaluation-freeze.json';
const CHECK_DIRECTORIES=['tests/revision/agent','tests/revision/eval','tests/revision/capture'];
const OUTPUT_COMPLETION=/^P4-on-complete-\d+\.json$/;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const EXPECTED=Object.freeze({prompt:'b838e299b6af23b0f8244b27e8fa6866ac7e2d244c720be5d6f808e9463a8984',
 'extension/procedure-v3.js':'aee2e56324f297cc787f397c34058f8d2fc5c9761aa1924313ed89722a80b0e6',
 'backend/agent/outline.cjs':'ef9da79cb55e1ec6907d5a33e150af2880e1950a77f2110c1ff218efe5906998'});
const SETTINGS=Object.freeze({schemaVersion:3,selectorCharacters:300,turns:6,cueLength:60,G3:{P4:.9,P3:.8},G4LinkDensity:.3,G5:{cap:200,fraction:.5},G6:'all eligible better-baseline blocks',useTimeCoverage:.6});
const OUTPUT_SETTINGS=Object.freeze({...SETTINGS,check:'output'});
const rel=(root,file)=>path.relative(root,file).split(path.sep).join('/');
function safe(root,file){
 if(typeof file!=='string'||!file||path.isAbsolute(file)||file.includes('\\'))throw Error('freeze-invalid-path');
 const target=path.resolve(root,file),r=path.relative(root,target);
 if(!r||r==='..'||r.startsWith('..'+path.sep)||path.isAbsolute(r))throw Error('freeze-path-outside-root');
 const real=fs.realpathSync(target),rr=path.relative(fs.realpathSync(root),real);
 if(rr==='..'||rr.startsWith('..'+path.sep)||path.isAbsolute(rr))throw Error('freeze-symlink-outside-root');
 return real;
}
function sourceFiles(root=ROOT){
 const list=[];
 for(const folder of ['backend/agent','tests/revision/eval','tests/revision/eval/policies']){
  for(const name of fs.readdirSync(path.join(root,folder)))if(name.endsWith('.cjs'))list.push(folder+'/'+name);
 }
 list.push('extension/procedure-v3.js','extension/procedure-core.js','backend/deepseek-runner.cjs','backend/model-evidence.cjs','backend/codex-runner.cjs','package.json','package-lock.json');
 return [...new Set(list)].sort();
}
function offlineCommands(root=ROOT){
 const [agent,evaluation,capture]=CHECK_DIRECTORIES;
 return [['--test',agent+'/',evaluation+'/'],['--test',...fs.readdirSync(path.join(root,capture))
  .filter(name=>name.endsWith('.test.cjs')).sort().map(name=>capture+'/'+name)]];
}
function offlineSourceHashes(root=ROOT){
 const files=new Set(sourceFiles(root));
 function include(directory){
  for(const entry of fs.readdirSync(safe(root,directory),{withFileTypes:true})){
   const file=directory+'/'+entry.name;
   if(entry.isDirectory())include(file);
   else if(entry.isFile()||entry.isSymbolicLink())files.add(file);
  }
 }
 for(const directory of CHECK_DIRECTORIES)include(directory);
 return Object.fromEntries([...files].sort().map(file=>[file,sha(fs.readFileSync(safe(root,file)))]));
}
function checkOfflineReceipt(root,receipt){
 const expected=offlineCommands(root);
 if(receipt.ok!==true||!Array.isArray(receipt.commands)||receipt.commands.length!==expected.length||
  !receipt.commands.every((command,i)=>command?.status===0&&command.error==null&&isDeepStrictEqual(command.args,expected[i])))throw Error('offline-checks-required');
 if(receipt.sourceChanged===true||receipt.sourceError!=null||!isDeepStrictEqual(receipt.sourceHashes,receipt.sourceHashesAfter)||
  !isDeepStrictEqual(receipt.sourceHashes,offlineSourceHashes(root)))throw Error('offline-check-source-changed');
 return receipt.sourceHashes;
}
// Historical Windows pointers are resolved at read time; saved evidence is immutable.
function checkoutPath(file,root=ROOT){
 if(typeof file!=='string'||!file)throw Error('checkout-path-required');
 const prefix='C:\\Dev\\Visual_adapter';
 if(file===prefix||file.startsWith(prefix+'\\'))return path.resolve(root,...file.slice(prefix.length).split('\\').filter(Boolean));
 if(path.win32.isAbsolute(file)&&!path.isAbsolute(file))throw Error('unmapped-windows-checkout-path');
 return path.resolve(root,file);
}
function retained(root=ROOT){
 const pointer=JSON.parse(fs.readFileSync(path.join(root,'workspace/revision/dev-runs/run7/final.json')));
 const state=JSON.parse(fs.readFileSync(checkoutPath(pointer.iterationFile,root)));
 const promptFile=rel(root,path.join(checkoutPath(state.folder,root),'prompt.txt')),prompt=fs.readFileSync(safe(root,promptFile),'utf8');
 if(sha(prompt)!==EXPECTED.prompt||sha(state.prompt)!==EXPECTED.prompt)throw Error('settled-prompt-hash-mismatch');
 for(const [file,digest] of Object.entries(EXPECTED))if(file!=='prompt'&&sha(fs.readFileSync(safe(root,file)))!==digest)throw Error('settled-file-hash-mismatch:'+file);
 return {promptFile,prompt};
}
function settledIteration(root,file,completionFile){
 const pointer=JSON.parse(fs.readFileSync(safe(root,file)));
 const iterationFile=rel(root,checkoutPath(pointer.iterationFile,root));
 const state=JSON.parse(fs.readFileSync(safe(root,iterationFile)));
 const promptFile=rel(root,path.join(checkoutPath(state.folder,root),'prompt.txt'));
 const {promptHash,gateHash,viewsHash,viewComponents}=state;
 if(typeof state.prompt!=='string'||sha(fs.readFileSync(safe(root,promptFile)))!==promptHash||sha(state.prompt)!==promptHash)throw Error('settled-prompt-hash-mismatch');
 const gateFile='extension/procedure-v3.js';
 if(sha(fs.readFileSync(safe(root,gateFile)))!==gateHash)throw Error('settled-file-hash-mismatch:'+gateFile);
 const views=['outline.cjs','catalog.cjs'].map(file=>({file,sha256:sha(fs.readFileSync(safe(root,'backend/agent/'+file)))}));
 for(const [i,component] of views.entries()){
  if(!isDeepStrictEqual(viewComponents?.[i],component))throw Error('settled-file-hash-mismatch:backend/agent/'+component.file);
 }
 if(!isDeepStrictEqual(viewComponents,views)||sha(JSON.stringify(viewComponents))!==viewsHash)throw Error('settled-views-hash-mismatch');
 const expected={...state,check:'output',settled:true,policy:'P4-on',stopped:false,iteration:state.index,selectedIteration:state.index,promptFile,promptSha256:promptHash};
 for(const [key,value] of Object.entries(pointer)){
  if(!Object.hasOwn(expected,key))continue;
  if(['folder','output','promptFile'].includes(key)&&typeof value==='string'&&typeof expected[key]==='string'){
   if(checkoutPath(value,root)===checkoutPath(expected[key],root))continue;
  }else if(isDeepStrictEqual(value,expected[key]))continue;
  throw Error('settled-pointer-mismatch:'+key);
 }
 if((Object.hasOwn(state,'check')&&state.check!=='output')||(Object.hasOwn(state,'settled')&&state.settled!==true))throw Error('settled-iteration-mismatch');
 if(typeof state.output!=='string'||!state.output)throw Error('settled-output-completion-required');
 const output=rel(root,checkoutPath(state.output,root));
 const named=Object.hasOwn(pointer,'completionFile')?rel(root,checkoutPath(pointer.completionFile,root)):null;
 if(completionFile&&named&&completionFile!==named)throw Error('settled-pointer-mismatch:completionFile');
 const bound=completionFile??named;
 let candidates=[];
 if(bound)candidates=[bound];
 else if(fs.existsSync(path.join(root,output)))candidates=fs.readdirSync(safe(root,output))
  .filter(name=>OUTPUT_COMPLETION.test(name)).sort().map(name=>output+'/'+name);
 const completed=candidates.find(candidate=>{
  if(path.posix.dirname(candidate)!==output||!OUTPUT_COMPLETION.test(path.posix.basename(candidate)))return false;
  let record;
  try{record=JSON.parse(fs.readFileSync(safe(root,candidate)));}
  catch(error){if(!bound&&(error instanceof SyntaxError||error.code==='ENOENT'))return false;throw error;}
  if(record?.policy!=='P4-on'||record.check!=='output'||record.promptHash!==promptHash||record.gateHash!==gateHash||
   record.stopped!==false||!Number.isSafeInteger(record.trials)||record.trials<=0)return false;
  if(record.siteIds!==undefined&&(!Array.isArray(record.siteIds)||record.siteIds.length!==record.trials||new Set(record.siteIds).size!==record.trials||
   !record.siteIds.every(id=>typeof id==='string'&&/^dev-\d\d$/.test(id))))return false;
  return !Object.hasOwn(pointer,'siteIds')||isDeepStrictEqual(pointer.siteIds,record.siteIds);
 });
 if(!completed)throw Error('settled-output-completion-required');
 return {file,iterationFile,completionFile:completed,promptFile,promptHash,gateHash,viewsHash,viewComponents};
}
function archivedManifest(root){
 for(const file of [V5_MANIFEST,V5_FREEZE])if(!fs.existsSync(path.join(root,file)))throw Error('v6-archive-required:'+file);
 const bytes=fs.readFileSync(safe(root,V5_MANIFEST)),archive=JSON.parse(fs.readFileSync(safe(root,V5_FREEZE)));
 if(archive.schemaVersion!==1||archive.manifest!==MANIFEST||archive.files?.[MANIFEST]!==sha(bytes))throw Error('v6-archived-manifest-hash-mismatch');
 return JSON.parse(bytes);
}
function checkManifestContinuity(previous,manifest){
 for(let i=0;i<Math.max(previous.sites.length,manifest.sites.length);i++){
  const before=previous.sites[i],after=manifest.sites[i];
  const {pages:oldPages,...oldSite}=before||{}, {pages:newPages,...newSite}=after||{};
  if(!isDeepStrictEqual(oldSite,newSite))throw Error('v6-manifest-differs:'+(after?.siteId??before?.siteId));
  for(let j=0;j<Math.max(oldPages.length,newPages.length);j++){
   const oldPage=oldPages[j],newPage=newPages[j];
   if(!isDeepStrictEqual(oldPage,newPage))throw Error('v6-manifest-differs:'+(newPage?.id??oldPage?.id));
  }
 }
}
function checkCapture(root,page){
 const files=[[page.sourceFile,page.sha256]];
 if(page.referenceFile!==undefined)files.push([page.referenceFile,page.referenceSha256]);
 for(const [file,digest] of files){
  let actual;
  try{actual=sha(fs.readFileSync(safe(root,file)));}
  catch(error){throw Error('v6-capture-differs:'+page.id,{cause:error});}
  if(actual!==digest)throw Error('v6-capture-differs:'+page.id);
 }
}
function verify({root=ROOT,requireReceipt=true}={}){
 try{
  const file=path.join(root,FILE);if(!fs.existsSync(file))throw Error('evaluation-freeze-required:missing');
  const bytes=fs.readFileSync(file);let freeze;try{freeze=JSON.parse(bytes);}catch{throw Error('evaluation-freeze-required:invalid-json');}
  if(![1,2].includes(freeze.schemaVersion)||!Number.isFinite(Date.parse(freeze.frozenAt))||freeze.manifest!==MANIFEST||!freeze.files||Array.isArray(freeze.files)||!freeze.promptFile)throw Error('evaluation-freeze-required:invalid-schema');
  const v2=freeze.schemaVersion===2;
  if(JSON.stringify(freeze.settings)!==JSON.stringify(v2?OUTPUT_SETTINGS:SETTINGS))throw Error('evaluation-freeze-required:settings-mismatch');
  const manifestV2=v2?JSON.parse(fs.readFileSync(safe(root,MANIFEST))):null;
  const sources=sourceFiles(root);
  const needed=[...sources,freeze.promptFile,MANIFEST,'workspace/revision/corpus/manifest.json'];
  if(v2){
   if(!freeze.settled?.file||!freeze.settled.iterationFile||!freeze.settled.completionFile||!freeze.offlineChecks?.file)throw Error('evaluation-freeze-required:invalid-schema');
   needed.push(freeze.settled.file,freeze.settled.iterationFile,freeze.settled.completionFile,V5_MANIFEST,V5_FREEZE);
   for(const site of manifestV2.sites)for(const page of site.pages)checkCapture(root,page);
  }
  for(const f of needed)if(!Object.hasOwn(freeze.files,f))throw Error('evaluation-freeze-required:unlisted:'+f);
  for(const [f,digest] of Object.entries(freeze.files)){
   if(!/^[a-f0-9]{64}$/.test(digest)||sha(fs.readFileSync(safe(root,f)))!==digest)throw Error('evaluation-freeze-required:hash-mismatch:'+f);
  }
  if(v2){
   const settled=settledIteration(root,freeze.settled.file,freeze.settled.completionFile);
   if(!isDeepStrictEqual(settled,freeze.settled))throw Error('evaluation-freeze-required:settled-mismatch');
   if(freeze.promptFile!==settled.promptFile||freeze.promptSha256!==settled.promptHash||freeze.files[freeze.promptFile]!==settled.promptHash)throw Error('evaluation-freeze-required:prompt-mismatch');
   const receipt=fs.readFileSync(safe(root,freeze.offlineChecks.file));
   if(sha(receipt)!==freeze.offlineChecks.sha256)throw Error('evaluation-freeze-required:offline-check-receipt-hash-mismatch');
   const checked=checkOfflineReceipt(root,JSON.parse(receipt));
   if(sources.some(file=>checked[file]!==freeze.files[file]))throw Error('evaluation-freeze-required:offline-check-source-changed');
   checkManifestContinuity(archivedManifest(root),manifestV2);
  }else{
   if(freeze.files[freeze.promptFile]!==EXPECTED.prompt)throw Error('evaluation-freeze-required:prompt-mismatch');
   for(const [f,digest] of Object.entries(EXPECTED))if(f!=='prompt'&&freeze.files[f]!==digest)throw Error('evaluation-freeze-required:settled-hash-mismatch:'+f);
  }
  const manifest=v2?manifestV2:JSON.parse(fs.readFileSync(safe(root,MANIFEST)));
  if(manifest.split!=='eval'||!Array.isArray(manifest.sites)||manifest.sites.length!==40)throw Error('evaluation-freeze-required:manifest-shape');
  const ids=new Set();
  for(const site of manifest.sites){
   if(!/^eval-\d\d$/.test(site.siteId)||site.pages?.length!==5)throw Error('evaluation-freeze-required:site-shape');
   for(const p of site.pages){
    if(ids.has(p.id)||!p.id.startsWith(site.siteId+'-p'))throw Error('evaluation-freeze-required:duplicate-page');ids.add(p.id);
    for(const f of [p.referenceFile,p.lintFile,site.siteManifest])if(!freeze.files[f])throw Error('evaluation-freeze-required:unlisted-reference:'+f);
    if(p.referenceSha256!==freeze.files[p.referenceFile])throw Error('evaluation-freeze-required:reference-binding');
   }
  }
  const digest=sha(bytes);
  if(requireReceipt){
   const ledger=fs.readFileSync(path.join(root,'workspace/revision/ledger.jsonl'),'utf8').split('\n').filter(Boolean).map(JSON.parse);
   if(!ledger.some(e=>e.event==='freeze'&&e.freezeSha256===digest&&e.freezeFile===FILE))throw Error('evaluation-freeze-required:missing-ledger-receipt');
  }
  return {freeze,manifest,sha256:digest,file};
 }catch(error){if(error.message.startsWith('evaluation-freeze-required'))throw error;throw Error('evaluation-freeze-required:'+error.message);}
}
function create({root=ROOT,testsReceipt,settledFile}={}){
 if(fs.existsSync(path.join(root,FILE)))throw Error('freeze-already-exists');
 if(fs.existsSync(path.join(root,MANIFEST)))throw Error('evaluation-manifest-already-exists');
 const v2=settledFile!==undefined;
 // The receipt is produced by eval-run's offline-check command, never by generation.
 const receiptFile=rel(root,v2?checkoutPath(testsReceipt,root):path.resolve(testsReceipt));
 const receipt=fs.readFileSync(v2?safe(root,receiptFile):testsReceipt),checks=JSON.parse(receipt);
 if(!v2&&(checks.ok!==true||checks.commands?.length!==2||checks.commands.some(c=>c.status!==0)))throw Error('offline-checks-required');
 const settled=v2?settledIteration(root,rel(root,checkoutPath(settledFile,root))):null;
 const {promptFile}=settled||retained(root),promptHash=settled?.promptHash||EXPECTED.prompt,original='workspace/revision/corpus/manifest.json';
 if(JSON.stringify(require('./capability-run.cjs').settings)!==JSON.stringify(SETTINGS))throw Error(v2?'settled-settings-mismatch':'settled-run7-settings-mismatch');
 const raw=JSON.parse(fs.readFileSync(path.join(root,original))),sites=raw.sites.filter(s=>s.split==='eval');
 if(sites.length!==40)throw Error('evaluation-site-count');
 const files=sourceFiles(root),previous=v2?archivedManifest(root):null;
 if(v2)checkOfflineReceipt(root,checks);
 else{
  const sourceHashes=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(safe(root,f)))]));
  const checked=checks.sourceHashesAfter?Object.fromEntries(files.map(f=>[f,checks.sourceHashes?.[f]])):checks.sourceHashes;
  if(JSON.stringify(sourceHashes)!==JSON.stringify(checked))throw Error('offline-check-source-changed');
 }
 const priorPages=new Map(previous?.sites.flatMap(site=>site.pages).map(page=>[page.id,page]));
 const manifest={schemaVersion:1,split:'eval',sourceManifest:original,sourceManifestSha256:sha(fs.readFileSync(path.join(root,original))),sites:sites.map(site=>{
  const prefix='workspace/revision/corpus/eval/'+site.siteId,siteManifest=prefix+'/site-manifest.json';files.push(siteManifest);
  return {...site,mixedFamily:site.siteId==='eval-38'||site.mixedFamily===true,siteManifest,pages:site.pages.map((p,i)=>{
   const id=p.pageId||p.id,folder=prefix+'/'+id,referenceFile=folder+'/reference.json',lintFile=folder+'/reference-lint.json';
   const lint=JSON.parse(fs.readFileSync(path.join(root,lintFile)));
   const referenceSha256=v2?(p.referenceSha256??priorPages.get(id)?.referenceSha256??lint.referenceSha256):sha(fs.readFileSync(path.join(root,referenceFile)));
   const page={...p,id,siteId:site.siteId,sourceFile:folder+'/rendered-dom.html',referenceFile,referenceSha256,lintFile,heldOut:i>=2};
   if(v2)checkCapture(root,page);
   if(lint.pass!==true||lint.referenceSha256!==referenceSha256||lint.sourceSha256!==p.sha256)throw Error('reference-lint-not-current:'+id);
   files.push(referenceFile,lintFile);
   return page;
  })};
 })};
 const directory=path.dirname(path.join(root,FILE));fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(root,MANIFEST),JSON.stringify(manifest,null,2),{flag:'wx'});
 if(v2){
  checkManifestContinuity(previous,manifest);
  files.push(settled.file,settled.iterationFile,settled.completionFile,V5_MANIFEST,V5_FREEZE);
 }
 files.push(MANIFEST,original,promptFile);
 const {DEFAULTS,SCORING_VERSION}=require('../../tests/revision/eval/score.cjs');
 const freeze={schemaVersion:v2?2:1,frozenAt:new Date().toISOString(),manifest:MANIFEST,promptFile,promptSha256:promptHash,settings:v2?OUTPUT_SETTINGS:SETTINGS,...(v2?{settled}:{}),scoreThresholds:DEFAULTS,scoringVersion:SCORING_VERSION,
  execution:{siteConcurrency:1,localMaxRequests:4,baselineTimeoutMs:120000,P3:{pages:'p3-only',thinking:false},P4:{main:'P4-on',thinking:true,variants:['P4-off','P4-cue0','P4-full','P4-local','P4-Codex']},
   Codex:{model:'gpt-6.1-sol',effort:'medium',siteIds:Array.from({length:10},(_,i)=>'eval-'+String(i+1).padStart(2,'0'))},bootstrapResamples:10000},
  offlineChecks:{file:receiptFile,sha256:sha(receipt)},
  files:Object.fromEntries([...new Set(files)].sort().map(f=>[f,sha(fs.readFileSync(safe(root,f)))]))};
 fs.writeFileSync(path.join(root,FILE),JSON.stringify(freeze,null,2),{flag:'wx'});
 const result=verify({root,requireReceipt:false});
 const {Ledger}=require('./ledger.cjs'),ledger=new Ledger({root});
 ledger.locked(()=>ledger.append({event:'freeze',id:crypto.randomUUID(),outcome:'frozen',freezeFile:FILE,freezeSha256:result.sha256,promptHash,files:Object.keys(freeze.files).length}));
 return verify({root});
}
module.exports={ROOT,FILE,MANIFEST,EXPECTED,SETTINGS,sha,safe,sourceFiles,offlineCommands,offlineSourceHashes,checkoutPath,retained,verify,create};
