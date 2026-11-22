#!/usr/bin/env node
'use strict';

// WP-A1 frozen browser capture utility. Each page folder is create-once.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright-core');
const { lintCapture } = require('./check-reference.cjs');

const ROOT = path.resolve(__dirname, '../../..');
const CORPUS = path.join(ROOT, 'workspace/revision/corpus');
const VIEWPORT = { width: 1280, height: 900 };
const HOST_LAST_REQUEST = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dev = [
  { id:'dev-01', host:'blog.python.org', category:'Blog', urls:[
    'https://blog.python.org/2024/02/python-3122-and-3118-are-now-available/',
    'https://blog.python.org/2024/01/python-3130-alpha-3-is-now-available/',
    'https://blog.python.org/2023/12/python-3117-is-now-available/',
    'https://blog.python.org/2023/10/python-3120-final-now-available/',
    'https://blog.python.org/2024/04/python-3119-is-now-available/'] },
  { id:'dev-02', host:'books.toscrape.com', category:'Commerce', urls:[
    'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
    'https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html',
    'https://books.toscrape.com/catalogue/soumission_998/index.html',
    'https://books.toscrape.com/catalogue/sharp-objects_997/index.html',
    'https://books.toscrape.com/catalogue/sapiens-a-brief-history-of-humankind_996/index.html'] },
  { id:'dev-03', host:'developer.mozilla.org', category:'Technical documentation', urls:[
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction',
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types',
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling',
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Loops_and_iteration',
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions'] },
  { id:'dev-04', host:'en.wikipedia.org', category:'Reference/collections', urls:[
    'https://en.wikipedia.org/wiki/HTML', 'https://en.wikipedia.org/wiki/Cascading_Style_Sheets',
    'https://en.wikipedia.org/wiki/JavaScript', 'https://en.wikipedia.org/wiki/HTTP',
    'https://en.wikipedia.org/wiki/World_Wide_Web'] },
  { id:'dev-05', host:'news.ycombinator.com', category:'Discussion', urls:[8863, 1, 2, 3, 4].map(id=>`https://news.ycombinator.com/item?id=${id}`) },
  { id:'dev-06', host:'www.gov.uk', category:'Government/public information', urls:[
    'https://www.gov.uk/guidance/managing-candidates-through-pre-employment-checks-vx',
    'https://www.gov.uk/guidance/guide-to-governance-and-management-frameworks',
    'https://www.gov.uk/guidance/check-genuine-hmrc-contact-that-uses-more-than-one-communication-method',
    'https://www.gov.uk/guidance/resilience-guidance-and-doctrine',
    'https://www.gov.uk/guidance/find-data-ethics-guidance-standards-and-frameworks'] },
  { id:'dev-07', host:'www.w3.org', category:'Technical documentation', urls:[
    'https://www.w3.org/TR/WCAG22/', 'https://www.w3.org/TR/css-nesting-1/', 'https://www.w3.org/TR/css-values-4/',
    'https://www.w3.org/TR/css-flexbox-1/', 'https://www.w3.org/TR/css-grid-2/'] },
  { id:'dev-08', host:'www.bbc.co.uk', category:'News', urls:[
    'https://www.bbc.com/news/articles/cxnv4zvmdy0jo', 'https://www.bbc.com/news/articles/cqgm0zlkgrm2o',
    'https://www.bbc.com/news/articles/c6pqr2g7w059o', 'https://www.bbc.com/news/articles/c64gn0gy8rj3o',
    'https://www.bbc.com/news/articles/cwvg21gyl650o'] },
  { id:'dev-09', host:'www.keychron.com', category:'Product pages', urls:[
    'https://www.keychron.com/products/keychron-q1-qmk-custom-mechanical-keyboard-knob-version',
    'https://www.keychron.com/products/keychron-q2-max-qmk-via-wireless-custom-mechanical-keyboard',
    'https://www.keychron.com/products/keychron-q3-max-qmk-via-wireless-custom-mechanical-keyboard',
    'https://www.keychron.com/products/keychron-q4-pro-qmk-via-wireless-custom-mechanical-keyboard',
    'https://www.keychron.com/products/keychron-q5-max-qmk-via-wireless-custom-mechanical-keyboard'] },
  { id:'dev-10', host:'discuss.ardupilot.org', category:'Forum/Q&A threads', listing:true, urls:[
    'https://discuss.ardupilot.org/latest'] },
  { id:'dev-11', host:'developer.chrome.com', category:'Client-rendered site', urls:[
    'https://developer.chrome.com/docs/devtools/overview/',
    'https://developer.chrome.com/docs/devtools/dom/',
    'https://developer.chrome.com/docs/devtools/console/',
    'https://developer.chrome.com/docs/devtools/network/',
    'https://developer.chrome.com/docs/devtools/performance/'] },
  { id:'dev-12', host:'www.rfc-editor.org', category:'Site without main/article markup', urls:[
    'https://www.rfc-editor.org/rfc/rfc9110.html', 'https://www.rfc-editor.org/rfc/rfc9111.html',
    'https://www.rfc-editor.org/rfc/rfc9112.html', 'https://www.rfc-editor.org/rfc/rfc9113.html',
    'https://www.rfc-editor.org/rfc/rfc9114.html'] }
];
const newEvalSites = [
  {host:'store.arduino.cc',category:'Product pages',seed:'https://store.arduino.cc/products/uno-r4-wifi'},
  {host:'shop.pimoroni.com',category:'Product pages',seed:'https://shop.pimoroni.com/products/raspberry-pi-5'},
  {host:'www.logitech.com',category:'Product pages',seed:'https://www.logitech.com/en-ca/products/mice/mx-master-3s.html',urls:[
    'https://www.logitech.com/en-ca/products/mice/mx-master-3s.html',
    'https://www.logitech.com/en-ca/products/mice/mx-anywhere-3s.html',
    'https://www.logitech.com/en-ca/products/mice/lift-vertical-ergonomic-mouse.html',
    'https://www.logitech.com/en-ca/products/keyboards/mx-keys-s.html',
    'https://www.logitech.com/en-ca/products/keyboards/mx-mechanical.html']},
  {host:'www.razer.com',category:'Product pages',seed:'https://www.razer.com/gaming-mice/razer-deathadder-v3-pro',urls:[
    'https://www.razer.com/gaming-mice/razer-deathadder-v3-pro','https://www.razer.com/gaming-mice/razer-viper-v3-pro',
    'https://www.razer.com/gaming-mice/razer-basilisk-v3-pro','https://www.razer.com/gaming-mice/razer-cobra-pro',
    'https://www.razer.com/gaming-mice/razer-orochi-v2']},
  {host:'community.home-assistant.io',category:'Forum/Q&A threads',seed:'https://community.home-assistant.io/latest'},
  {host:'discuss.python.org',category:'Forum/Q&A threads',seed:'https://discuss.python.org/latest'},
  {host:'forum.arduino.cc',category:'Forum/Q&A threads',seed:'https://forum.arduino.cc/latest'},
  {host:'www.legislation.gov.uk',category:'Listing/category pages',seed:'https://www.legislation.gov.uk/uksi/2025',urls:[
    'https://www.legislation.gov.uk/uksi/2025','https://www.legislation.gov.uk/uksi/2024','https://www.legislation.gov.uk/uksi/2023',
    'https://www.legislation.gov.uk/uksi/2022','https://www.legislation.gov.uk/uksi/2021']},
  {host:'www.nps.gov',category:'Listing/category pages',seed:'https://www.nps.gov/subjects/camping/index.htm',urls:[
    'https://www.nps.gov/subjects/camping/index.htm','https://www.nps.gov/subjects/volunteer/index.htm',
    'https://www.nps.gov/subjects/air/index.htm','https://www.nps.gov/subjects/geology/index.htm',
    'https://www.nps.gov/subjects/climatechange/index.htm']},
  {host:'docs.djangoproject.com',category:'Documentation with sidebars or tabs',seed:'https://docs.djangoproject.com/en/stable/intro/tutorial01/'},
  {host:'doc.rust-lang.org',category:'Documentation with sidebars or tabs',seed:'https://doc.rust-lang.org/book/ch01-00-getting-started.html'},
  {host:'react.dev',category:'Documentation with sidebars or tabs',seed:'https://react.dev/learn'},
  {host:'angular.dev',category:'Client-rendered pages',seed:'https://angular.dev/overview',urls:[
    'https://angular.dev/overview','https://angular.dev/essentials','https://angular.dev/tutorials/learn-angular',
    'https://angular.dev/guide/components','https://angular.dev/guide/signals']},
  {host:'svelte.dev',category:'Client-rendered pages',seed:'https://svelte.dev/docs/svelte/overview'},
  {host:'vuejs.org',category:'Client-rendered pages',seed:'https://vuejs.org/guide/introduction.html'},
  {host:'www.weather.gov',category:'Pages without main/article markup',seed:'https://www.weather.gov/safety/',urls:[
    'https://www.weather.gov/safety/','https://www.weather.gov/Contact','https://www.weather.gov/hazstat',
    'https://www.weather.gov/sju/','https://www.weather.gov/wrn/wea']},
  {host:'info.cern.ch',category:'Pages without main/article markup',seed:'http://info.cern.ch/hypertext/WWW/WhatIs.html',urls:[
    'http://info.cern.ch/hypertext/WWW/WhatIs.html','http://info.cern.ch/hypertext/WWW/TheProject.html',
    'http://info.cern.ch/hypertext/WWW/FAQ/List.html','http://info.cern.ch/hypertext/WWW/Summary.html',
    'http://info.cern.ch/hypertext/DataSources/Top.html']},
  {host:'tldp.org',category:'Pages without main/article markup',seed:'https://tldp.org/LDP/abs/html/why-shell.html',urls:[
    'https://tldp.org/LDP/abs/html/why-shell.html','https://tldp.org/LDP/abs/html/sha-bang.html',
    'https://tldp.org/LDP/abs/html/special-chars.html','https://tldp.org/LDP/abs/html/variables.html',
    'https://tldp.org/LDP/abs/html/quoting.html']},
];
const familyExceptions = new Set(['fresh-site11','fresh-site12','reserve-08']);

const normalize = s => String(s || '').replace(/\s+/gu, ' ').trim();
const canonicalUrl = value => { const u=new URL(value); u.hash=''; if(u.pathname.length>1)u.pathname=u.pathname.replace(/\/+$/,''); return u.href; };
const pageFolder = (split, site, n) => path.join(CORPUS, split, site.id, `${site.id}-p${n+1}`);

async function robotsAllowed(url) {
  const u = new URL(url), robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
  await waitForHostGap(robotsUrl);
  const res = await fetch(robotsUrl, { headers: { 'User-Agent': 'VisualAdapterResearch/1.0 (public page capture)' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok && res.status !== 404) throw new Error(`robots.txt returned HTTP ${res.status}`);
  const body = res.status === 404 ? '' : await res.text();
  noteHostRequest(robotsUrl);
  const rules=parseRobots(body,'visualadapterresearch');
  const target=u.pathname+u.search;
  const matched=rules.filter(rule=>robotsRuleMatches(rule.path,target)).sort((a,b)=>ruleSpecificity(b.path)-ruleSpecificity(a.path));
  const best=matched[0];
  const allowed=!best || best.allow || matched.find(rule=>ruleSpecificity(rule.path)===ruleSpecificity(best.path))?.allow===true;
  return { allowed, note:allowed?'robots.txt permits requested path':`robots.txt disallows ${best.path}` };
}

function parseRobots(body,agentToken) {
  const groups=[];let group=null;
  for(const raw of body.split(/\r?\n/)) {
    const line=raw.replace(/#.*/, '').trim();if(!line)continue;
    const at=line.indexOf(':');if(at<0)continue;
    const key=line.slice(0,at).trim().toLowerCase(),value=line.slice(at+1).trim();
    if(key==='user-agent') {
      if(group?.rules.length){groups.push(group);group=null;}
      if(!group)group={agents:[],rules:[]};
      group.agents.push(value.toLowerCase());
    } else if((key==='allow'||key==='disallow')&&group&&value) group.rules.push({allow:key==='allow',path:value});
  }
  if(group)groups.push(group);
  const specific=groups.flatMap(g=>g.agents.filter(a=>a!=='*'&&agentToken.includes(a)).map(a=>({specificity:a.length,rules:g.rules})));
  if(specific.length){const longest=Math.max(...specific.map(g=>g.specificity));return specific.filter(g=>g.specificity===longest).flatMap(g=>g.rules);}
  return groups.filter(g=>g.agents.includes('*')).flatMap(g=>g.rules);
}
function ruleSpecificity(rule){return rule.replace(/[*$]/g,'').length;}
function robotsRuleMatches(rule,target){
  const anchored=rule.endsWith('$'),source=anchored?rule.slice(0,-1):rule;
  const pattern=source.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');
  return new RegExp('^'+pattern+(anchored?'$':'')).test(target);
}
async function waitForHostGap(url){
  const host=new URL(url).host,last=HOST_LAST_REQUEST.get(host)||0,remaining=3000-(Date.now()-last);
  if(remaining>0)await sleep(remaining);
  HOST_LAST_REQUEST.set(host,Date.now());
}
function noteHostRequest(url){try{HOST_LAST_REQUEST.set(new URL(url).host,Date.now());}catch{}}
async function guardTopLevelNavigations(page,initialUrl){
  const seen=new Set([canonicalUrl(initialUrl)]);
  // Playwright route handlers are not invoked for later requests in an HTTP
  // redirect chain. Pause those responses through CDP before Chrome follows.
  const cdp=await page.context().newCDPSession(page);
  const {frameTree}=await cdp.send('Page.getFrameTree');
  await cdp.send('Fetch.enable',{patterns:[{resourceType:'Document',requestStage:'Response'}]});
  cdp.on('Fetch.requestPaused',async event=>{
    try{
      const location=event.responseHeaders?.find(h=>h.name.toLowerCase()==='location')?.value;
      if(event.frameId===frameTree.frame.id && event.responseStatusCode>=300 && event.responseStatusCode<400 && location){
        const target=new URL(location,event.request.url).href;
        const permission=await robotsAllowed(target);
        if(!permission.allowed){await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});return;}
        await waitForHostGap(target);
        noteHostRequest(target);seen.add(canonicalUrl(target));
      }
      await cdp.send('Fetch.continueResponse',{requestId:event.requestId});
    }catch(error){
      try{await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'});}catch{}
    }
  });
  await page.route('**/*',async route=>{
    const req=route.request();
    if(!req.isNavigationRequest()||req.frame()!==page.mainFrame())return route.continue();
    const target=req.url(),key=canonicalUrl(target);
    if(!seen.has(key)){
      const permission=await robotsAllowed(target);
      if(!permission.allowed)return route.abort();
      await sleep(3000);seen.add(key);
    }
    noteHostRequest(target);
    return route.continue();
  });
}

function sameFamily(a,b) {
  try {
    const x=new URL(a), y=new URL(b); if(x.hostname!==y.hostname) return false;
    const xs=x.pathname.split('/').filter(Boolean), ys=y.pathname.split('/').filter(Boolean);
    if(xs.length===0) return true;
    if(Math.abs(xs.length-ys.length)>1) return false;
    if(xs.length<=1 && ys.length<=1) return true;
    if(/^\d{4}$/.test(xs[0]||'') && /^\d{4}$/.test(ys[0]||'')) return xs.length===ys.length;
    if(xs[0]!==ys[0]) return false;
    const xe=xs.at(-1)?.match(/\.[a-z0-9]+$/i)?.[0]||'', ye=ys.at(-1)?.match(/\.[a-z0-9]+$/i)?.[0]||'';
    return xe===ye;
  } catch { return false; }
}

function sameCategoryFamily(site,base,candidate) {
  if(site.category!=='Product pages') return sameFamily(base,candidate);
  try {
    const b=new URL(base), c=new URL(candidate); if(b.hostname!==c.hostname) return false;
    const bs=b.pathname.split('/').filter(Boolean), cs=c.pathname.split('/').filter(Boolean);
    const marker=bs.findIndex(part=>['product','products','shop'].includes(part.toLowerCase()));
    if(marker>=0) return cs[marker]?.toLowerCase()===bs[marker].toLowerCase();
    return sameFamily(base,candidate);
  } catch { return false; }
}

function discoverLinks(html, baseUrl) {
  const {JSDOM}=require('jsdom');
  const markup=html.replace(/<(style|script|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  const doc=new JSDOM(markup,{url:baseUrl}).window.document, base=new URL(baseUrl), seg=base.pathname.split('/').filter(Boolean), prefix=seg[0]||'';
  const rows=[];
  for(const a of doc.querySelectorAll('a[href]')) {
    try {
      const u=new URL(a.href,baseUrl); if(!/^https?:$/.test(u.protocol)||u.hostname!==base.hostname) continue;
      u.hash=''; if(!u.search || /[?&]id=\d+/.test(u.search)){} else continue;
      if(u.href===base.href) continue;
      const p=u.pathname.toLowerCase(); if(/\.(png|jpe?g|gif|svg|webp|pdf|zip|css|js|xml|woff2?|mp4)$/i.test(p)) continue;
      if(/\/t\/[^/]+\/\d+\/\d+\/?$/i.test(p)) continue;
      if(prefix && seg.length>1 && prefix!=='latest' && !/^\d{4}$/.test(prefix) && u.pathname.split('/').filter(Boolean)[0]!==prefix) continue;
      if(seg.length && Math.abs(u.pathname.split('/').filter(Boolean).length-seg.length)>2) continue;
      const text=normalize(a.textContent); if(text.length<2 || /^(login|sign in|subscribe|home|next|previous)$/i.test(text)) continue;
      rows.push({url:u.href,text,score:(a.closest('main,article,[role="main"],.related,.recommend')?5:0)+Math.min(text.length,80)/100});
    } catch {}
  }
  const unique=new Map(); for(const row of rows) if(!unique.has(row.url)) unique.set(row.url,row);
  return [...unique.values()].sort((a,b)=>b.score-a.score).map(row=>row.url);
}

async function discoverForumThread(browser, url) {
  const allowed=await robotsAllowed(url); if(!allowed.allowed) throw new Error(`robots disallows listing ${url}`);
  await sleep(3000);
  const context=await browser.newContext({viewport:VIEWPORT}), page=await context.newPage();
  try {
    await guardTopLevelNavigations(page,url);
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    if(!response||response.status()>=400) throw new Error(`listing HTTP ${response?.status()??'no response'}`);
    try { await page.waitForLoadState('networkidle',{timeout:15000}); } catch {}
    const html=await page.content();
    const links=discoverLinks(html,page.url()).filter(h=>/\/t\/[^/]+\/\d+|\/questions\/\d+/i.test(new URL(h).pathname));
    if(!links.length) throw new Error('no public thread links found on listing');
    return links;
  } finally { const last=page.url();await context.close();noteHostRequest(url);noteHostRequest(last); }
}

async function evalCatalog() {
  const reserved=JSON.parse(await fs.readFile(path.join(ROOT,'docs/revision/reserved-22-sites.json'),'utf8'));
  const sites=reserved.map((r,i)=>{
    let urls=r.oldUrls||[];
    if(familyExceptions.has(r.oldSite)) urls=r.oldSite==='reserve-08'?[r.oldUrls[1]]:[r.oldUrls[0]];
    else urls=urls.slice(0,2);
    if(r.oldSite==='fresh-site12') urls=[r.oldUrls[0],
      'https://numpy.org/doc/stable/user/quickstart.html','https://numpy.org/doc/stable/user/basics.html',
      'https://numpy.org/doc/stable/user/absolute_beginners.html','https://numpy.org/doc/stable/user/how-to-index.html'];
    if(r.oldSite==='fresh-site01') urls=[r.oldUrls[0],r.oldUrls[1],
      'https://www.cdc.gov/sleep/data-research/facts-stats/children-sleep-facts-and-stats.html',
      'https://www.cdc.gov/sleep/data-research/facts-stats/adults-sleep-facts-and-stats.html',
      'https://www.cdc.gov/sleep/resources/index.html'];
    if(r.oldSite==='original-09') urls=[...r.oldUrls,
      'https://news.berkeley.edu/2024/08/21/to-kill-mammoths-in-the-ice-age-people-used-planted-pikes-not-throwing-spears-researchers-say/',
      'https://news.berkeley.edu/2026/11/19/watch-how-a-uc-berkeley-innovation-led-to-the-microprocessors-that-run-the-world/',
      'https://news.berkeley.edu/2026/11/18/theresa-may-will-be-the-first-visiting-fellow-at-uc-berkeleys-new-nancy-pelosi-institute/'];
    if(r.oldSite==='additional-14') urls=[...r.oldUrls,
      'https://forum.posit.co/t/deployment-fails-on-shinyapps-io-because-of-terra/214331',
      'https://forum.posit.co/t/dt-impromptu-scrolling-when-setting-filters/217151',
      'https://forum.posit.co/t/is-there-another-way-to-paginate-through-an-ioslide-presentation-besides-the-arrow-keys/217501'];
    if(r.oldSite==='fresh-site11') urls=[r.oldUrls[0],
      'https://www.typescriptlang.org/docs/handbook/2/basic-types.html','https://www.typescriptlang.org/docs/handbook/2/everyday-types.html',
      'https://www.typescriptlang.org/docs/handbook/2/narrowing.html','https://www.typescriptlang.org/docs/handbook/2/functions.html'];
    if(r.oldSite==='additional-03') urls=[...r.oldUrls,
      'https://www.mathsisfun.com/algebra/basic-algebra.html','https://www.mathsisfun.com/algebra/linear-equations.html','https://www.mathsisfun.com/algebra/inequalities.html'];
    if(!urls.length) urls=[r.oldUrls[0]];
    return {id:`eval-${String(i+1).padStart(2,'0')}`,host:r.host,category:r.category,oldSite:r.oldSite,previouslyEvaluatedSite:true,oldUrls:r.oldUrls||[],urls};
  });
  for(let i=0;i<newEvalSites.length;i++) sites.push({id:`eval-${String(i+23).padStart(2,'0')}`,host:newEvalSites[i].host,category:newEvalSites[i].category,oldSite:null,previouslyEvaluatedSite:false,urls:newEvalSites[i].urls||[newEvalSites[i].seed],listing:/\/latest\/?$/.test(newEvalSites[i].seed)});
  const quotas={'Product pages':4,'Forum/Q&A threads':3,'Listing/category pages':2,'Documentation with sidebars or tabs':3,'Client-rendered pages':3,'Pages without main/article markup':3};
  for(const [category,count] of Object.entries(quotas)) if(sites.filter(s=>!s.previouslyEvaluatedSite&&s.category===category).length!==count) throw new Error(`new-site quota mismatch for ${category}`);
  return sites;
}

async function captureEvalSite(browser, site) {
  let queue=[...site.urls], pages=[], seen=new Set(), seenFinal=new Set(), failures=[], priorComplete=false;
  try {
    const prior=JSON.parse(await fs.readFile(path.join(CORPUS,'eval',site.id,'site-manifest.json'),'utf8'));
    if(prior.host===site.host && prior.pages?.length===5) { queue=prior.pages.map(p=>p.url); priorComplete=true; }
  } catch {}
  if(site.listing && !priorComplete) queue=await discoverForumThread(browser,queue[0]);
  let familyBase=queue[0];
  while(pages.length<5) {
    while(queue.length && seen.has(canonicalUrl(queue[0]))) queue.shift();
    if(!queue.length) throw new Error(`could not find 5 same-family pages (found ${pages.length})`);
    const url=queue.shift(); seen.add(canonicalUrl(url));
    process.stdout.write(`${site.id} p${pages.length+1}/5 ${url}\n`);
    let result;
    try { result=await capturePage(browser,'eval',site,url,pages.length); }
    catch(e) { if(/navigation HTTP (404|410)/.test(String(e.message))) { failures.push({url,reason:e.message}); process.stdout.write(`SKIP ${site.id}: ${e.message}\n`); continue; } throw e; }
    if(result.rejected) throw new Error(`capture rejected: ${result.reason}`);
    if(!pages.length) familyBase=result.meta.finalUrl;
    const finalKey=canonicalUrl(result.meta.finalUrl);
    if(seenFinal.has(finalKey)) throw new Error(`duplicate final URL ${result.meta.finalUrl}; preserving captured folder`);
    seenFinal.add(finalKey);
    pages.push(result);
    for(const next of discoverLinks(result.html,result.meta.finalUrl)) if(!seen.has(canonicalUrl(next))&&sameCategoryFamily(site,familyBase,next)&&!queue.some(q=>canonicalUrl(q)===canonicalUrl(next))) queue.push(next);
    delete result.html;
  }
  const manifest={split:'eval',siteId:site.id,host:site.host,category:site.category,oldSite:site.oldSite,previouslyEvaluatedSite:site.previouslyEvaluatedSite,
    pages:pages.map((p,i)=>({pageId:`${site.id}-p${i+1}`,url:p.meta.url,finalUrl:p.meta.finalUrl,sha256:p.meta.sha256,flags:{previouslyEvaluatedSite:site.previouslyEvaluatedSite,newPage:!site.oldUrls?.includes(p.meta.url),heldOut:i>=2,clientRendered:p.meta.clientRendered},capturedAt:p.meta.capturedAt})),skippedUrls:failures};
  const siteFolder=path.join(CORPUS,'eval',site.id); await fs.mkdir(siteFolder,{recursive:true});
  const manifestPath=path.join(siteFolder,'site-manifest.json');
  try { await fs.access(manifestPath); } catch(e) { if(e.code!=='ENOENT') throw e; await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'}); }
  return {...site,pages:manifest.pages};
}

async function dismissConsent(page) {
  return page.evaluate(() => {
    const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
    for(const el of document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"],a')) {
      if(!visible(el))continue;
      const label=String(el.getAttribute('aria-label')||el.getAttribute('value')||el.textContent||'').replace(/\s+/g,' ').trim();
      if(/^(reject(?: all| additional| optional)? cookies?|decline(?: all)?|no thanks)$/i.test(label)){el.click();return label;}
      if(/^close$/i.test(label)){
        const parent=el.closest('[class*="cookie" i],[id*="cookie" i],[class*="consent" i],[id*="consent" i],[role="dialog"]');
        if(parent){el.click();return label;}
      }
    }
    return '';
  });
}

async function capturePage(browser, split, site, url, index) {
  const folder = pageFolder(split, site, index);
  try {
    const [html,meta]=await Promise.all([fs.readFile(path.join(folder,'rendered-dom.html'),'utf8'),fs.readFile(path.join(folder,'meta.json'),'utf8').then(JSON.parse)]);
    const screenshot=await fs.readFile(path.join(folder,'screenshot.png'));
    if(crypto.createHash('sha256').update(html).digest('hex')!==meta.sha256||Buffer.byteLength(html)!==meta.bytes) throw new Error('saved DOM hash/byte count differs from metadata');
    if(screenshot.length<8||!screenshot.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('saved screenshot is not a PNG');
    if(canonicalUrl(meta.url)!==canonicalUrl(url)) throw new Error(`existing page folder was captured from a different URL (${meta.url}); refusing reuse`);
    const rejection = captureUrlRejection(site.id, meta.url, meta.finalUrl);
    if (rejection) return rejection;
    return {folder,meta,html,title:meta.title,reused:true};
  } catch(e) { if(e.code!=='ENOENT') throw new Error(`existing page folder is incomplete or invalid; refusing overwrite: ${folder}: ${e.message}`); }
  const robot = await robotsAllowed(url);
  if (!robot.allowed) return { rejected: true, siteId:site.id, url, reason:robot.note };
  await sleep(3000);
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const jsChanges = { scripts:0, mutations:0 };
  await page.addInitScript(() => {
    window.__vaMutations = 0;
    new MutationObserver(() => window.__vaMutations++).observe(document, {subtree:true,childList:true,attributes:true,characterData:true});
  });
  page.on('request', req => { if (req.resourceType() === 'script') jsChanges.scripts++; });
  let response;
  try {
    await guardTopLevelNavigations(page,url);
    response = await page.goto(url, { waitUntil:'domcontentloaded', timeout:45000 });
    if (!response || response.status() >= 400) throw new Error(`navigation HTTP ${response?.status() ?? 'no response'}`);
    let rejection = captureUrlRejection(site.id, url, page.url());
    if (rejection) return rejection;
    try { await page.waitForLoadState('load', { timeout:15000 }); } catch {}
    try { await page.waitForLoadState('networkidle', { timeout:15000 }); } catch {}
    const consentNote=await dismissConsent(page);
    if(consentNote)await sleep(500);
    const maxY = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y=0; y<maxY; y+=Math.max(500, VIEWPORT.height-100)) {
      await page.evaluate(v => window.scrollTo(0,v), y); await sleep(150);
    }
    await page.evaluate(() => window.scrollTo(0,0));
    await page.waitForFunction(() => {
      const now = document.documentElement.innerHTML.length;
      if (window.__vaLastLength === now) window.__vaQuiet = (window.__vaQuiet || 0) + 1;
      else { window.__vaLastLength = now; window.__vaQuiet = 0; }
      return window.__vaQuiet >= 4;
    }, {timeout:6000}).catch(()=>{});
    await sleep(1000);
    const finalUrl = page.url();
    rejection = captureUrlRejection(site.id, url, finalUrl);
    if (rejection) return rejection;
    const html = await page.evaluate(() => {
      const base = document.createElement('base'); base.href = location.href;
      const head = document.head || document.documentElement;
      head.insertBefore(base, head.firstChild);
      return '<!doctype html>\n' + document.documentElement.outerHTML;
    });
    const pageText = await page.locator('body').innerText().catch(()=> '');
    const screenshot = await page.screenshot({ fullPage:true, animations:'disabled', timeout:120000 });
    const sha256 = crypto.createHash('sha256').update(html).digest('hex');
    const clientRendered = await page.evaluate(() => !!document.querySelector('script[src]') && (window.__vaMutations || 0) > 50);
    const meta = { url, finalUrl, capturedAt:new Date().toISOString(), sha256, bytes:Buffer.byteLength(html), viewport:VIEWPORT,
      userAgent:await page.evaluate(()=>navigator.userAgent), clientRendered, notes:consentNote?`${robot.note}; dismissed consent with ${consentNote}`:robot.note, status:response.status(), title:await page.title(), textCharacters:normalize(pageText).length };
    await fs.mkdir(path.dirname(folder), {recursive:true});
    await fs.mkdir(folder, {recursive:false});
    await fs.writeFile(path.join(folder,'rendered-dom.html'), html, {flag:'wx'});
    await fs.writeFile(path.join(folder,'screenshot.png'), screenshot, {flag:'wx'});
    await fs.writeFile(path.join(folder,'meta.json'), JSON.stringify(meta,null,2)+'\n', {flag:'wx'});
    return { folder, meta, html, title:meta.title };
  } finally { const last=page.url();await context.close();noteHostRequest(url);noteHostRequest(last); }
}

function captureUrlRejection(siteId, url, finalUrl) {
  const errors = lintCapture({url, finalUrl}).filter(e=>e.rule==='L5');
  return errors.length ? {rejected:true, siteId, url, finalUrl, reason:'L5: redirect away from requested family', errors} : null;
}


async function main() {
  const split = process.argv[2] || 'dev';
  if(process.argv.includes('--redraft')) throw new Error('Capture and annotation are separate. Use the inspected guideline-v2 annotation workflow in annotate-dev-v2.cjs; legacy automatic references are retired.');
  const siteArg = process.argv.find(arg=>arg.startsWith('--sites='));
  const selectedSites = siteArg ? new Set(siteArg.slice('--sites='.length).split(',').filter(Boolean)) : null;
  if (!['dev','eval'].includes(split)) throw new Error('usage: node capture.cjs dev|eval');
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const results=[];
  if(split==='eval') {
    const allSites=await evalCatalog(), rejected=[];
    const sites=selectedSites?allSites.filter(site=>selectedSites.has(site.id)):allSites;
    try {
      for(const site of sites) {
        try { results.push(await captureEvalSite(browser,site)); }
        catch(e) { rejected.push({siteId:site.id,host:site.host,category:site.category,oldSite:site.oldSite,reason:String(e.message||e),capturedPages:(await fs.readdir(path.join(CORPUS,'eval',site.id)).catch(()=>[])).filter(n=>n.startsWith(`${site.id}-p`))}); process.stdout.write(`REJECT ${site.id}: ${e.message}\n`); }
      }
    } finally { await browser.close(); }
    if(rejected.length) await fs.writeFile(path.join(CORPUS,'rejections.json'),JSON.stringify(rejected,null,2)+'\n');
    if(results.length===40 && rejected.length===0) {
      const devManifest=JSON.parse(await fs.readFile(path.join(CORPUS,'dev-manifest.json'),'utf8'));
      const requiredDev=devManifest.sites.filter(s=>/^dev-\d+$/.test(s.siteId));
      const allSites=[...requiredDev,...results.map(s=>({siteId:s.id,host:s.host,category:s.category,oldSite:s.oldSite,previouslyEvaluatedSite:s.previouslyEvaluatedSite,pages:s.pages}))];
      const complete={schemaVersion:1,capturedAt:new Date().toISOString(),sites:allSites,rejections:[]};
      const fullPath=path.join(CORPUS,'manifest.json'),sanitizedPath=path.join(ROOT,'docs/revision/corpus-manifest.json');
      try { await fs.access(fullPath); } catch(e) { if(e.code!=='ENOENT') throw e; await fs.writeFile(fullPath,JSON.stringify(complete,null,2)+'\n',{flag:'wx'}); }
      try { await fs.access(sanitizedPath); } catch(e) { if(e.code!=='ENOENT') throw e; await fs.writeFile(sanitizedPath,JSON.stringify(complete,null,2)+'\n',{flag:'wx'}); }
    }
    process.stdout.write(JSON.stringify({split,sites:results.map(s=>({id:s.id,host:s.host,category:s.category,oldSite:s.oldSite,pages:s.pages.length})),rejected},null,2)+'\n');
    return;
  }
  const activeDevSites=selectedSites?dev.filter(site=>selectedSites.has(site.id)):dev;
  try {
    for (const site of activeDevSites) {
      if (!site.listing && site.urls.length !== 5) throw new Error(`site does not have 5 URLs: ${site.id}`);
      let siteUrls;
      try{
        const frozen=JSON.parse(await fs.readFile(path.join(CORPUS,'dev',site.id,'site-manifest.json'),'utf8'));
        if(frozen.pages?.length===5)siteUrls=frozen.pages.map(p=>p.url);
      }catch(e){if(e.code!=='ENOENT')throw e;}
      if(!siteUrls)siteUrls=site.listing?await discoverForumThread(browser,site.urls[0]):site.urls;
      const pages=[];
      for(let i=0;i<5;i++) {
        process.stdout.write(`${site.id} p${i+1}/5 ${siteUrls[i]}\n`);
        const result=await capturePage(browser,'dev',site,siteUrls[i],i);
        pages.push(result);
        if (result.rejected) {
          process.stdout.write(`REJECT ${result.reason}\n`);
          const siteFolder=path.join(CORPUS,'dev',site.id);
          await fs.mkdir(siteFolder,{recursive:true});
          await fs.appendFile(path.join(siteFolder,'capture-rejections.jsonl'),JSON.stringify({capturedAt:new Date().toISOString(),...result})+'\n');
          break;
        }
        delete result.html;
      }
      results.push({site,pages});
      if (pages.length===5 && pages.every(p=>!p.rejected)) {
        await fs.mkdir(path.join(CORPUS,'dev'),{recursive:true});
        const manifest={split:'dev',siteId:site.id,host:site.host,category:site.category,pages:pages.map((p,i)=>({pageId:`${site.id}-p${i+1}`,url:p.meta.url,finalUrl:p.meta.finalUrl,sha256:p.meta.sha256,flags:{previouslyEvaluatedSite:false,newPage:true,heldOut:i>=2,clientRendered:p.meta.clientRendered},capturedAt:p.meta.capturedAt}))};
        await fs.mkdir(path.join(CORPUS,'dev'),{recursive:true});
        const siteFolder=path.join(CORPUS,'dev',site.id);
        await fs.mkdir(siteFolder,{recursive:true});
        const siteManifest=path.join(siteFolder,'site-manifest.json');
        try { await fs.access(siteManifest); }
        catch(e) { if(e.code!=='ENOENT') throw e; await fs.writeFile(siteManifest,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'}); }
      }
    }
  } finally { await browser.close(); }
  if (!selectedSites && results.length===dev.length && results.every(r=>r.pages.length===5 && r.pages.every(p=>!p.rejected))) {
    const manifest={split:'dev',sites:results.map(r=>({siteId:r.site.id,host:r.site.host,category:r.site.category,pages:r.pages.map((p,i)=>({pageId:`${r.site.id}-p${i+1}`,url:p.meta.url,finalUrl:p.meta.finalUrl,sha256:p.meta.sha256,flags:{previouslyEvaluatedSite:false,newPage:true,heldOut:i>=2,clientRendered:p.meta.clientRendered},capturedAt:p.meta.capturedAt}))}))};
    const manifestPath=path.join(CORPUS,'dev-manifest.json');
    try { await fs.access(manifestPath); }
    catch(e) { if(e.code!=='ENOENT') throw e; await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'}); }
  }
  process.stdout.write(JSON.stringify({split,sites:results.map(r=>({id:r.site.id,pages:r.pages.length,rejected:r.pages.filter(p=>p.rejected)}))},null,2)+'\n');
}
module.exports={capturePage,captureUrlRejection,robotsAllowed,dev};
if(require.main===module) main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
