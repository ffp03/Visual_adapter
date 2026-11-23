const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const implementation=require('../../../extension/procedure-v3.js');
// These existing tests isolate G1-G5. Explicit failed baseline doubles make G6
// vacuous; separate capability tests exercise real/protecting baseline evidence.
const v3={...implementation,gate:(pages,rule,options={})=>implementation.gate(pages,rule,{baselines:pages.map(()=>({P0:{ok:false,html:''},P1:{ok:false,html:''}})),...options})};
const core=require('../../../extension/procedure-core.js');
const {doc,close,prose,pages,rule}=require('./helpers.cjs');
afterEach(close);
test('UMD attaches in browser without network',()=>{const ctx={PreservationCore:core,URL};vm.runInNewContext(fs.readFileSync(require.resolve('../../../extension/procedure-v3.js'),'utf8'),ctx);assert.equal(typeof ctx.ProcedureV3.gate,'function');});
test('schema validates every field and forbids invalid/positional/oversize selectors',()=>{
 const d=pages()[0];assert.equal(v3.validate(rule(),d).accepted,true);
 const invalid=[null,{},rule({schemaVersion:2}),rule({name:''}),rule({applicability:{anchors:[]}}),rule({provenance:{}}),rule({exclude:['p:nth-child(2)']}),rule({reveal:['[']}),rule({regions:[{role:'invalid',selector:'main',multiple:false,required:true}]}),rule({exclude:['x'.repeat(301)]}),rule({applicability:{anchors:[{selector:'main',min:2,max:1}]}})];
 for(const r of invalid)assert.equal(v3.validate(r,d).accepted,false,JSON.stringify(r));
});
test('template exclusion allowed; no compiler repairs or supplementation',()=>{
 const ds=pages(),r=rule({exclude:['.template']});const result=v3.gate(ds,r);
 assert.equal(result.accepted,true,JSON.stringify(result.reasons));assert.equal(result.pages[0].uniqueCoverage.ratio,1);assert.equal(result.pages[0].templateCoverage.kept,0);assert.ok(!result.pages[0].html.includes('Repeated newsletter'));assert.deepEqual(r.exclude,['.template']);
});
test('unique-text exclusion rejected even outside declared reading region and under ancestor selectors',()=>{
 const ds=pages();for(const d of ds){const p=d.createElement('p');p.className='outside';p.textContent=prose(d.querySelector('h1').textContent+' outside');d.body.append(p);}
 for(const selector of ['.body','.outside','body .body']){const r=rule({exclude:[selector]});const result=v3.gate(ds,r);assert.equal(result.accepted,false);assert.ok(result.reasons.some(s=>s.includes('G4:unique-exclusion')),selector);}
});
test('partial descendant exclusion loses unique substantive block',()=>{
 const ds=['A','B'].map(s=>doc(`<main class="reading"><h1>Title ${s}</h1><p>${prose(s)}<span class="delete">Unique extra sentence ${s}</span></p></main>`));
 assert.ok(v3.gate(ds,rule({exclude:['.delete']})).reasons.some(s=>s.includes('G4:')));
});
test('G2 missing H1, G3 missing unique, G5 short output, G1 exact counts all decline',()=>{
 const ds=pages();
 const region=selector=>[{role:'body',selector,multiple:false,required:true}];
 assert.ok(v3.gate(ds,rule({regions:region('p.body')})).reasons.some(s=>s.includes('G2:')));
 assert.ok(v3.gate(ds,rule({regions:region('h1')})).reasons.some(s=>s.includes('G3:')));
 assert.ok(v3.gate(ds,rule({regions:region('h1')})).reasons.some(s=>s.includes('G5:')));
 assert.ok(v3.gate(ds,rule({regions:region('p')})).reasons.some(s=>s.includes('G1:region-count')));
 assert.ok(v3.gate(ds,rule({regions:[...region('main'),{role:'other',selector:'.absent',multiple:false,required:false}]})).reasons.some(s=>s.includes('G1:region-count')));
 assert.equal(v3.gate(ds,rule({regions:[...region('main'),{role:'other',selector:'.absent',multiple:true,required:false}]})).accepted,true);
});
test('output mode keeps exactly the G4/G6 failures as advice and still requires valid nonempty output',()=>{
 const ds=['Alpha','Beta'].map(s=>doc(`<main class="reading"><h1>${s}</h1><p>${prose(s).repeat(12)}</p><p class="remove">${prose('small '+s)}</p></main>`));
 const candidate=rule({exclude:['.remove']});
 const baselines=ds.map(d=>({P0:{ok:true,html:d.body.innerHTML},P1:{ok:false,html:''}}));
 const gate=v3.gate(ds,candidate,{baselines});
 assert.equal(JSON.stringify(v3.gate(ds,candidate,{baselines,check:'gate'})),JSON.stringify(gate));
 assert.equal(gate.accepted,false);
 assert.deepEqual(gate.pages[0].reasons,['G4:unique-exclusion:.remove','G6:baseline-regression']);
 const output=v3.gate(ds,candidate,{baselines,check:'output'});
 assert.equal(output.accepted,true);
 assert.equal(output.check,'output');
 assert.deepEqual(output.reasons,[]);
 assert.deepEqual(output.advisory,gate.reasons);
 for(const [i,page] of output.pages.entries()){
  assert.deepEqual(page.advisory,gate.pages[i].reasons);
  assert.deepEqual({...page,accepted:false,reasons:page.advisory,advisory:undefined},{...gate.pages[i],advisory:undefined});
 }
 for(const [candidate,reason] of [
  [rule({exclude:['[']}),'G1:exclude-schema'],
  [rule({regions:[{role:'body',selector:'.missing',multiple:false,required:true}]}),'G1:region-count:0:0'],
  [rule({exclude:['main']}),'output:empty']
 ]){
  const refused=v3.gate(ds,candidate,{baselines,check:'output'});
  assert.equal(refused.accepted,false);
  assert.deepEqual(refused.reasons,['p1:'+reason,'p2:'+reason]);
 }
 const image=doc('<main class="reading"><img src="/image.jpg"></main>');
 const imageOnly=v3.gate([image],rule(),{check:'output'});
 assert.match(imageOnly.pages[0].html,/<img/);
 assert.deepEqual(imageOnly.reasons,['p1:output:empty']);
 const inventories=v3.inventory(ds);
 ds[0].createElement=()=>{throw Error('synthetic render failure');};
 const failed=v3.gate(ds,candidate,{inventories,baselines,check:'output'});
 assert.deepEqual(failed.reasons,['p1:runtime-error']);
});
test('output use-time and family selection keep anchor counts and advise on substantive coverage',()=>{
 const d=pages()[0],options={check:'output'};
 const candidate=rule({regions:[{role:'title',selector:'h1',multiple:false,required:true}]});
 const gate=v3.useTime(d,candidate);
 assert.equal(gate.accepted,false);
 const output=v3.useTime(d,candidate,undefined,options);
 assert.equal(output.accepted,true);
 assert.equal(output.fallback,false);
 assert.deepEqual(output.advisory,['G5:output-too-short','use-time:substantive-coverage']);
 assert.deepEqual(output.advisory,gate.reasons);
 assert.equal(output.substantiveCoverage.ratio,gate.substantiveCoverage.ratio);
 assert.equal(v3.selectFamily(d,[candidate],options).accepted,true);
 const badAnchor={...candidate,applicability:{...candidate.applicability,anchors:[{selector:'.reading',min:2,max:2}]}};
 const refused=v3.useTime(d,badAnchor,undefined,options);
 assert.equal(refused.accepted,false);
 assert.deepEqual(refused.reasons,['applicability:anchor-count:.reading']);
 assert.equal(v3.selectFamily(d,[badAnchor],options).accepted,false);
 assert.deepEqual(v3.useTime(d,rule({exclude:['main']}),undefined,options).reasons,['output:empty']);
});
test('P3 has no repeat evidence and uses the fixed 80% threshold; P4 uses 90%',()=>{
 const ds=['a','b'].map(s=>doc(`<main class="reading"><h1>Title ${s}</h1><p>${s.repeat(850)}</p><p class="small">${s.repeat(150)}</p></main>`));
 const r=rule({regions:[{role:'body',selector:'main > :not(.small)',multiple:true,required:true}]});
 assert.equal(v3.gate([ds[0]],r,{mode:'P3'}).accepted,true);
 assert.ok(v3.gate(ds,r,{mode:'P4'}).reasons.some(s=>s.includes('G3:')));
 assert.equal(v3.inventory([ds[0]],{mode:'P3'})[0].blocks[0].repeat,null);
});
test('NOISE and substantive criteria include in-content nav, exclude global nav and link-heavy short blocks',()=>{
 const d=doc(`<nav><p>${prose('global')}</p></nav><main><nav><p>${prose('inside')}</p></nav><footer><p>${prose('footer')}</p></footer><p>short</p><p><a href="/x">${prose('links')}</a></p><h2>${prose('heading')}</h2></main>`);
 assert.deepEqual(v3.blocks(d).map(b=>b.node.tagName),['P','H2']);assert.ok(v3.blocks(d)[0].text.includes('inside'));
});
test('clean sanitizer matches frozen core on full BODY including values, unsafe URLs, source ancestry, srcset and events',()=>{
 const d=doc(`<nav><p>Global</p></nav><main onclick="bad()"><nav><p>Contents</p></nav><script>bad()</script><input value="secret"><textarea>secret</textarea><iframe src="x"></iframe><form action="/post"><a href="javascript:bad()">bad</a><img src="pic.jpg" srcset="a.jpg 1x, b.jpg 2x" onerror="bad()"><a href="#part">link</a><a href="/path">normal</a></form></main><footer>footer</footer>`);
 assert.equal(v3.clean(d.body,d,true).outerHTML,core.validationContext(d).validationHTML);
});
test('declared order, nonheading title conversion, source-context exclusions, reveal and no original mutation',()=>{
 const d=doc(`<main class="reading"><div class="title">A title</div><div class="content"><p>${prose('Content')}</p><aside>drop me</aside><details hidden aria-hidden="true" style="display:none"><summary>More</summary><p>${prose('Hidden content')}</p></details><div class="panel" hidden style="display:none">Panel</div></div></main>`);
 const before=d.body.innerHTML;const r=rule({regions:[{role:'title',selector:'.title',multiple:false,required:true},{role:'body',selector:'.content',multiple:false,required:true}],exclude:['main aside'],reveal:['details','.panel']});
 const out=v3.render(d,r);assert.equal(out.firstElementChild.dataset.role,'title');assert.equal(out.querySelector('h1').textContent,'A title');assert.equal(out.querySelector('aside'),null);assert.equal(out.querySelector('details').open,true);assert.equal(out.querySelector('details').hasAttribute('hidden'),false);assert.equal(out.querySelector('.panel').style.display,'');assert.equal(d.body.innerHTML,before);
});
test('use-time accepts same-family and rejects anchor, H1 and coverage drift with fallback',()=>{
 const ds=pages(),r=rule({exclude:['.template']}),induction=v3.gate(ds,r);assert.ok(induction.accepted);
 const same=doc(`<main class="reading"><h1>Held out</h1><p>${prose('New content')}</p></main>`);assert.equal(v3.useTime(same,r,induction).accepted,true);
 const other=doc(`<main><h1>Held out</h1><p>${prose('Other site')}</p></main>`);assert.ok(v3.useTime(other,r,induction).reasons.some(s=>s.startsWith('applicability:')));
 const drift=doc(`<main class="reading"><h1>Held out</h1><div>${prose('Long unstructured block').repeat(5)}</div></main>`);assert.equal(v3.useTime(drift,r,induction).accepted,true);
 assert.equal(v3.useTime(same,r,{}).accepted,true);
 const missingTitle=rule({regions:[{role:'body',selector:'p',multiple:false,required:true}]});assert.ok(v3.useTime(same,missingTitle,induction).reasons.includes('G2:h1-missing'));
 const short=doc('<main class="reading"><h1>T</h1></main>');assert.equal(v3.useTime(short,r,induction).accepted,true);
});
test('hostname binding and class/id anchors reject cross-site and generic-only applicability',()=>{
 const d=pages()[0];for(const selector of ['main','article','body','[role=main]','[title=".reading"]'])assert.ok(v3.validate(rule({applicability:{hostname:'example.test',anchors:[{selector,min:1,max:1}]}}),d).reasons.includes('G1:non-generic-anchor-required'));
 for(const selector of ['main.reading','#content','[id="content"]','[class~="reading"]'])assert.equal(v3.identityAnchor(selector),true);
 const {JSDOM}=require('jsdom'),other=new JSDOM(d.documentElement.outerHTML,{url:'https://other.test'});try{assert.ok(v3.useTime(other.window.document,rule()).reasons.includes('G1:hostname-binding'));}finally{other.window.close();}
 assert.equal(v3.validate(rule({applicability:{hostname:'other.test',anchors:[{selector:'.reading',min:1,max:1}]}}),d).accepted,false);
});
test('sidebar removal is allowed in G3/G4, including inside a substantive ancestor',()=>{
 const ds=['a','b'].map(s=>doc(`<main class="reading"><h1>${s}</h1><table><tr><td><p>${prose(s)}</p><aside><p>${prose('unique sidebar '+s)}</p></aside></td></tr></table><div role="complementary"><p>${prose('complement '+s)}</p></div><nav><p>${prose('nav '+s)}</p></nav></main>`));
 const out=v3.gate(ds,rule({exclude:['aside','[role=complementary]','nav']}));assert.equal(out.accepted,true,JSON.stringify(out.reasons));assert.equal(out.pages[0].uniqueCoverage.ratio,1);
});
test('G4 allows link density >=0.3 while preserving its lower-density guard',()=>{
 const ds=['a','b'].map(s=>doc(`<main class="reading"><h1>${s}</h1><p>${s.repeat(1000)}</p><p class="links"><a href="/x">${'l'.repeat(35)}</a>${s.repeat(65)}</p></main>`));
 assert.equal(v3.gate(ds,rule({exclude:['.links']})).accepted,true);
 const low=['c','d'].map(s=>doc(`<main class="reading"><h1>${s}</h1><p>${s.repeat(1000)}</p><p class="links"><a href="/x">${'l'.repeat(29)}</a>${s.repeat(71)}</p></main>`));
 assert.ok(v3.gate(low,rule({exclude:['.links']})).reasons.some(r=>r.includes('G4:')));
});
test('new G5 scales to source substantive characters and use-time coverage has exact 60% floor',()=>{
 const r=rule({regions:[{role:'title',selector:'h1',multiple:false,required:true},{role:'body',selector:'.kept',multiple:false,required:true}]});
 const make=(a,b)=>doc(`<main class="reading"><h1>T</h1><div class="kept"><p>${'a'.repeat(a)}</p></div><p>${'b'.repeat(b)}</p></main>`);
 const at=v3.useTime(make(600,400),r);assert.equal(at.accepted,true);assert.equal(at.substantiveCoverage.ratio,.6);
 assert.ok(v3.useTime(make(599,401),r).reasons.includes('use-time:substantive-coverage'));
 const short=doc('<main class="reading"><h1>T</h1><p>'+ 'a'.repeat(100)+'</p></main>');const v=v3.gate([short],rule(),{mode:'P3'}).pages[0];assert.equal(v.accepted,true);assert.equal(v.minimumTextLength,50);
 const missing=rule({regions:[{role:'title',selector:'h1',multiple:false,required:true}]});assert.ok(v3.gate([short],missing,{mode:'P3'}).reasons.some(r=>r.includes('G5:')));
});

