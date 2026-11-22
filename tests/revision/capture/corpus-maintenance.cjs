'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..'), CORPUS=path.join(ROOT,'workspace/revision/corpus');
const ARCHIVE=path.join(CORPUS,'archive/wp-a3-resumed-2026-11-21');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fileHashes(folder) {
 const result=[];
 for(const entry of await fs.readdir(folder,{withFileTypes:true})) {
  const p=path.join(folder,entry.name);
  if(entry.isDirectory())for(const v of await fileHashes(p))result.push({...v,path:entry.name+'/'+v.path});
  else result.push({path:entry.name,sha256:hash(await fs.readFile(p))});
 }
 return result;
}
async function recordMove(from,to) {
 const a=path.resolve(from),b=path.resolve(to);
 if(!a.startsWith(CORPUS+path.sep)||!b.startsWith(CORPUS+path.sep))throw Error('move outside corpus');
 const files=await fileHashes(a);await fs.mkdir(path.dirname(b),{recursive:true});
 try{await fs.access(b);throw Error('destination exists: '+b)}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.rename(a,b);
 const after=await fileHashes(b);if(JSON.stringify(files)!==JSON.stringify(after))throw Error('move hash mismatch');
 await fs.mkdir(ARCHIVE,{recursive:true});
 await fs.appendFile(path.join(ARCHIVE,'moves.jsonl'),JSON.stringify({at:new Date().toISOString(),from:path.relative(CORPUS,a),to:path.relative(CORPUS,b),files})+'\n');
}
async function archiveFile(file,label=path.basename(file)) {
 const bytes=await fs.readFile(file);await fs.mkdir(ARCHIVE,{recursive:true});
 const target=path.join(ARCHIVE,label);await fs.writeFile(target,bytes,{flag:'wx'});
 await fs.appendFile(path.join(ARCHIVE,'file-archives.jsonl'),JSON.stringify({at:new Date().toISOString(),from:path.relative(ROOT,file),to:path.relative(ROOT,target),sha256:hash(bytes)})+'\n');
 return target;
}
async function restore() {
 const base=path.join(CORPUS,'archive/wp-a1-replaced-20261121');
 for(const [id,label] of [['09','keychron'],['10','ardupilot'],['11','chrome-docs'],['12','rfc']]) {
  await recordMove(path.join(base,`out-of-scope-dev-${id}-${label}`),path.join(CORPUS,'dev',`dev-${id}`));
 }
 // Prefer current GOV.UK rejection captures when complete and hash-valid;
 // old consent-visible captures remain frozen in their existing archive.
 const choices=[];
 for(let i=1;i<=5;i++) {
  const candidates=[];
  for(const folder of [path.join(CORPUS,'dev/dev-06',`dev-06-p${i}`),path.join(base,'dev-06-pre-consent-reject',`dev-06-p${i}`)]) {
   const meta=JSON.parse(await fs.readFile(path.join(folder,'meta.json'),'utf8')),bytes=await fs.readFile(path.join(folder,'rendered-dom.html')),png=await fs.readFile(path.join(folder,'screenshot.png'));
   candidates.push({folder:path.relative(CORPUS,folder),url:meta.url,finalUrl:meta.finalUrl,sha256:meta.sha256,hashValid:hash(bytes)===meta.sha256,bytesValid:bytes.length===meta.bytes,screenshotValid:png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),notes:meta.notes});
  }
  if(!candidates[0].hashValid||!candidates[0].bytesValid||!candidates[0].screenshotValid)throw Error('invalid current GOV capture');
  choices.push({pageId:`dev-06-p${i}`,chosen:candidates[0].folder,reason:'Complete hash-valid current capture; rejecting optional consent follows capture guideline; preserve archived original.',candidates});
 }
 await fs.writeFile(path.join(ARCHIVE,'capture-choices.json'),JSON.stringify(choices,null,2)+'\n',{flag:'wx'});
 await rebuildDev();
}
async function rebuildDev() {
 const previous=JSON.parse(await fs.readFile(path.join(CORPUS,'dev-manifest.json'),'utf8'));
 const catalog=require('./capture.cjs').dev,sites=[];
 for(const s of catalog) {
  const siteId=s.id,prior=previous.sites.find(x=>x.siteId===siteId)||{},pages=[];
  for(let i=1;i<=5;i++) {
   const pageId=`${siteId}-p${i}`,folder=path.join(CORPUS,'dev',siteId,pageId),m=JSON.parse(await fs.readFile(path.join(folder,'meta.json'),'utf8'));
   const bytes=await fs.readFile(path.join(folder,'rendered-dom.html'));
   if(hash(bytes)!==m.sha256||bytes.length!==m.bytes)throw Error('capture hash mismatch '+pageId);
   pages.push({pageId,url:m.url,finalUrl:m.finalUrl,sha256:m.sha256,flags:{previouslyEvaluatedSite:false,newPage:true,heldOut:i>=3,clientRendered:m.clientRendered},capturedAt:m.capturedAt});
  }
  sites.push({siteId,split:'dev',host:new URL(pages[0].finalUrl).hostname,category:s.category,...(Number(siteId.slice(4))>=9?{harderDevelopmentSite:true}:{}),pages});
 }
 await fs.writeFile(path.join(CORPUS,'dev-manifest.json'),JSON.stringify({schemaVersion:1,split:'dev',updatedAt:new Date().toISOString(),sites},null,2)+'\n');
 return sites;
}
module.exports={ROOT,CORPUS,ARCHIVE,hash,fileHashes,recordMove,archiveFile,rebuildDev};
if(require.main===module)restore().then(()=>console.log('Restored 12 sites, 60 pages; GOV capture choices recorded')).catch(e=>{console.error(e);process.exitCode=1});
