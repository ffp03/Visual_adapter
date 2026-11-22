const {JSDOM}=require('jsdom');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {Ledger}=require('../../../backend/agent/ledger.cjs');
const documents=[];
function doc(body) {const dom=new JSDOM('<!doctype html><html><body>'+body+'</body></html>',{url:'https://example.test/path/page'});documents.push(dom);return dom.window.document;}
function close(){for(const d of documents.splice(0))d.window.close();}
const prose=seed=>`${seed} This is substantive unique reading content. It has enough characters to satisfy the deterministic threshold and must stay available to the reader. `.repeat(2);
function pages(){return ['Alpha','Beta'].map(s=>doc(`<main class="reading"><h1>${s} title</h1><p class="body">${prose(s)}</p><aside class="template"><p>${prose('Repeated newsletter')}</p></aside></main>`));}
function rule(extra={}){return {schemaVersion:3,name:'Article',applicability:{hostname:'example.test',anchors:[{selector:'main.reading',min:1,max:1}]},regions:[{role:'body',selector:'main',multiple:false,required:true}],exclude:[],reveal:[],provenance:{model:'scripted',inductionPages:2,createdAt:'2026-11-20T00:00:00Z'},...extra};}
function registerPage(l,id,html,url='https://example.test/'+id){
 const corpus=path.join(l.root,'workspace/revision/corpus'),folder=path.join(corpus,'dev','fixture',id);fs.mkdirSync(folder,{recursive:true});
 const file=path.join(folder,'rendered-dom.html');fs.writeFileSync(file,html);
 const manifestFile=path.join(corpus,'dev-manifest.json'),manifest=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):{split:'dev',sites:[{siteId:'fixture',host:'example.test',pages:[]}]};
 manifest.sites[0].pages.push({pageId:id,url,finalUrl:url,sha256:crypto.createHash('sha256').update(html).digest('hex')});fs.writeFileSync(manifestFile,JSON.stringify(manifest));return file;
}
function ledger(options={}){
 const root=path.resolve(__dirname,'../../../workspace/revision/dev-runs/tests',crypto.randomUUID()),l=new Ledger({root,directory:root,...options});
 for(const [i,s] of ['Alpha','Beta'].entries())registerPage(l,'fixture-p'+(i+1),`<!doctype html><html><body><main class="reading"><h1>${s} title</h1><p class="body">${prose(s)}</p><aside class="template"><p>${prose('Repeated newsletter')}</p></aside></main></body></html>`);
 // Budget/provider unit tests use known fixture IDs. Boundary regression tests
 // invoke Ledger.prototype.run directly, so omission cannot be hidden here.
 const run=l.run.bind(l);l.run=(runner,messages,metadata={})=>run(runner,messages,Object.hasOwn(metadata,'pageIds')||Object.hasOwn(metadata,'pages')?metadata:{pageIds:['fixture-p1'],...metadata});return l;
}
function fake(actions,options={}){return {provider:'scripted',model:'scripted',calls:[],...options,async generate(messages){this.calls.push(JSON.parse(JSON.stringify(messages)));const next=actions.shift();if(next instanceof Error)throw next;return {content:typeof next==='string'?next:JSON.stringify(next),usage:{prompt_tokens:100,completion_tokens:20,prompt_cache_hit_tokens:40}};}};}
module.exports={doc,close,prose,pages,rule,ledger,fake,registerPage};