test('different related teasers can be excluded with real P0/P1 protection; article body remains protected',()=>{
 const ds=['Alpha','Beta'].map(s=>doc(`<main class="reading"><h1>${s} title</h1><div class="article-body"><p>${prose(s)}</p></div><div class="related-articles"><p>${prose('Related teaser '+s)} <a href="/next">Read more</a></p></div></main>`));
 const baselines=require('../../../backend/agent/baselines.cjs').synchronous(ds);
 assert.ok(baselines.every(b=>b.P0.ok&&b.P0.html.includes('Related teaser')));
 const allowed=implementation.gate(ds,rule({exclude:['.related-articles']}),{baselines});
 assert.equal(allowed.accepted,true,JSON.stringify(allowed.reasons));
 for(const page of allowed.pages){assert.equal(page.uniqueCoverage.ratio,1);assert.equal(page.g6.protected,1);assert.equal(page.g6.preserved,1);assert.ok(!page.html.includes('Related teaser'));}
 const refused=implementation.gate(ds,rule({exclude:['.article-body p']}),{baselines});
 assert.ok(refused.reasons.some(r=>r.includes('G4:unique-exclusion:.article-body p')));
 assert.ok(refused.reasons.some(r=>r.includes('G6:baseline-regression')));
});
test('clutter markers use separator/camelCase words and prefixes, not interior substrings or comments',()=>{
 const negative=['header','head','load','download','shadow','canvas','loaded','comments','comment','recirc','admonition','address','adapter','shared','menuitem','navigate'];
 const positive=['ad','ad-slot','relatedPosts','recommendations-list','site-footer','globalNavigation','shoppingWidget','ADSlot'];
 for(const marker of [...negative,...positive]){
  const ds=['Alpha','Beta'].map(s=>doc(`<main class="reading"><h1>${s}</h1><p>${prose(s)}</p><div class="target ${marker}"><p>${prose('Different target '+s)}</p></div></main>`));
  const inv=implementation.inventory(ds),expected=positive.includes(marker);
  assert.equal(implementation.markedClutter(ds[0].querySelector('.target p')),expected,marker);
  assert.equal(inv[0].unique.length,expected?1:2,marker);
  const result=v3.gate(ds,rule({exclude:['.target']}));
  assert.equal(result.accepted,expected,marker+':'+JSON.stringify(result.reasons));
  if(!expected)assert.ok(result.reasons.some(r=>r.includes('G4:')),marker);
 }
 // The exact same rules apply to id tokens and to a marker on the block itself.
 for(const marker of [...negative,...positive]){
  const d=doc(`<p id="${marker}">${prose('ID token')}</p>`);
  assert.equal(implementation.markedClutter(d.querySelector('p')),positive.includes(marker),marker);
 }
});
test('every fixed clutter marker and semantic ancestor is exempt, including inside a substantive parent',()=>{
 for(const marker of [...implementation.CLUTTER_PREFIXES,...implementation.CLUTTER_WORDS]){
  const d=doc(`<main><div class="${marker}"><p>${prose('Clutter')}</p></div></main>`);
  assert.equal(implementation.inventory([d])[0].unique.length,0,marker);
 }
 for(const wrapper of ['nav','aside','div role="navigation"','div role="complementary"','div role="contentinfo"','div role="banner"','div id="panel-shipping-promo"']){
  const tag=wrapper.split(' ')[0];
  const ds=['Alpha','Beta'].map(s=>doc(`<main class="reading"><h1>${s}</h1><table><tr><td><p>${prose(s)}</p><${wrapper} class="target"><p>${prose('Different clutter '+s)}</p></${tag}></td></tr></table></main>`));
  const baselines=ds.map(d=>({P0:{ok:true,html:d.body.innerHTML},P1:{ok:false,html:''}}));
  const result=implementation.gate(ds,rule({exclude:['.target']}),{baselines});
  assert.equal(result.accepted,true,wrapper+':'+JSON.stringify(result.reasons));
  assert.ok(result.pages.every(p=>p.uniqueCoverage.ratio===1&&p.g6.protected>0));
 }
 const ds=['Alpha','Beta'].map(s=>doc(`<main class="reading"><h1>${s}</h1><table><tr><td><p>${prose(s)}</p><div class="relatedPosts"><p>${prose('Teaser '+s)}</p></div></td></tr></table></main>`));
 const baselines=ds.map(d=>({P0:{ok:true,html:d.body.innerHTML},P1:{ok:false,html:''}}));
 assert.equal(implementation.gate(ds,rule({exclude:['.relatedPosts']}),{baselines}).accepted,true);
});
test('induction clutter exemption leaves H1, G5 and use-time substantive checks in force',()=>{
 const ds=['Alpha','Beta'].map(s=>doc(`<main class="reading"><h1 class="related">${s} title</h1><p>${prose(s)}</p><div class="related"><p>${prose('Large teaser '+s).repeat(5)}</p></div></main>`));
 const baselines=ds.map(d=>({P0:{ok:true,html:d.body.innerHTML},P1:{ok:false,html:''}}));
 const r=rule({exclude:['div.related']});
 assert.equal(implementation.gate(ds,r,{baselines}).accepted,true);
 assert.ok(implementation.useTime(ds[0],r).reasons.includes('use-time:substantive-coverage'));
 assert.ok(implementation.gate(ds,rule({exclude:['.related']}),{baselines}).reasons.some(r=>r.includes('G2:h1-missing')));
 assert.ok(implementation.gate(ds,rule({exclude:['main p']}),{baselines}).reasons.some(r=>r.includes('G5:output-too-short')));
});
test('discussion comments retain G3, G4 and real baseline protection on both pages',()=>{
 const ds=['Alpha','Beta'].map(s=>doc(`<main class="reading"><h1>${s}</h1><p>${prose(s)}</p><div class="comments"><p>${prose('Discussion post '+s)}</p></div></main>`));
 const baselines=require('../../../backend/agent/baselines.cjs').synchronous(ds);
 const result=implementation.gate(ds,rule({exclude:['.comments']}),{baselines});
 for(const page of result.pages){
  assert.equal(page.accepted,false);assert.ok(page.reasons.includes('G3:unique-coverage'));
  assert.ok(page.reasons.includes('G4:unique-exclusion:.comments'));
  assert.ok(page.reasons.includes('G6:baseline-regression'));
  assert.ok(page.g6.missing.some(b=>b.text.includes('Discussion post')));
 }
});
test('page-wide wrappers are never clutter: html, body, or an element holding the heading or reading container',()=>{
 const ds=['Alpha','Beta'].map(s=>doc(`<main class="reading"><h1>${s}</h1><p>${prose(s)}</p></main>`));
 for(const d of ds)d.documentElement.className='ad-page';
 assert.ok(implementation.inventory(ds).every(inv=>inv.unique.length===1));
 for(const d of ds)d.body.className='has-sidebar site-footer';
 assert.ok(implementation.inventory(ds).every(inv=>inv.unique.length===1));
 const wrapped=['Alpha','Beta'].map(s=>doc(`<div class="layout-with-sidebar"><main><h1>${s}</h1><p>${prose(s)}</p></main></div>`));
 assert.ok(implementation.inventory(wrapped).every(inv=>inv.unique.length===1));
 const titled=['Alpha','Beta'].map(s=>doc(`<div class="promo-layout"><h1>${s}</h1><p>${prose(s)}</p></div>`));
 assert.ok(implementation.inventory(titled).every(inv=>inv.unique.length===1));
 const inner=['Alpha','Beta'].map(s=>doc(`<div class="has-sidebar"><main><h1>${s}</h1><p>${prose(s)}</p><div class="related"><p>${prose('Teaser '+s)}</p></div></main></div>`));
 assert.ok(implementation.inventory(inner).every(inv=>inv.unique.length===1));
});
test('output mode requires visible text after applying reveal at induction and delivery',()=>{
 const check={check:'output'};
 for(const [html,reveal] of [
  ['<p class="copy" hidden>Hidden copy</p>',['.copy']],
  ['<div class="cover" style="display: none !important"><p>Hidden copy</p></div>',['.cover']],
  ['<details class="cover"><summary> </summary><p>Hidden copy</p></details>',['.cover']],
  ['<p style="visibility: hidden">Hidden copy</p>',null],
  ['<div style="opacity: 0"><p>Hidden copy</p></div>',null]
 ]){
  const page=doc('<main class="reading">'+html+'</main>');
  for(const verdict of [v3.gate([page],rule(),check).pages[0],v3.useTime(page,rule(),undefined,check),v3.selectFamily(page,[rule()],check)]){
   assert.equal(verdict.accepted,false,html);assert.ok(verdict.reasons.includes('output:empty'));
  }
  if(reveal)assert.equal(v3.gate([page],rule({reveal}),check).accepted,true,html);
 }
 const page=doc('<main class="reading"><p style="visibility: hidden"><span style="visibility: visible">Shown copy</span></p></main>');
 assert.equal(v3.useTime(page,rule(),undefined,check).accepted,true);
});
