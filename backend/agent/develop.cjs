'use strict';
// Bounded development replay. Frozen captures are read-only; no live fetching.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
// Use the same jsdom dependency as the project's tests.
const projectRequire=require('node:module').createRequire(path.resolve(__dirname,'../../package.json'));
const {JSDOM,VirtualConsole}=projectRequire('jsdom');const parse5=projectRequire('parse5');
const v3=require('../../extension/procedure-v3.js');const core=require('../../extension/procedure-core.js');
const {runLoop,PROMPT_HASH}=require('./loop.cjs');const {DeepSeekRunner}=require('./runners.cjs');const {Ledger,hash}=require('./ledger.cjs');
const {PageRegistry,sameHostname}=require('./pages.cjs');
const ROOT=path.resolve(__dirname,'../..');
function sources({october=false}={}) {
 const candidates=['workspace/revision/corpus/dev/dev-manifest.json','workspace/revision/corpus/dev-manifest.json'];
 const manifest=!october && candidates.find(p=>fs.existsSync(path.join(ROOT,p)));
 if(manifest){const data=JSON.parse(fs.readFileSync(path.join(ROOT,manifest),'utf8'));if(data.split!=='dev')throw Error('development-split-required');
  const registry=new PageRegistry();return {manifest,sites:data.sites.map(s=>({id:s.siteId,host:s.host,pages:s.pages.map(p=>{
   const id=p.id||p.pageId,url=p.finalUrl||p.url,skip=!sameHostname(new URL(url).hostname,s.host);if(skip)return {id,url,skip,sha256:p.sha256};
   const canonical=registry.resolve(id);return {id,url:canonical.url,file:canonical.file,sha256:canonical.sha256,skip:false};
  })}))};}
 // Explicit October development allowlist. Never discover by walking holdout
 // folders: several old task023 subtrees contain reserved evaluation captures.
 const old=[['python','blog.python.org','python-news-a','python-news-b'],['books','books.toscrape.com','books-product-a','books-product-b'],
  ['mdn','developer.mozilla.org','mdn-table-a','mdn-form-b'],['wikipedia','en.wikipedia.org','wiki-article-a','wiki-article-b'],
  ['hn','news.ycombinator.com','hn-discussion-a','hn-discussion-b'],['gov','www.gov.uk','gov-info-a','gov-info-b'],['w3c','www.w3.org','w3c-article-a','w3c-article-b']];
 const sites=old.filter(s=>s.slice(2).every(id=>fs.existsSync(path.join(ROOT,`workspace/task023/live-20261019/${id}/source.html`))))
  .map(([id,host,...ids])=>({id:'october-'+id,host,pages:ids.map(id=>{const folder=`workspace/task023/live-20261019/${id}`;
    const meta=JSON.parse(fs.readFileSync(path.join(ROOT,folder,'capture.json'),'utf8'));return {id,url:meta.finalUrl||meta.url,sha256:meta.sha256,file:folder+'/source.html'};})}));
 return {manifest:'October explicit development allowlist (two pages only; no p3-p5)',sites};
}
function load(page,{registry=new PageRegistry()}={}) {return registry.load(typeof page==='string'?page:page.id);}
function firstLines(doc,html) {
 const root=doc.createElement('div');root.innerHTML=html;
 const lines=[];for(const n of root.querySelectorAll('h1,h2,h3,p,li,td,th,pre,figcaption')){const value=v3.text(n);if(value)lines.push(value.slice(0,160));if(lines.length===4)break;}return lines;
}
async function develop({siteIds=[],october=false,thinking=false,limit=Infinity}={}) {
 const input=sources({october}),ledger=new Ledger(),runner=new DeepSeekRunner({thinking,ledger});
 const directory=path.join(ROOT,'workspace/revision/dev-runs/development',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8));fs.mkdirSync(directory,{recursive:true});
 const sourceFiles=['extension/procedure-core.js','extension/procedure-v3.js','backend/agent/outline.cjs','backend/agent/loop.cjs','backend/agent/ledger.cjs','backend/agent/runners.cjs'];
 const report={startedAt:new Date().toISOString(),node:process.version,source:input.manifest,promptHash:PROMPT_HASH,thinking,
  sourceHashes:Object.fromEntries(sourceFiles.map(f=>[f,hash(fs.readFileSync(path.join(ROOT,f),'utf8'))])),sites:[]};
 fs.writeFileSync(path.join(directory,'run.json'),JSON.stringify(report,null,2),{flag:'wx'});
 console.log(JSON.stringify({event:'start',source:input.manifest,sites:input.sites.filter(s=>!siteIds.length||siteIds.includes(s.id)).map(s=>s.host)}));
 try {
  for(const site of input.sites.filter(s=>!siteIds.length||siteIds.includes(s.id)).slice(0,limit)) {
   if(site.pages.slice(0,2).some(p=>p.skip)){console.log(JSON.stringify({event:'skipped',site:site.host,reason:'induction-final-host-left-site'}));continue;}
   const doms=[];console.log(JSON.stringify({event:'site-start',site:site.host}));
   try {
    for(const p of site.pages.slice(0,2))doms.push(load(p));
    const result=await runLoop({pageIds:site.pages.slice(0,2).map(p=>p.id),runner,ledger,mode:'P4',site:site.host});
    const row={id:site.id,host:site.host,admitted:result.accepted,reasons:result.reasons,turns:result.turns,accounting:result.accounting,rule:result.rule,
     history:result.history,inductionMedianRatio:result.inductionMedianRatio,gate:result.gate?.pages.map(p=>({accepted:p.accepted,reasons:p.reasons,textLength:p.textLength,
      uniqueCoverage:p.uniqueCoverage?.ratio,templateBlocksRetained:p.templateCoverage?.kept,substantiveRatio:p.substantiveRatio})),heldOut:[]};
    const out=path.join(directory,site.id);fs.mkdirSync(out,{recursive:true});
    for(const [i,p] of site.pages.slice(2,5).entries()) {
     if(p.skip){row.heldOut.push({page:p.id,skipped:true,reasons:['final-host-left-site']});continue;}
     const held=load(p);try {
      const doc=held.window.document,verdict=result.accepted?v3.useTime(doc,result.rule,result):{accepted:false,reasons:['induction-not-admitted'],fallback:true};
      const html=verdict.accepted?verdict.html:core.fallback(doc).html;
      fs.writeFileSync(path.join(out,`p${i+3}.html`),html,{flag:'wx'});
      row.heldOut.push({page:p.id,accepted:verdict.accepted,fallback:!verdict.accepted,reasons:verdict.reasons,textLength:verdict.textLength,substantiveRatio:verdict.substantiveRatio,firstLines:firstLines(doc,html)});
     }finally{held.window.close();}
    }
    row.p3FirstLines=row.heldOut[0]?.firstLines || [];
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(row,null,2),{flag:'wx'});report.sites.push(row);
    console.log(JSON.stringify({event:'site-result',...row}));
    if(result.reason==='budget')break;
   } finally {for(const d of doms)d.window.close();}
  }
 } finally {
  runner.close();report.finishedAt=new Date().toISOString();report.ledger=ledger.totals();
  // Preserve initial run record; write a separate immutable completion receipt.
  fs.writeFileSync(path.join(directory,'complete.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({event:'complete',directory,ledger:report.ledger,promptHash:PROMPT_HASH}));
 }
 return report;
}
if(require.main===module){const args=process.argv.slice(2);develop({october:args.includes('--october'),thinking:args.includes('--thinking'),
 siteIds:args.filter(a=>a.startsWith('--site=')).map(a=>a.slice(7)),limit:Number(args.find(a=>a.startsWith('--limit='))?.slice(8)||Infinity)}).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={sources,load,firstLines,develop};
