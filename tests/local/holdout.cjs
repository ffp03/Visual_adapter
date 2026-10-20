// Untouched-source study harness. All public source/reference selection precedes extraction.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{once}=require('node:events');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.resolve(__dirname,'../..'), BASE=path.join(ROOT,'workspace/task023/holdout-20261019');
const {withStudyLock}=require('./experiment-lock.cjs');
const sha=x=>createHash('sha256').update(x).digest('hex'), norm=x=>x.replace(/\s+/g,' ').trim();
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),save=(f,x)=>fs.writeFileSync(f,JSON.stringify(x,null,2));
const protocol=()=>read(path.join(BASE,'protocol.json'));
const folder=id=>path.join(BASE,id);
// Source annotation never executes scripts or uses CSS. Strip these before parsing
// to avoid pathological CSS parsing blocking source-only selection timers.
const domFor=(html,url)=>new JSDOM(html.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,''),{url,virtualConsole:new VirtualConsole()});
function reference(html,url){
 const dom=domFor(html,url),doc=dom.window.document;
 try{
  doc.querySelectorAll('script,style,template,noscript').forEach(e=>e.remove());
  const roots=[...doc.querySelectorAll('main,article,[role="main"]')];
  const region=roots.sort((a,b)=>norm(b.textContent).length-norm(a.textContent).length)[0]||doc.body;
  const sourceNoise=[...doc.querySelectorAll('nav,[role="navigation"],[class*="advertisement"]')].filter(e=>!region.contains(e)&&norm(e.textContent).length>=60).slice(0,2).map(e=>norm(e.textContent).slice(0,140));
  const targets=[],add=e=>{if(!e||e.closest('nav,footer,[role="navigation"]'))return;const text=norm(e.textContent).slice(0,180);if((text.length>=10||(e.tagName==='H1'&&text.length))&&!targets.some(t=>t.text===text))targets.push({text,tag:e.tagName,id:e.id||null});};
  add(region.querySelector('h1')||doc.querySelector('h1'));
  [...region.querySelectorAll('h2,h3,h4')].forEach(add);
  const paragraphs=[...region.querySelectorAll('p,blockquote,[itemprop="text"],[itemprop="commentText"],.comment-body')].filter(e=>norm(e.textContent).length>=80);
  [paragraphs[0],paragraphs[Math.floor(paragraphs.length/2)],paragraphs.at(-1)].forEach(add);
  for(const selector of ['pre','table caption','table tr','ul li','ol li','[itemprop="price"]','[role="comment"]'])add([...region.querySelectorAll(selector)].find(e=>norm(e.textContent).length>=20));
  const links=[...region.querySelectorAll('a[href]')].filter(e=>norm(e.textContent).length>=20).slice(0,2).map(e=>({text:norm(e.textContent).slice(0,100),url:new URL(e.getAttribute('href'),doc.baseURI).href,originalHref:e.getAttribute('href')}));
  const images=[...region.querySelectorAll('figure img,img[alt]')].filter(e=>(e.closest('figure')||e.getAttribute('alt')?.length>=20)&&e.getAttribute('src')&&!/logo|icon|avatar/i.test(e.getAttribute('alt')||'')).slice(0,2).map(e=>({url:new URL(e.getAttribute('src'),doc.baseURI).href,alt:e.getAttribute('alt')||''}));
  const noise=sourceNoise;
  const shell=/access denied|just a moment|verify you are human|request blocked|robot check|enable javascript and cookies/i.test(doc.title+' '+norm(region.textContent).slice(0,500));
  return {title:doc.title,targets,links,images,noise,paragraphs:paragraphs.length,regionTag:region.tagName,shell,scorable:!shell&&targets.length>=3,policy:'Source-only deterministic primary-region annotation; headings, first/middle/last paragraphs, representative structures, links/images and external navigation. Not human gold labels.'};
 }finally{dom.window.close();}
}
let navigations=0;
async function acquire(url,id){
 if(++navigations>120)throw Error('120 navigation cap');
 if(fs.existsSync(path.join(folder(id),'capture.json'))){const meta=read(path.join(folder(id),'capture.json'));const html=fs.readFileSync(path.join(folder(id),'source.html'),'utf8');if(sha(html)!==meta.sha256)throw Error('Cached source mismatch');if(meta.status<200||meta.status>=300)return{...meta,id,disposition:'http-'+meta.status};const refs=reference(html,meta.finalUrl),refFile=path.join(folder(id),'references.json');if(fs.existsSync(refFile)){const archive=path.join(BASE,'archive/cached-references');fs.mkdirSync(archive,{recursive:true});fs.copyFileSync(refFile,path.join(archive,id+'-'+Date.now()+'.json'));}save(refFile,refs);return{...meta,id,referenceSha256:sha(fs.readFileSync(refFile)),disposition:refs.scorable?'scorable':'insufficient-source',referenceCount:refs.targets.length};}
 const start=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 fs.mkdirSync(folder(id),{recursive:true});
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{'User-Agent':'VisualAdapterResearch/1.0 (public reading assessment)'}});
  const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>3*1024*1024)throw Error('snapshot exceeds3MB');chunks.push(chunk);}
  const html=Buffer.concat(chunks).toString('utf8'),meta={url,finalUrl:response.url,status:response.status,bytes,sha256:sha(html),mode:'unauthenticated HTTP',elapsedMs:Date.now()-start,at:new Date().toISOString()};
  fs.writeFileSync(path.join(folder(id),'source.html'),html);save(path.join(folder(id),'capture.json'),meta);
  if(!response.ok)return{...meta,id,disposition:'http-'+response.status};
  const refs=reference(html,response.url);save(path.join(folder(id),'references.json'),refs);
  return{...meta,id,referenceSha256:sha(fs.readFileSync(path.join(folder(id),'references.json'))),disposition:refs.scorable?'scorable':'insufficient-source',referenceCount:refs.targets.length};
 }catch(e){const x={id,url,disposition:'unavailable',error:e.name==='AbortError'?'15s source timeout':e.message};save(path.join(folder(id),'capture-error.json'),x);return x;}finally{clearTimeout(timer);}
}
function discover(row,domain,type){
 if(!fs.existsSync(path.join(folder(row.id),'source.html')))return[];
 const dom=domFor(fs.readFileSync(path.join(folder(row.id),'source.html'),'utf8'),row.finalUrl||row.url);
 try{
  const seen=new Set(),links=[...dom.window.document.querySelectorAll('main a[href],article a[href],[role="main"] a[href],body a[href]')].flatMap(e=>{try{const u=new URL(e.getAttribute('href'),row.finalUrl||row.url);u.hash='';if(u.protocol!=='https:'||!(u.hostname===domain||u.hostname.endsWith('.'+domain))||/\.(pdf|png|jpg|zip|mp4|xml)$/i.test(u.pathname)||u.pathname==='/'||/login|signin|account|cart|privacy|cookie|search|subscribe/i.test(u.pathname)||norm(e.textContent).length<18||seen.has(u.href))return[];seen.add(u.href);return[{url:u.href,text:norm(e.textContent),depth:u.pathname.split('/').filter(Boolean).length}];}catch{return[];}});
  links.sort((a,b)=>b.depth-a.depth||b.text.length-a.text.length);
  if(!links.length)return[];
  const first=links[0],family=u=>new URL(u).pathname.split('/').filter(Boolean)[0];
  const second=links.find(x=>x.url!==first.url&&(type==='within-family'?family(x.url)===family(first.url):family(x.url)!==family(first.url)));
  return[first.url,...(second?[second.url]:[])];
 }finally{dom.window.close();}
}
async function capture(){
 if(fs.existsSync(path.join(BASE,'manifest.json')))throw Error('Manifest exists; no recapture');
 const candidates=protocol().candidates.filter(x=>!x.seenInDevelopment),dispositions=new Array(40);let next=0;
 if(candidates.length!==40)throw Error('Protocol must contain exactly40 untouched candidates');
 async function worker(){while(next<candidates.length){const i=next++;
  const candidate=candidates[i],type=i%2?'across-family':'within-family',prefix='site'+String(i+1).padStart(2,'0');
  const root=await acquire('https://'+candidate.domain+'/',prefix+'-discovery'),urls=discover(root,candidate.domain,type);
  const pages=[];for(let j=0;j<urls.length;j++)pages.push(await acquire(urls[j],prefix+'-'+(j+1)));
  const eligible=pages.length===2&&pages.every(p=>p.disposition==='scorable');
  dispositions[i]={...candidate,index:i+1,type,discovery:root,pages,eligible,disposition:eligible?'selected':urls.length<2?'pair-type-unavailable':pages.map(p=>p.disposition).join('/')};
  save(path.join(BASE,'capture-checkpoint.json'),{candidates:dispositions.filter(Boolean).length,navigations,selected:dispositions.filter(x=>x?.eligible).length,dispositions});
  console.log(JSON.stringify({phase:'capture',candidate:i+1,domain:candidate.domain,eligible,disposition:dispositions[i].disposition,navigations}));
 }}await Promise.all([worker(),worker(),worker(),worker()]);
 const manifest={frozenAt:new Date().toISOString(),protocolSha256:sha(fs.readFileSync(path.join(BASE,'protocol.json'))),navigations,candidateDenominator:40,dispositions,pages:dispositions.filter(x=>x.eligible).flatMap(x=>x.pages.map((p,j)=>({...p,site:x.index,domain:x.domain,type:x.type,position:j+1})))};
 save(path.join(BASE,'manifest.json'),manifest);fs.writeFileSync(path.join(BASE,'manifest.sha256'),sha(fs.readFileSync(path.join(BASE,'manifest.json'))));
}
function verify(){
 const file=path.join(BASE,'manifest.json');if(sha(fs.readFileSync(file))!==fs.readFileSync(path.join(BASE,'manifest.sha256'),'utf8'))throw Error('Manifest hash mismatch');
 const m=read(file);if(sha(fs.readFileSync(path.join(BASE,'protocol.json')))!==m.protocolSha256)throw Error('Protocol hash mismatch');
 for(const p of m.pages){if(sha(fs.readFileSync(path.join(folder(p.id),'source.html')))!==p.sha256||sha(fs.readFileSync(path.join(folder(p.id),'references.json')))!==p.referenceSha256)throw Error('Source/reference mismatch '+p.id);}
 for(const [file,hash]of Object.entries(protocol().baseline.files))if(sha(fs.readFileSync(path.join(ROOT,file)))!==hash)throw Error('Production drift '+file);
 const frozen=path.join(BASE,'harness-freeze.json');if(fs.existsSync(frozen))for(const[file,hash]of Object.entries(read(frozen).files))if(sha(fs.readFileSync(path.join(ROOT,file)))!==hash)throw Error('Harness drift '+file);
 return m;
}
function freezeHarness(){const destination=path.join(BASE,'harness-freeze.json');if(fs.existsSync(destination)){verify();return read(destination);}if(ledger().length)throw Error('Cannot freeze after provider ledger events');const m=verify();for(const d of fs.readdirSync(BASE,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^site/.test(d.name)))for(const name of fs.readdirSync(path.join(BASE,d.name)))if(!['source.html','capture.json','references.json','capture-error.json'].includes(name))throw Error('Cannot freeze after any candidate page outputs '+d.name+'/'+name);const files=['tests/local/holdout.cjs','tests/local/experiment-lock.cjs'];for(const d of fs.readdirSync(BASE,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^site/.test(d.name)))for(const name of ['source.html','references.json','capture.json']){const f=path.join(BASE,d.name,name);if(fs.existsSync(f))files.push(path.relative(ROOT,f));}save(destination,{at:new Date().toISOString(),noPriorOutputsVerified:true,manifestSha256:sha(fs.readFileSync(path.join(BASE,'manifest.json'))),files:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(ROOT,f)))]))});}
const ledgerFile=path.join(BASE,'provider-attempts.jsonl'),ledger=()=>fs.existsSync(ledgerFile)?fs.readFileSync(ledgerFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
const append=x=>fs.appendFileSync(ledgerFile,JSON.stringify({...x,at:new Date().toISOString()})+'\n');
async function generate(p,context){return withStudyLock(BASE,p.id,async()=>{
 verify();if(ledger().some(x=>x.page===p.id)||fs.existsSync(path.join(folder(p.id),'provider-result.json')))throw Error('Attempt/artifact exists: replay only '+p.id);
 const starts=ledger().filter(x=>x.event==='started');if(starts.length>=80||(starts.length+1)*62500>5000000)throw Error('Budget cap');
 const {createLocalServer}=require('../../backend/local-ai.cjs'),{DeepSeekRunner}=require('../../backend/deepseek-runner.cjs');
 const runner=new DeepSeekRunner(),real=runner.generate.bind(runner),contextBytes=JSON.stringify(context);fs.writeFileSync(path.join(folder(p.id),'analysis-context.json'),contextBytes);
 runner.generate=async input=>{const attempt=starts.length+1;fs.writeFileSync(path.join(folder(p.id),'model-input.html'),input);append({event:'started',attempt,page:p.id,inputSha256:sha(input),contextSha256:sha(contextBytes),reservationMicroUsd:62500});
  try{const result=await real(input),bytes=JSON.stringify(result);fs.writeFileSync(path.join(folder(p.id),'provider-result.json'),bytes);append({event:'completed',attempt,page:p.id,outputSha256:sha(bytes),requestId:result.requestId,usage:result.usage,servedModel:result.servedModel});return result;}
  catch(e){append({event:'failed',attempt,page:p.id,error:e.message,requestId:e.requestId||null,usage:e.usage||null});throw e;}
 };
 const server=createLocalServer({runner,directory:path.join(folder(p.id),'backend-cache'),maxCalls:1});
 try{server.listen(0,'127.0.0.1');await once(server,'listening');const start=Date.now(),response=await fetch('http://127.0.0.1:'+server.address().port+'/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hostname:new URL(p.finalUrl).hostname,html:context.analysisHTML||context.html}),signal:AbortSignal.timeout(65000)});const output={...await response.json(),status:response.status,providerMs:Date.now()-start},bytes=JSON.stringify(output);fs.writeFileSync(path.join(folder(p.id),'backend-result.json'),bytes);append({event:'backend-result',page:p.id,backendSha256:sha(bytes),contextSha256:sha(contextBytes)});return output;
 }finally{runner.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});}
function verifiedBackend(p,overrideEvents,overrideFolder){
 const events=overrideEvents||ledger().filter(e=>e.page===p.id),start=events.find(e=>e.event==='started'),done=events.find(e=>e.event==='completed'),bound=events.find(e=>e.event==='backend-result'),f=overrideFolder||folder(p.id);
 const backendBytes=fs.readFileSync(path.join(f,'backend-result.json'));if(!bound||sha(backendBytes)!==bound.backendSha256)throw Error('Unbound/altered backend result');
 const contextBytes=fs.readFileSync(path.join(f,'analysis-context.json'));if(sha(contextBytes)!==bound.contextSha256||(start&&sha(contextBytes)!==start.contextSha256))throw Error('Altered complete analysis context');
 if(start&&sha(fs.readFileSync(path.join(f,'model-input.html')))!==start.inputSha256)throw Error('Altered model input');
 const context=JSON.parse(contextBytes),{cleanHTML,validateRule}=require('../../backend/local-ai.cjs');let clean;
 if(start){clean=cleanHTML(context.analysisHTML||context.html);if(sha(clean.slice(0,30000))!==start.inputSha256)throw Error('Context and model input differ');}
 const rawFile=path.join(f,'provider-result.json');let raw;
 if(done){if(!start)throw Error('Completion lacks start');const rawBytes=fs.readFileSync(rawFile);if(sha(rawBytes)!==done.outputSha256)throw Error('Altered raw provider output');raw=JSON.parse(rawBytes);}
 else if(fs.existsSync(rawFile))throw Error('Raw result lacks completion provenance');
 const backend=JSON.parse(backendBytes);if(backend.success){if(!start||!done)throw Error('Success lacks completed provider provenance');const derived=validateRule(raw.rule,clean);if(JSON.stringify(derived)!==JSON.stringify(backend.rule))throw Error('Backend rule differs from verified deterministic normalization');}
 return backend;
}
async function browser(){
 const {chromium}=require('C:/Users/final/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const b=await chromium.launch({executablePath:'C:/Users/final/AppData/Local/Chromium/Application/chrome.exe',headless:true});
 return{b,engine:b.version(),async measure(p,rules,name){
  const pg=await b.newPage(),html=fs.readFileSync(path.join(folder(p.id),'source.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,''),deadline=setTimeout(()=>pg.close().catch(()=>{}),30000);
  try{await pg.route('**/*',r=>r.request().isNavigationRequest()&&r.request().frame()===pg.mainFrame()?r.fulfill({status:200,contentType:'text/html',body:html}):r.abort());await pg.goto(p.finalUrl,{timeout:20000,waitUntil:'domcontentloaded'});
   await pg.evaluate(rules=>{window.__rules=rules;window.__listeners=[];window.chrome.runtime={sendMessage:async()=>({rules:window.__rules}),onMessage:{addListener:f=>window.__listeners.push(f)}};},rules);
   await pg.addScriptTag({content:fs.readFileSync(path.join(ROOT,'extension/content.js'),'utf8')});
   const refs=read(path.join(folder(p.id),'references.json'));
   const result=await pg.evaluate(async refs=>{const norm=x=>x.replace(/\s+/g,' ').trim(),reader=document.createElement('div'),times=[];let out;
    for(let i=0;i<3;i++){const t=performance.now();out=await new Promise(r=>window.__listeners[0]({action:'EXTRACT_CONTEXT'},{},r));reader.innerHTML=out.html||'';times.push(performance.now()-t);}
    const targets=refs.targets.map(t=>({...t,retained:[...reader.querySelectorAll(t.tag.toLowerCase())].some(e=>(!t.id||e.id===t.id)&&norm(e.textContent).includes(t.text))}));
    const noise=refs.noise.map(t=>({retained:norm(reader.textContent).includes(t)}));
    const links=refs.links.map(t=>({url:t.url,retained:[...reader.querySelectorAll('a[href]')].some(e=>{const href=e.getAttribute('href');let validFragment=false;if(t.originalHref?.startsWith('#')&&href===t.originalHref){try{const target=decodeURIComponent(href.slice(1));validFragment=!!target&&[...reader.querySelectorAll('[id],a[name]')].some(x=>x.id===target||x.getAttribute('name')===target);}catch{}}return norm(e.textContent).includes(t.text)&&(href===t.url||validFragment);})}));
    const images=refs.images.map(t=>({url:t.url,retained:[...reader.querySelectorAll('img[src]')].some(e=>e.getAttribute('src')===t.url)}));
    const relativeUrls=[...reader.querySelectorAll('a[href],img[src]')].filter(e=>{const v=e.getAttribute(e.tagName==='IMG'?'src':'href');return v&&!/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(v);}).length;
    const complete=targets.length>=3&&targets.every(t=>t.retained)&&noise.every(t=>!t.retained)&&links.every(t=>t.retained)&&images.every(t=>t.retained)&&relativeUrls===0;
    return{out,targets,noise,links,images,relativeUrls,complete,usedRule:!!out.usedRule,noFallbackPass:!!out.usedRule&&complete,retained:targets.filter(t=>t.retained).length,total:targets.length,localMs:times,medianLocalMs:[...times].sort((a,b)=>a-b)[1]};
   },refs);
   const context=result.out;fs.writeFileSync(path.join(folder(p.id),name+'.html'),context.html||'');delete result.out;const scored={...result,id:p.id,site:p.site,position:p.position,approach:name,engine:b.version(),sourceSha256:p.sha256,referenceSha256:p.referenceSha256};save(path.join(folder(p.id),name+'.json'),scored);return{result:scored,context};
  }finally{clearTimeout(deadline);await pg.close();}
 }};
}
async function run(){
 if(!fs.existsSync(path.join(BASE,'harness-freeze.json')))throw Error('Freeze reviewed harness before execution');
 const m=verify(),br=await browser();let count=0;
 async function measure(p,rules,name){verify();try{return await br.measure(p,rules,name);}catch(e){const refs=read(path.join(folder(p.id),'references.json')),result={id:p.id,site:p.site,position:p.position,approach:name,complete:false,usedRule:false,noFallbackPass:false,retained:0,total:refs.targets.length,medianLocalMs:null,measurementError:e.message.slice(0,300)};save(path.join(folder(p.id),name+'.json'),result);return{result,context:null};}}
 try{for(const site of m.dispositions.filter(x=>x.eligible)){
  let seed=null;for(const p of m.pages.filter(p=>p.site===site.index)){
   const fallback=await measure(p,[],'fallback');save(path.join(folder(p.id),'fallback-context.json'),fallback.context);
   if(!fallback.context){for(const approach of ['raw-model','fresh','shared'])save(path.join(folder(p.id),approach+'.json'),{...fallback.result,approach,measurementError:'Source local fallback measurement failed; no provider request'});continue;}
   let backend;if(!fs.existsSync(path.join(folder(p.id),'backend-result.json')))await generate(p,fallback.context);backend=verifiedBackend(p);
   const fresh=backend.success?[backend.rule]:[];if(p.position===1)seed=fresh;
   const providerFile=path.join(folder(p.id),'provider-result.json');if(fs.existsSync(providerFile)){const raw=read(providerFile);await measure(p,[raw.rule],'raw-model');}else save(path.join(folder(p.id),'raw-model.json'),{...fallback.result,approach:'raw-model',complete:false,usedRule:false,noFallbackPass:false,retained:0,medianLocalMs:null,providerFailure:true,unmeasured:true});
   await measure(p,fresh,'fresh');await measure(p,seed||[],'shared');
  }
  count++;console.log(JSON.stringify({phase:'evaluated',sites:count,pages:count*2,starts:ledger().filter(x=>x.event==='started').length}));summary();
 }}finally{await br.b.close();}summary();
}
function summary(){
 const m=verify(),results=[];for(const p of m.pages)for(const approach of ['fallback','raw-model','fresh','shared']){const f=path.join(folder(p.id),approach+'.json');if(fs.existsSync(f))results.push(read(f));}
 const events=ledger(),starts=events.filter(e=>e.event==='started'),completions=events.filter(e=>e.event==='completed'),failures=events.filter(e=>e.event==='failed');
 const metrics={};for(const approach of ['fallback','raw-model','fresh','shared']){const rows=results.filter(r=>r.approach===approach),sites=m.dispositions.filter(s=>s.eligible);metrics[approach]={pages:rows.length,pageDenominator:m.pages.length,siteDenominator:sites.length,completePages:rows.filter(r=>r.complete).length,noFallbackPages:rows.filter(r=>r.noFallbackPass).length,...siteCounts(rows,sites),retainedAnchors:rows.reduce((a,r)=>a+r.retained,0),totalAnchors:rows.reduce((a,r)=>a+r.total,0),medianLocalMs:rows.length?[...rows.map(r=>r.medianLocalMs)].filter(x=>typeof x==='number').sort((a,b)=>a-b)[Math.floor(rows.filter(r=>typeof r.medianLocalMs==='number').length/2)]??null:null};}
 for(const e of starts)if(sha(fs.readFileSync(path.join(folder(e.page),'model-input.html')))!==e.inputSha256)throw Error('Saved model input mismatch');
 for(const e of completions)if(sha(fs.readFileSync(path.join(folder(e.page),'provider-result.json')))!==e.outputSha256)throw Error('Saved provider output mismatch');
 const usage=[...completions,...failures].reduce((a,e)=>{for(const[k,v]of Object.entries(e.usage||{}))if(typeof v==='number')a[k]=(a[k]||0)+v;return a;},{});
 const report={baselineCommit:protocol().baseline.sourceCommit,harnessSha256:sha(fs.readFileSync(__filename)),manifestSha256:sha(fs.readFileSync(path.join(BASE,'manifest.json'))),candidateDenominator:40,scorableSites:m.dispositions.filter(x=>x.eligible).length,scorablePages:m.pages.length,dispositions:m.dispositions,metrics,ledger:{starts:starts.length,completions:completions.length,failures:failures.length,pending:starts.length-completions.length-failures.length,reservedUsd:starts.length*.0625,usage,requestIDs:[...completions,...failures].map(e=>e.requestId).filter(Boolean)},results,limitations:['Unauthenticated static HTTP snapshots; JavaScript-only sources may be unavailable.','Source-only algorithmic annotations, not independent human gold labels.','Chromium production content script with Chrome messaging doubles; disconnected reader HTML assignment; three repeats; navigation/parse excluded. No end-to-end extension UI or accessibility/user-benefit verification.','Convenience sample; shared site pair can span subdomains; inference always isolated and reused seed without extra calls.'],finishedAt:new Date().toISOString()};save(path.join(BASE,'handback.json'),report);save(path.join(BASE,'summary.json'),{...report,dispositions:undefined,results:undefined});fs.writeFileSync(path.join(BASE,'summary.csv'),'id,site,position,approach,retained,total,complete,usedRule,noFallbackPass,medianLocalMs\n'+results.map(r=>[r.id,r.site,r.position,r.approach,r.retained,r.total,r.complete,r.usedRule,r.noFallbackPass,r.medianLocalMs].join(',')).join('\n'));return report;
}
function siteCounts(rows,sites){const success=(s,key)=>{const r=rows.filter(r=>r.site===s.index);return r.length===2&&r.some(r=>r.position===1)&&r.some(r=>r.position===2)&&r.every(r=>r[key]);};return{completeSites:sites.filter(s=>success(s,'complete')).length,noFallbackSites:sites.filter(s=>success(s,'noFallbackPass')).length};}
module.exports={reference,verify,sha,summary,acquire,freezeHarness,verifiedBackend,siteCounts,BASE};
if(require.main===module)({capture,run,summary}[process.argv[2]]||(()=>{throw Error('Choose capture/run/summary');}))().catch?.(e=>{console.error(e.stack);process.exitCode=1;});
