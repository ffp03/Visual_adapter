const {test,afterEach}=require('node:test'),assert=require('node:assert/strict');
const v3=require('../../../extension/procedure-v3.js');const {Views}=require('../../../backend/agent/outline.cjs');const {Families}=require('../../../backend/agent/families.cjs');
const {doc,close,rule,prose}=require('./helpers.cjs');afterEach(close);
function pair(){return ['a','b'].map(s=>doc(`<main class="reading"><h1>Title ${s}</h1><p class="large">${s.repeat(1000)}</p><p class="small">${(s+'x').repeat(30)}</p></main>`));}
function subsetRule(){return rule({regions:[{role:'title',selector:'h1',multiple:false,required:true},{role:'body',selector:'.large',multiple:false,required:true}]});}
test('G6 requires evidence and forbids small regressions permitted by G3; chooses the better baseline',()=>{
 const ds=pair(),r=subsetRule();assert.ok(v3.gate(ds,r).reasons.some(r=>r.includes('G6:baseline-evidence-required')));
 const baselines=ds.map(d=>({P0:{ok:true,html:d.querySelector('.large').outerHTML},P1:{ok:true,html:d.body.innerHTML}}));
 const verdict=v3.gate(ds,r,{baselines});assert.ok(!verdict.reasons.some(r=>r.includes('G3:')));assert.ok(verdict.reasons.some(r=>r.includes('G6:baseline-regression')));assert.equal(verdict.pages[0].g6.baseline,'P1');assert.equal(verdict.pages[0].g6.missing[0].node.className,'small');
 assert.equal(v3.gate(ds,rule(),{baselines}).accepted,true);
});
test('G6 exempts templates, sidebars, high-link-density and short blocks; ties choose P0',()=>{
 const ds=['a','b'].map(s=>doc(`<main class="reading"><h1>${s}</h1><p class="large">${s.repeat(2000)}</p><p class="template">${prose('Repeated')}</p><aside><p>${prose('Sidebar '+s)}</p></aside><p class="links"><a href="/x">${'l'.repeat(35)}</a>${s.repeat(65)}</p><p>short ${s}</p></main>`));
 const baselines=ds.map(d=>({P0:{ok:true,html:d.body.innerHTML},P1:{ok:true,html:d.body.innerHTML}}));
 const v=v3.gate(ds,subsetRule(),{baselines});assert.equal(v.accepted,true,JSON.stringify(v.reasons));assert.equal(v.pages[0].g6.baseline,'P0');assert.equal(v.pages[0].g6.protected,1);
});
test('baseline seeds are de-identified, expose containers and repeat flags, and preview shows G6 violations',()=>{
 const ds=['a','b'].map(s=>doc(`<main class="reading"><h1>${s}</h1><p class="large">${s.repeat(1000)}</p><p class="small">${(s+'x').repeat(30)}</p><p class="newsletter">${prose('Repeated a@host.example https://host.example/private')}</p><input value="formsecret"></main>`));
 const baselines=ds.map(d=>({P0:{ok:true,html:d.body.innerHTML},P1:{ok:true,html:d.querySelector('.large').outerHTML}}));
 const view=new Views(ds,{baselines}),initial=view.initial(),encoded=JSON.stringify(initial);
 assert.ok(initial[0].baselines.P0.sourceContainers.length);assert.ok(initial[0].baselines.P0.output.some(b=>b.repeat==='2/2'));assert.ok(!encoded.includes('formsecret'));assert.ok(!encoded.includes('a@host'));assert.ok(!encoded.includes('/private'));assert.ok(!encoded.includes('<main'));
 const preview=view.preview(subsetRule());assert.ok(preview.pages[0].g6.missing.length);assert.ok(preview.reasons.some(r=>r.includes('G6:')));
 const p3=new Views([ds[0]],{mode:'P3',baselines:[baselines[0]]});assert.ok(p3.initial()[0].baselines.P0.output.every(b=>!Object.hasOwn(b,'repeat')));
});
test('suspicion lists distinguish kept boilerplate and dropped content without automatic repairs',()=>{
 const ds=['a','b'].map(s=>doc(`<main class="reading"><h1>${s}</h1><p class="body">${prose(s)}</p><aside class="newsletter"><p>${prose('Repeated newsletter')}</p></aside><div class="share"><a href="/share">Share this reading</a></div></main>`));
 const view=new Views(ds),all=view.preview(rule());assert.ok(all.pages[0].suspicion.keptBoilerplate.some(b=>b.reasons.includes('token:newsletter')||b.reasons.includes('repeat')));
 const dropped=view.preview(rule({regions:[{role:'title',selector:'h1',multiple:false,required:true}]}));assert.ok(dropped.pages[0].suspicion.droppedContent.some(b=>b.cue.startsWith('a ')));assert.equal(dropped.accepted,false);
});
test('selector precision suggestions resolve uniquely on every induction page and preview surfaces them',()=>{
 const ds=['a','b'].map(s=>doc(`<main class="reading"><h1>${s}</h1><div class="region story"><p>${prose(s)}</p></div><div class="region related"><p>${prose('related '+s)}</p></div></main>`));
 const view=new Views(ds),suggestions=view.query('div.region')[0].disambiguatingSelectors;
 assert.ok(suggestions.length>=2&&suggestions.length<=3);
 for(const candidate of suggestions){assert.ok(!/:(nth|first|last|only)-/.test(candidate.selector));for(const d of ds)assert.equal(v3.matches(d,candidate.selector).length,1);}
 const r=rule({regions:[{role:'body',selector:'div.region',multiple:false,required:true}]});assert.ok(view.preview(r).pages[0].precision[0].candidates.length);
});
test('family storage keeps distinct anchors per host and selects by anchors, otherwise declines',()=>{
 const a=rule(),b=rule({name:'Product',applicability:{hostname:'example.test',anchors:[{selector:'main.product',min:1,max:1}]}}),families=new Families();
 assert.throws(()=>families.add(a,{accepted:false}),/admission/);families.add(a,{accepted:true}).add(b,{accepted:true});assert.equal(families.rules('example.test').length,2);
 const article=doc(`<main class="reading"><h1>A</h1><p>${prose('article')}</p></main>`),product=doc(`<main class="product"><h1>B</h1><p>${prose('product')}</p></main>`),other=doc(`<main><h1>C</h1><p>${prose('other')}</p></main>`);
 assert.equal(families.select(article).rule.name,a.name);assert.equal(families.select(product).rule.name,'Product');assert.equal(families.select(other).fallback,true);assert.equal(families.select(other).rule,null);
});
