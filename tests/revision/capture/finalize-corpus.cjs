'use strict';
// Integrity and manifest work only. Does not draft evaluation references.
const fs=require('node:fs/promises');
const path=require('node:path');
const {CORPUS,ROOT,ARCHIVE,hash}=require('./corpus-maintenance.cjs');
const {lintCapture,checkCorpus}=require('./check-reference.cjs');
const {createDOM}=require('../eval/dom.cjs');
const {VirtualConsole}=require('jsdom');
const QUOTAS={'Product pages':4,'Forum/Q&A threads':3,'Listing/category pages':2,'Documentation with sidebars or tabs':3,'Client-rendered pages':3,'Pages without main/article markup':3};
async function savePrevious(file,label){
 try{const bytes=await fs.readFile(file);await fs.mkdir(path.join(ARCHIVE,'manifests'),{recursive:true});const target=path.join(ARCHIVE,'manifests',label+'-'+hash(bytes)+'.json');try{await fs.writeFile(target,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}}
 catch(e){if(e.code!=='ENOENT')throw e;}
}
async function site(split,siteId,previous){
 const folder=path.join(CORPUS,split,siteId),file=path.join(folder,'site-manifest.json');
 const old=previous||JSON.parse(await fs.readFile(file,'utf8')),pages=[],errors=[],limits=[];
 const directories=(await fs.readdir(folder,{withFileTypes:true})).filter(e=>e.isDirectory()&&new RegExp('^'+siteId+'-p\\d+$').test(e.name));
 if(directories.length!==5)errors.push('Expected five page folders for '+siteId);
 for(let i=1;i<=5;i++){
  const pageId=siteId+'-p'+i,p=path.join(folder,pageId),meta=JSON.parse(await fs.readFile(path.join(p,'meta.json'),'utf8'));
  const [bytes,png]=await Promise.all([fs.readFile(path.join(p,'rendered-dom.html')),fs.readFile(path.join(p,'screenshot.png'))]);
  const digest=hash(bytes),html=bytes.toString('utf8'),prior=old.pages?.find(p=>p.pageId===pageId)||{};
  if(digest!==meta.sha256||bytes.length!==meta.bytes)errors.push(pageId+': source hash/byte count mismatch');
  if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.length<24)errors.push(pageId+': invalid screenshot PNG');
  if(meta.viewport?.width!==1280||meta.viewport?.height!==900)errors.push(pageId+': invalid viewport');
  if(meta.status>=400)errors.push(pageId+': capture HTTP error');
  const canonicalHost=h=>h.replace(/^www\./,'');
  if(canonicalHost(new URL(meta.finalUrl).hostname)!==canonicalHost(old.host))errors.push(pageId+': final host differs from site '+old.host);
  const base=html.match(/<base\b[^>]*href="([^"]*)"/i)?.[1]?.replace(/&amp;/g,'&');
  if(base!==meta.finalUrl)errors.push(pageId+': base href differs from final URL');
  if(typeof meta.clientRendered!=='boolean')errors.push(pageId+': missing clientRendered flag');
  let referenceInfo={};
  if(split==='dev'){
   const refBytes=await fs.readFile(path.join(p,'reference.json')),lint=JSON.parse(await fs.readFile(path.join(p,'reference-lint.json'),'utf8'));
   if(!lint.pass||lint.sourceSha256!==digest||lint.referenceSha256!==hash(refBytes))errors.push(pageId+': missing/stale/failing lint');
   referenceInfo={referenceSha256:hash(refBytes),guidelineVersion:2,referenceLint:'reference-lint.json',contentOutsideDom:lint.contentOutsideDom};
  }
  // Verify the newly declared markup-free sites using source structure only.
  if(split==='eval'&&!old.previouslyEvaluatedSite&&old.category==='Pages without main/article markup'){
   const dom=createDOM(html,{virtualConsole:new VirtualConsole()});
   try{if(dom.window.document.querySelector('main,article,[role="main"]'))errors.push(pageId+': declared markup-free category has main/article');}finally{dom.window.close();}
  }
  pages.push({pageId,url:meta.url,finalUrl:meta.finalUrl,sha256:digest,flags:{...prior.flags,previouslyEvaluatedSite:split==='eval'&&old.previouslyEvaluatedSite===true,newPage:prior.flags?.newPage??true,heldOut:i>=3,clientRendered:meta.clientRendered},capturedAt:meta.capturedAt,...referenceInfo});
 }
 const capturePeers=pages.map(p=>({...p,siteId}));
 for(const p of capturePeers)for(const e of lintCapture(p,capturePeers))errors.push(p.pageId+': '+e.rule+' '+e.reason);
 const manifest={...old,split,siteId,pages};
 await savePrevious(file,siteId+'-site-manifest');
 return {manifest,file,errors};
}
async function run(write=false){
 const devFile=path.join(CORPUS,'dev-manifest.json'),dev=JSON.parse(await fs.readFile(devFile,'utf8'));
 const errors=[],devSites=[],evalSites=[],pending=[];
 for(const s of dev.sites){const result=await site('dev',s.siteId,s);devSites.push(result.manifest);errors.push(...result.errors);pending.push(result);}
 const evalFolders=(await fs.readdir(path.join(CORPUS,'eval'),{withFileTypes:true})).filter(e=>e.isDirectory()&&/^eval-\d+$/.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name));
 for(const entry of evalFolders){const result=await site('eval',entry.name);evalSites.push(result.manifest);errors.push(...result.errors);pending.push(result);}
 if(devSites.length!==12||devSites.reduce((n,s)=>n+s.pages.length,0)!==60)errors.push('Development split must have 12 sites and 60 pages');
 if(evalSites.length!==40||evalSites.reduce((n,s)=>n+s.pages.length,0)!==200)errors.push('Evaluation split must have 40 sites and 200 pages');
 if(new Set(evalSites.map(s=>s.host)).size!==40)errors.push('Evaluation hosts must be unique');
 const reserved=evalSites.filter(s=>s.previouslyEvaluatedSite),fresh=evalSites.filter(s=>!s.previouslyEvaluatedSite);
 if(reserved.length!==22||fresh.length!==18)errors.push('Evaluation split must contain 22 reserved and 18 new sites');
 const quotas=Object.fromEntries(Object.keys(QUOTAS).map(k=>[k,fresh.filter(s=>s.category===k).length]));
 for(const [k,n] of Object.entries(QUOTAS))if(quotas[k]!==n)errors.push('Category quota mismatch: '+k);
 const reservedCatalog=JSON.parse(await fs.readFile(path.join(ROOT,'docs/revision/reserved-22-sites.json'),'utf8'));
 for(const s of reserved)if(!reservedCatalog.some(r=>r.oldSite===s.oldSite&&r.host===s.host))errors.push('Reserved-site provenance mismatch '+s.siteId);
 const report={checkedAt:new Date().toISOString(),devSites:devSites.length,devPages:devSites.reduce((n,s)=>n+s.pages.length,0),evalSites:evalSites.length,evalPages:evalSites.reduce((n,s)=>n+s.pages.length,0),reservedSites:reserved.length,newSites:fresh.length,quotas,errors};
 await fs.writeFile(path.join(ARCHIVE,'corpus-integrity.json'),JSON.stringify(report,null,2)+'\n');
 if(errors.length||!write)return report;
 for(const {file,manifest} of pending)await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
 await savePrevious(devFile,'dev-manifest');
 await fs.writeFile(devFile,JSON.stringify({...dev,updatedAt:new Date().toISOString(),sites:devSites},null,2)+'\n');
 const combined={schemaVersion:1,capturedAt:new Date().toISOString(),annotationGuidelineVersion:2,sites:[...devSites,...evalSites],rejections:[]};
 for(const destination of [path.join(CORPUS,'manifest.json'),path.join(ROOT,'docs/revision/corpus-manifest.json')]){
  await savePrevious(destination,destination.includes('docs')?'sanitized-corpus-manifest':'manifest');
  // Explicit allowlist: no text bodies, local credentials or policy output.
  const sanitized={schemaVersion:1,capturedAt:combined.capturedAt,annotationGuidelineVersion:2,sites:combined.sites.map(s=>({split:s.split,siteId:s.siteId,host:s.host,category:s.category,...(s.oldSite?{oldSite:s.oldSite}:{}),...(s.split==='eval'?{previouslyEvaluatedSite:!!s.previouslyEvaluatedSite}:{}),...(s.harderDevelopmentSite?{harderDevelopmentSite:true}:{}),pages:s.pages})),rejections:[]};
  await fs.writeFile(destination,JSON.stringify(destination.includes('docs')?sanitized:combined,null,2)+'\n');
 }
 const evalLint=await checkCorpus({evalCaptures:true});
 await fs.writeFile(path.join(ARCHIVE,'evaluation-lint.json'),JSON.stringify(evalLint,null,2)+'\n');
 return report;
}
module.exports={run};
if(require.main===module)run(process.argv.includes('--write')).then(r=>{console.log(JSON.stringify(r,null,2));if(r.errors.length)process.exitCode=1}).catch(e=>{console.error(e.stack);process.exitCode=1});
