'use strict';
// Blind annotation transcription for the twelve manually inspected site families.
// Inputs: frozen DOM, screenshot inspection and URL only. No policy modules.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createDOM}=require('../eval/dom.cjs');
const {VirtualConsole}=require('jsdom');
const {extractText,normalize}=require('../eval/text.cjs');
const {validateReference}=require('../eval/references.cjs');
const {lintReference,counts}=require('./check-reference.cjs');
const {CORPUS,ARCHIVE,hash}=require('./corpus-maintenance.cjs');
const BLOCK='address,article,aside,blockquote,dd,details,div,dl,dt,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,summary,table,ul';
const IGNORE='script,style,noscript,template,svg,button,input,select,textarea,iframe,canvas';

function draft(doc,siteId,url) {
 const ref={schemaVersion:1,guidelineVersion:2,source:'blind screenshot + frozen rendered DOM + URL; guideline v2',url,content:[],noise:[],neutral:[]};
 const excluded=new Set(),selected=new Set(),noiseNodes=new Set(),neutralNodes=new Set();
 const q=(s,root=doc)=>[...root.querySelectorAll(s)];
 const idCounts=new Map(),docOrder=new WeakMap(),unitOrder=new WeakMap(),hintCache=new WeakMap();
 q('*').forEach(n=>{if(n.id)idCounts.set(n.id,(idCounts.get(n.id)||0)+1);});
 const tree=doc.createTreeWalker(doc,-1);let cursor,i=0;
 while((cursor=tree.nextNode()))docOrder.set(cursor,i++);
 const hint=node=>{
  if(hintCache.has(node))return hintCache.get(node);
  if(node.id&&idCounts.get(node.id)===1)return '[id='+JSON.stringify(node.id)+']';
  const parts=[];
  for(let n=node;n&&n.nodeType===1;n=n.parentElement){
   if(n.id&&idCounts.get(n.id)===1){parts.unshift('[id='+JSON.stringify(n.id)+']');break;}
   const tag=n.tagName.toLowerCase(),siblings=n.parentElement?[...n.parentElement.children].filter(x=>x.tagName===n.tagName):[n];
   parts.unshift(tag+(siblings.length>1?':nth-of-type('+(siblings.indexOf(n)+1)+')':''));
  }
  const value=parts.join(' > ');hintCache.set(node,value);return value;
 };
 const take=(section,role,node,required=true,override)=>{
  if(!node)return;
  const text=normalize(override===undefined?extractText(node):override);if(!text)return;
  const units=ref[section],id=section[0]+'-'+String(units.length+1).padStart(4,'0');
  const unit={id,...(section==='noise'?{kind:role}:{role}),text,selectorHint:hint(node),...(section==='content'?{required}:{})};
  units.push(unit);unitOrder.set(unit,docOrder.get(node)||0);return unit;
 };
 const content=(role,s,required=true)=>{for(const n of q(s)){take('content',role,n,required);selected.add(n);}};
 const noise=(kind,s)=>{for(const n of q(s)){
  if([...noiseNodes].some(p=>p===n||p.contains(n)))continue;
  // Prefer the outer widget, replacing only nested selections, never text-based deduplication.
  for(const p of [...noiseNodes])if(n.contains(p)){const h=hint(p);ref.noise=ref.noise.filter(u=>u.selectorHint!==h);noiseNodes.delete(p);}
  if(take('noise',kind,n)){noiseNodes.add(n);excluded.add(n);}
 }};
 const neutral=s=>{for(const n of q(s)){
  if([...neutralNodes].some(p=>p===n||p.contains(n)))continue;
  if(take('neutral','other',n)){neutralNodes.add(n);excluded.add(n);}
 }};
 const exclude=s=>q(s).forEach(n=>excluded.add(n));
 const dataTable=n=>{
  const rows=q('tr',n).filter(r=>r.closest('table')===n);
  return rows.some(r=>[...r.children].some(c=>c.tagName==='TH'))||rows.filter(r=>[...r.children].filter(c=>c.tagName==='TD').length>=2).length>=2;
 };
 const walk=(node,baseRole='body')=>{
  if(node.nodeType!==1||excluded.has(node)||selected.has(node)||node.matches(IGNORE))return;
  const tag=node.tagName;
  if(/^H[1-6]$/.test(tag)){
   const heading=node.querySelector(':scope > .devsite-heading')||node;
   take('content','heading',heading);return;
  }
  if(tag==='PRE'){take('content','code',node.querySelector(':scope > code')||node);return;}
  if(tag==='TABLE'&&dataTable(node)){take('content','table',node);return;}
  if(tag==='FIGCAPTION'){take('content','caption',node);return;}
  if(tag==='P'&&!q(BLOCK,node).length){take('content',baseRole,node);return;}
  if(['UL','OL'].includes(tag)){
   const lis=[...node.children].filter(c=>c.tagName==='LI');
   if(lis.length&&lis.every(li=>extractText(li).length<40&&!li.querySelector('ul,ol'))){take('content','list',node);return;}
  }
  if(tag==='DT'&&!node.querySelector(BLOCK)){take('content','heading',node);return;}
  const role=tag==='LI'?'list':baseRole;
  let run=[];
  const flush=()=>{
   if(!run.length)return;
   const fragment=doc.createDocumentFragment();run.forEach(n=>fragment.appendChild(n.cloneNode(true)));
   const text=extractText(fragment);
   if(text){const unit=take('content',role,node,true,text);unit.textPart=true;unitOrder.set(unit,docOrder.get(run[0])||0);}
   run=[];
  };
  for(const child of node.childNodes){
   if(child.nodeType===3){run.push(child);continue;}
   if(child.nodeType!==1)continue;
   if(child.matches(IGNORE)||excluded.has(child)||selected.has(child)){flush();continue;}
   if(child.matches(BLOCK)||child.querySelector(BLOCK)){flush();walk(child,role);}
   else run.push(child);
  }
  flush();
 };
 const reading=s=>q(s).filter(n=>!q(s).some(p=>p!==n&&p.contains(n))).forEach(n=>walk(n));
 const title=(s,strip)=>{
  const n=doc.querySelector(s);if(!n)throw Error('missing title '+siteId);
  let text;
  if(strip){const clone=n.cloneNode(true);clone.querySelectorAll(strip).forEach(x=>x.remove());text=extractText(clone);}
  take('content','title',n,true,text);selected.add(n);
 };

 switch(siteId){
 case 'dev-01':
  title('article > header h1');
  content('byline','article > header a[href*="author"],article > header a[href*="authors"]',false);
  content('date','article > header time',false);
  noise('site-nav','body > header');noise('footer','body > footer');
  noise('site-nav','article > footer');noise('author-boilerplate','article > div.not-prose');
  noise('related','aside details.sidebar-refs');neutral('nav#toc');
  reading('article > div.animate-fade-up.stagger-1');
  break;
 case 'dev-02':
  title('.product_main h1');content('price','.product_main .price_color');content('specs','.product_main .availability');
  content('description','#product_description + p');
  noise('site-nav','body > header');noise('promo','.product_main .alert-warning');
  noise('recommended','#recently_viewed_products,.recently-viewed');neutral('.breadcrumb');
  for(const heading of q('article.product_page > .sub-header'))if(extractText(heading)==='Products you recently viewed'){
   take('noise','recommended',heading);excluded.add(heading);
   if(heading.nextElementSibling){take('noise','recommended',heading.nextElementSibling);excluded.add(heading.nextElementSibling);}
  }
  reading('#product_description, #product_description + p, article.product_page > .sub-header:not(#product_description), article.product_page > table');
  break;
 case 'dev-03':
  title('main h1');
  noise('site-nav','header.page-layout__header > nav.navigation');noise('footer','footer');
  noise('site-nav','.layout__left-sidebar');noise('promo','.top-banner,.page-layout__banner');
  noise('author-boilerplate','.article-footer');noise('site-nav','.prev-next');
  neutral('.breadcrumbs-bar .breadcrumbs,.reference-toc');
  reading('main .reference-layout__header .content-section > p,main .reference-layout__body');
  break;
 case 'dev-04':
  title('#firstHeading');
  noise('site-nav','.vector-header-container');noise('footer','#footer');
  noise('widget','.vector-page-toolbar,.vector-appearance-landmark');
  noise('widget','.mw-parser-output .ambox');noise('related','.mw-parser-output .sidebar,.mw-parser-output .navbox');
  neutral('.vector-toc,.mw-parser-output .hatnote,.catlinks');
  exclude('.mw-editsection,.mw-empty-elt,.shortdescription,.mw-indicators');
  reading('.mw-parser-output');
  break;
 case 'dev-05':
  title('.fatitem .titleline > a');
  content('byline','.fatitem .subtext .hnuser,.comment-tree .comhead .hnuser',false);
  content('date','.fatitem .subtext .age,.comment-tree .comhead .age',false);
  content('post','.fatitem .toptext');content('comment','.comment-tree .commtext');
  noise('site-nav','.pagetop');noise('footer','.yclinks');noise('widget','form[action="comment"],form[action*="hn.algolia"]');
  noise('widget','.comment-tree .reply');
  break;
 case 'dev-06':
  title('main h1');content('lede','.gem-c-lead-paragraph');
  content('byline','.page-title .gem-c-metadata__definition:first-of-type',false);
  content('date','.page-title .gem-c-metadata__definition:not(:first-of-type)',false);
  noise('site-nav','body > header');noise('footer','.govuk-footer');noise('cookie','.gem-c-cookie-banner');
  noise('related','.gem-c-contextual-sidebar,.gem-c-contextual-footer');
  noise('widget','.published-dates-button-group,.gem-c-feedback');
  noise('author-boilerplate','.gem-c-govspeak > .gem-c-metadata');
  neutral('.gem-c-breadcrumbs,.gem-c-contents-list');
  reading('main .govspeak');
  break;
 case 'dev-07':
  title('h1');content('date','#w3c-state',false);
  content('byline','.head dd.editor',false);
  noise('widget','.head > details > summary,.head dd.wpt-overview');noise('footer','.head .copyright');noise('widget','#toc-nav');
  neutral('.head details dd:not(.editor):not(.wpt-overview)');
  noise('widget','.wpt-tests-block,.testrefs');
  neutral('#toc,#back-to-top');
  exclude('.head,.dfn-panel,.dfn-panel-wrapper,.self-link,.annotation,.annotation-wrapper,.mdn-anno');
  reading('body');
  break;
 case 'dev-08':
  title('article h1');
  content('byline','article [class*="Byline-styles__AuthorName"]',false);
  content('date','article time',false);
  noise('site-nav','header,#main-navigation-container');noise('footer','footer');noise('related','aside');
  noise('share','article [class*="Byline-styles__ActionsContainer"]');
  noise('widget','article [class*="Player-styles__PlayerStyled"]');
  neutral('article [class*="TagList-styles"]');
  exclude('article [class*="Byline-styles"],article [class*="TagList-styles"]');
  reading('article');
  break;
 case 'dev-09':
  title('main .product-info__title h1');
  content('price','main .product-info > .product-price');content('specs','main .product-vendor-sku');
  noise('site-nav','store-header');noise('footer','footer.footer');
  noise('newsletter','[id*="newsletter"]');noise('recommended','main convx-addons');
  noise('recommended','main .convx__fbt_section,main > .shopify-section[id*="pagefly_section"]');
  noise('widget','main .product-media');noise('share','main .social-share');
  noise('widget','.convx__region-selector,.localization-drawer');
  neutral('main .breadcrumbs');
  exclude('.jdgm-widget,.pf-hide,.pf-lg-hide,.product-backorder,.convx__sticky-atc-panel');
  reading('main .product-description,main .product-options,main > .shopify-section:not(.product-main):not(.cc-apps):not(.convx__fbt_section)');
  content('review','.jdgm-rev__body',false);
  break;
 case 'dev-10':
  title('#topic-title h1');
  content('byline','.topic-post .names .username',false);content('date','.topic-post a.post-date',false);
  content('post','.topic-post .cooked');
  noise('site-nav','#top-navbar-links,header.d-header');noise('footer','.powered-by-discourse');
  noise('related','.suggested-topics-wrapper,.more-topics__container');
  noise('widget','.post-controls,.topic-footer-buttons,.timeline-container');
  neutral('#topic-title .topic-category,#topic-title .discourse-tags');
  break;
 case 'dev-11':
  title('h1.devsite-page-title','devsite-actions');
  content('byline','.dcc-author > div > span',false);
  noise('share','.dcc-author__links');
  noise('site-nav','devsite-header');noise('footer','.devsite-footer-linkboxes,.devsite-footer-utility');
  noise('site-nav','devsite-book-nav');noise('widget','devsite-thumb-rating,devsite-actions');
  noise('cookie','devsite-cookie-notification');noise('author-boilerplate','.devsite-content-footer');
  neutral('.devsite-breadcrumb-list,devsite-toc');
  exclude('.nocontent,.devsite-article-meta,.devsite-article-authors,.dcc-authors,.devsite-rating,.devsite-translation-container');
  reading('.devsite-article-body');
  break;
 case 'dev-12':
  title('h1');content('byline','#identifiers dd.authors .author-name',false);content('date','#identifiers dd.published',false);
  noise('widget','#external-metadata');noise('footer','table.ears');
  neutral('nav.toc');
  exclude('#internal-metadata,.selfRef,.pilcrow,.toplink');
  reading('body');
  break;
 default:throw Error('uninspected site '+siteId);
 }
 // Preserve page order, with the explicit title first. Metadata remains optional.
 const titleUnit=ref.content.find(u=>u.role==='title');
 ref.content.sort((a,b)=>a===titleUnit?-1:b===titleUnit?1:unitOrder.get(a)-unitOrder.get(b));
 // Stable, unique IDs after all widget consolidation and DOM ordering.
 for(const section of ['content','noise','neutral'])ref[section].forEach((u,i)=>u.id=section[0]+'-'+String(i+1).padStart(4,'0'));
 return ref;
}

