'use strict';
const fs=require('node:fs'),path=require('node:path');const {createHash}=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const hostnameKey=host=>typeof host==='string'?host.replace(/^www\./,''):null;
const sameHostname=(a,b)=>typeof a==='string'&&typeof b==='string'&&hostnameKey(a)===hostnameKey(b);
function inside(root,file){const relative=path.relative(root,file);return !!relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
class PageRegistry{
 constructor({root=ROOT}={}){this.root=path.resolve(root);this.manifestFile=path.join(this.root,'workspace/revision/corpus/dev-manifest.json');}
 resolve(id,policy='dev'){
  if(policy==='eval'||policy==='evaluation')return this.resolveEvaluation(id);
  if(policy!=='dev')throw Error('evaluation-freeze-required:unknown-policy');
  if(typeof id!=='string'||!id||!(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/).test(id))throw Error('development-page-id-required');
  const bytes=fs.readFileSync(this.manifestFile),manifest=JSON.parse(bytes);
  if(manifest.split&&manifest.split!=='dev')throw Error('not-development-manifest');
  const pages=manifest.sites?.flatMap(s=>s.pages.map(p=>({site:s.host,siteId:s.siteId,...p})))||manifest.pages||[];
  const matching=pages.filter(p=>(p.id||p.pageId)===id);
  if(matching.length!==1)throw Error('page-not-in-development-manifest:'+id);
  const p=matching[0],url=p.finalUrl||p.url,host=p.site||p.host;
  if(!url||!host||!sameHostname(new URL(url).hostname,host))throw Error('development-page-left-host:'+id);
  const folder=p.directory||p.dir||p.path||`dev/${p.siteId}/${id}`;
  const raw=p.sourceFile||p.htmlPath||p.capturePath||p.file||p.domPath||path.join(folder,'rendered-dom.html');
  const fromRoot=path.resolve(this.root,raw),fromManifest=path.resolve(path.dirname(this.manifestFile),raw);
  const file=fs.realpathSync(path.isAbsolute(raw)?raw:fs.existsSync(fromRoot)?fromRoot:fromManifest);
  const corpus=fs.realpathSync(path.join(this.root,'workspace/revision/corpus/dev'));
  if(!inside(corpus,file))throw Error('development-source-outside-corpus:'+id);
  const source=fs.readFileSync(file),sha256=digest(source),expected=p.sourceSha256||p.sha256;
  if(typeof expected!=='string'||expected!==sha256)throw Error('development-source-hash-mismatch:'+id);
  return Object.freeze({id,site:host,siteId:p.siteId,url,file,sha256,html:source.toString('utf8'),manifestHash:digest(bytes)});
 }
 resolveEvaluation(id){
  const {verify}=require('./eval-freeze.cjs'),{manifest,freeze}=verify({root:this.root});
  if(typeof id!=='string'||!/^eval-\d\d-p[1-5]$/.test(id))throw Error('evaluation-page-id-required');
  const pages=manifest.sites.flatMap(s=>s.pages.map(p=>({...p,site:s.host,siteId:s.siteId}))),matching=pages.filter(p=>p.id===id);
  if(matching.length!==1)throw Error('page-not-in-evaluation-manifest:'+id);
  const p=matching[0],url=p.finalUrl||p.url;
  if(!sameHostname(new URL(url).hostname,p.site))throw Error('evaluation-page-left-host:'+id);
  const file=fs.realpathSync(path.resolve(this.root,p.sourceFile)),corpus=fs.realpathSync(path.join(this.root,'workspace/revision/corpus/eval'));
  if(!inside(corpus,file))throw Error('evaluation-source-outside-corpus:'+id);
  const bytes=fs.readFileSync(file),sha256=digest(bytes);
  if(sha256!==p.sha256)throw Error('evaluation-source-hash-mismatch:'+id);
  return Object.freeze({...p,url,file,sha256,html:bytes.toString('utf8'),manifestHash:freeze.files[freeze.manifest]});
 }
 records(ids,policy='dev'){
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('development-page-ids-required');
  return ids.map(id=>this.resolve(id,policy));
 }
 load(id,policy='dev'){
  const record=this.resolve(id,policy),projectRequire=require('node:module').createRequire(path.join(this.root,'package.json'));
  // Test roots need no installed dependencies; production and tests use this
  // repository's parser. Only the fixed manifest/source root is configurable.
  let JSDOM,VirtualConsole,parse5;
  try{({JSDOM,VirtualConsole}=projectRequire('jsdom'));parse5=projectRequire('parse5');}
  catch{({JSDOM,VirtualConsole}=require('jsdom'));parse5=require('parse5');}
  const tree=parse5.parse(record.html);let removedStyles=0;
  const strip=n=>{if(n.childNodes){n.childNodes=n.childNodes.filter(c=>{if(c.tagName==='style'){removedStyles++;return false;}return true;});n.childNodes.forEach(strip);}if(n.content)strip(n.content);};strip(tree);
  const dom=new JSDOM(parse5.serialize(tree),{url:record.url,virtualConsole:new VirtualConsole()});
  dom.removedNoiseStyles=removedStyles;dom.manifestPage=record;return dom;
 }
}
module.exports={PageRegistry,ROOT,hostnameKey,sameHostname};
