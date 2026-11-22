'use strict';
// No provider, DOM, or ledger dependency: PageRegistry calls this before loading data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),FILE='workspace/revision/freeze/evaluation-freeze.json';
const MANIFEST='workspace/revision/freeze/evaluation-manifest.json';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const EXPECTED=Object.freeze({prompt:'b838e299b6af23b0f8244b27e8fa6866ac7e2d244c720be5d6f808e9463a8984',
 'extension/procedure-v3.js':'aee2e56324f297cc787f397c34058f8d2fc5c9761aa1924313ed89722a80b0e6',
 'backend/agent/outline.cjs':'ef9da79cb55e1ec6907d5a33e150af2880e1950a77f2110c1ff218efe5906998'});
const SETTINGS=Object.freeze({schemaVersion:3,selectorCharacters:300,turns:6,cueLength:60,G3:{P4:.9,P3:.8},G4LinkDensity:.3,G5:{cap:200,fraction:.5},G6:'all eligible better-baseline blocks',useTimeCoverage:.6});
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
function verify({root=ROOT,requireReceipt=true}={}){
 try{
  const file=path.join(root,FILE);if(!fs.existsSync(file))throw Error('evaluation-freeze-required:missing');
  const bytes=fs.readFileSync(file);let freeze;try{freeze=JSON.parse(bytes);}catch{throw Error('evaluation-freeze-required:invalid-json');}
  if(freeze.schemaVersion!==1||!Number.isFinite(Date.parse(freeze.frozenAt))||freeze.manifest!==MANIFEST||!freeze.files||Array.isArray(freeze.files)||!freeze.promptFile)throw Error('evaluation-freeze-required:invalid-schema');
  if(JSON.stringify(freeze.settings)!==JSON.stringify(SETTINGS))throw Error('evaluation-freeze-required:settings-mismatch');
  const needed=[...sourceFiles(root),freeze.promptFile,MANIFEST,'workspace/revision/corpus/manifest.json'];
  for(const f of needed)if(!Object.hasOwn(freeze.files,f))throw Error('evaluation-freeze-required:unlisted:'+f);
  for(const [f,digest] of Object.entries(freeze.files)){
   if(!/^[a-f0-9]{64}$/.test(digest)||sha(fs.readFileSync(safe(root,f)))!==digest)throw Error('evaluation-freeze-required:hash-mismatch:'+f);
  }
  if(freeze.files[freeze.promptFile]!==EXPECTED.prompt)throw Error('evaluation-freeze-required:prompt-mismatch');
  for(const [f,digest] of Object.entries(EXPECTED))if(f!=='prompt'&&freeze.files[f]!==digest)throw Error('evaluation-freeze-required:settled-hash-mismatch:'+f);
  const manifest=JSON.parse(fs.readFileSync(safe(root,MANIFEST)));
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
function create({root=ROOT,testsReceipt}={}){
 if(fs.existsSync(path.join(root,FILE)))throw Error('freeze-already-exists');
 // The receipt is produced by eval-run's offline-check command, never by generation.
 const checks=JSON.parse(fs.readFileSync(testsReceipt));
 if(checks.ok!==true||checks.commands?.length!==2||checks.commands.some(c=>c.status!==0))throw Error('offline-checks-required');
 const {promptFile}=retained(root),original='workspace/revision/corpus/manifest.json';
 if(JSON.stringify(require('./capability-run.cjs').settings)!==JSON.stringify(SETTINGS))throw Error('settled-run7-settings-mismatch');
 const raw=JSON.parse(fs.readFileSync(path.join(root,original))),sites=raw.sites.filter(s=>s.split==='eval');
 if(sites.length!==40)throw Error('evaluation-site-count');
 const files=sourceFiles(root);
 // A check receipt is tied to all executable evaluation source bytes.
 if(JSON.stringify(Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(safe(root,f)))])))!==JSON.stringify(checks.sourceHashes))throw Error('offline-check-source-changed');
 const manifest={schemaVersion:1,split:'eval',sourceManifest:original,sourceManifestSha256:sha(fs.readFileSync(path.join(root,original))),sites:sites.map(site=>{
  const prefix='workspace/revision/corpus/eval/'+site.siteId,siteManifest=prefix+'/site-manifest.json';files.push(siteManifest);
  return {...site,mixedFamily:site.siteId==='eval-38'||site.mixedFamily===true,siteManifest,pages:site.pages.map((p,i)=>{
   const id=p.pageId||p.id,folder=prefix+'/'+id,referenceFile=folder+'/reference.json',lintFile=folder+'/reference-lint.json';
   const referenceSha256=sha(fs.readFileSync(path.join(root,referenceFile))),lint=JSON.parse(fs.readFileSync(path.join(root,lintFile)));
   if(lint.pass!==true||lint.referenceSha256!==referenceSha256||lint.sourceSha256!==p.sha256)throw Error('reference-lint-not-current:'+id);
   files.push(referenceFile,lintFile);
   return {...p,id,siteId:site.siteId,sourceFile:folder+'/rendered-dom.html',referenceFile,referenceSha256,lintFile,heldOut:i>=2};
  })};
 })};
 const directory=path.dirname(path.join(root,FILE));fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(root,MANIFEST),JSON.stringify(manifest,null,2),{flag:'wx'});
 files.push(MANIFEST,original,promptFile);
 const {DEFAULTS,SCORING_VERSION}=require('../../tests/revision/eval/score.cjs');
 const freeze={schemaVersion:1,frozenAt:new Date().toISOString(),manifest:MANIFEST,promptFile,promptSha256:EXPECTED.prompt,settings:SETTINGS,scoreThresholds:DEFAULTS,scoringVersion:SCORING_VERSION,
  execution:{siteConcurrency:1,localMaxRequests:4,baselineTimeoutMs:120000,P3:{pages:'p3-only',thinking:false},P4:{main:'P4-on',thinking:true,variants:['P4-off','P4-cue0','P4-full','P4-local','P4-Codex']},
   Codex:{model:'gpt-6.1-sol',effort:'medium',siteIds:Array.from({length:10},(_,i)=>'eval-'+String(i+1).padStart(2,'0'))},bootstrapResamples:10000},
  offlineChecks:{file:rel(root,path.resolve(testsReceipt)),sha256:sha(fs.readFileSync(testsReceipt))},
  files:Object.fromEntries([...new Set(files)].sort().map(f=>[f,sha(fs.readFileSync(safe(root,f)))]))};
 fs.writeFileSync(path.join(root,FILE),JSON.stringify(freeze,null,2),{flag:'wx'});
 const result=verify({root,requireReceipt:false});
 const {Ledger}=require('./ledger.cjs'),ledger=new Ledger({root});
 ledger.locked(()=>ledger.append({event:'freeze',id:crypto.randomUUID(),outcome:'frozen',freezeFile:FILE,freezeSha256:result.sha256,promptHash:EXPECTED.prompt,files:Object.keys(freeze.files).length}));
 return verify({root});
}
module.exports={ROOT,FILE,MANIFEST,EXPECTED,SETTINGS,sha,safe,sourceFiles,checkoutPath,retained,verify,create};