async function annotate(pageId,write) {
 const siteId=pageId.slice(0,6),folder=path.join(CORPUS,'dev',siteId,pageId);
 const html=await fs.readFile(path.join(folder,'rendered-dom.html'),'utf8'),meta=JSON.parse(await fs.readFile(path.join(folder,'meta.json'),'utf8'));
 const dom=createDOM(html,{virtualConsole:new VirtualConsole()});
 let ref,errors;
 try{
  ref=draft(dom.window.document,siteId,meta.finalUrl);
  errors=[...validateReference(ref,dom.window.document),...lintReference(ref,dom.window.document,meta)];
 }finally{dom.window.close();}
 const report={pageId,counts:counts(ref),errors};
 if(write){
  const archive=path.join(CORPUS,'archive/dev-references-v2-2026-11-21',pageId+'.json');
  try{await fs.access(archive);}catch{throw Error('missing original reference archive '+pageId);}
  const nextBytes=JSON.stringify(ref,null,2)+'\n';
  try{
   const previous=await fs.readFile(path.join(folder,'reference.json'));
   if(hash(previous)!==hash(nextBytes)){
    const history=path.join(ARCHIVE,'reference-iterations');await fs.mkdir(history,{recursive:true});
    const dest=path.join(history,pageId+'-'+hash(previous)+'.json');
    try{await fs.writeFile(dest,previous,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
   }
  }catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.writeFile(path.join(folder,'reference.json'),nextBytes);
  await fs.appendFile(path.join(ARCHIVE,'annotation-changes.jsonl'),JSON.stringify({...report,referenceSha256:hash(JSON.stringify(ref,null,2)+'\n'),at:new Date().toISOString()})+'\n');
 }
 return report;
}
module.exports={draft,annotate};
if(require.main===module)(async()=>{
 const ids=process.argv.includes('--all')?JSON.parse(await fs.readFile(path.join(CORPUS,'dev-manifest.json'),'utf8')).sites.flatMap(s=>s.pages.map(p=>p.pageId)):process.argv.slice(2).filter(x=>!x.startsWith('--'));
 for(const id of ids){const r=await annotate(id,process.argv.includes('--write'));console.log(JSON.stringify(r));if(r.errors.length)process.exitCode=1;}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
