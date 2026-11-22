'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {lintReference,lintCapture,checkCorpus,contentOutsideDom}=require('./check-reference.cjs');
const {captureUrlRejection,capturePage}=require('./capture.cjs');
const meta={pageId:'x-p1',siteId:'x',url:'https://example.test/articles/a',finalUrl:'https://example.test/articles/a',sha256:'a'};
const ref=()=>({content:[{id:'title',role:'title',text:'Title',required:true}],noise:[],neutral:[]});
const rules=(r,html='<h1>Title</h1>')=>lintReference(r,html,meta).map(e=>e.rule);
test('L1: normalized, case-sensitive containment; noise needs 15 characters',()=>{
  const r=ref();r.content[0].text='Title Boilerplate navigation end';
  r.noise=[{id:'nav',text:'Boilerplate   navigation'}];assert.deepEqual(rules(r),['L1']);
  r.noise[0].text='navigation';assert.deepEqual(rules(r),[]);
  r.noise[0].text='boilerplate navigation';assert.deepEqual(rules(r),[]);
  r.content[0].required=false;r.noise[0].text='Boilerplate navigation';assert.deepEqual(rules(r),[]);
});
test('L2: strict 5000 boundary; only code and table exempt',()=>{
  const r=ref();r.content[0].text='a'.repeat(5000);assert.deepEqual(rules(r),[]);
  r.content[0].text+='a';assert.deepEqual(rules(r),['L2']);
  for(const role of ['code','table']){r.content[0].role=role;assert.deepEqual(rules(r),[]);}
  r.content[0].role='specs';assert.deepEqual(rules(r),['L2']);
});
test('L3: semantic tags and landmark roles require corresponding nonempty noise',()=>{
  for(const marker of ['nav','header','div role="navigation"','div role="banner"']) {
    const r=ref();assert.deepEqual(rules(r,`<${marker}>Menu</${marker.split(' ')[0]}>`),['L3']);
    r.noise=[{kind:'site-nav',text:'Menu'}];assert.deepEqual(rules(r,`<${marker}>Menu</${marker.split(' ')[0]}>`),[]);
  }
  for(const marker of ['footer','div role="contentinfo"']) {
    const r=ref();r.noise=[{kind:'site-nav',text:'Menu'}];assert.deepEqual(rules(r,`<${marker}>Footer</${marker.split(' ')[0]}>`),['L3']);
    r.noise.push({kind:'footer',text:'Footer'});assert.deepEqual(rules(r,`<${marker}>Footer</${marker.split(' ')[0]}>`),[]);
  }
});
test('L3: in-content landmarks and TOC-only navigation do not trigger site-nav',()=>{
  for(const html of ['<main><nav>Contents</nav><header>Heading</header><footer>Notes</footer></main>', '<article><nav>Contents</nav></article>', '<nav id="toc">Table of Contents</nav>', '<nav class="toc">Table of Contents</nav>']) assert.deepEqual(rules(ref(),html),[]);
});
test('L3: an empty landmark has no text to annotate',()=>{
  assert.deepEqual(rules(ref(),'<footer></footer>'),[]);
});
test('empty shadow-code components are recorded as captured-DOM limitations',()=>{
  assert.deepEqual(contentOutsideDom('<main><mdn-code-example></mdn-code-example><mdn-code-example>visible source</mdn-code-example></main>'),{count:1,kinds:['code']});
  assert.deepEqual(contentOutsideDom('<main><pre>source</pre></main>'),{count:0,kinds:[]});
});
test('L4: neutral total is at most 15 percent of required text, not optional',()=>{
  const r=ref();r.content[0].text='x'.repeat(1000);r.neutral=[{text:'x'.repeat(150)}];assert.deepEqual(rules(r),[]);
  r.neutral[0].text+='x';assert.deepEqual(rules(r),['L4']);
  r.content.push({required:false,text:'x'.repeat(1000)});assert.deepEqual(rules(r),['L4']);
});
test('L4: short pages (under 1,000 required characters) are exempt',()=>{
  const r=ref();r.content[0].text='x'.repeat(351);r.neutral=[{text:'x'.repeat(129)}];assert.deepEqual(rules(r),[]);
});
test('L5: root, changed segment and invalid metadata fail; same family succeeds',()=>{
  for(const finalUrl of ['https://example.test/','https://example.test/news/a','invalid']) assert.equal(lintCapture({...meta,finalUrl})[0].rule,'L5');
  for(const finalUrl of ['https://example.test/articles/b','https://example.test/articles/a/?x=1#fragment']) assert.deepEqual(lintCapture({...meta,finalUrl}),[]);
  assert.equal(lintCapture({...meta,url:'https://example.test/',finalUrl:'https://example.test/'})[0].rule,'L5');
});
test('L5: added leading locale is ignored; root and changed family still fail',()=>{
  for(const finalUrl of ['https://example.test/en/articles/a','https://example.test/en-ca/articles/a'])assert.deepEqual(lintCapture({...meta,finalUrl}),[]);
  for(const finalUrl of ['https://example.test/en/news/a','https://example.test/en-ca/'])assert.equal(lintCapture({...meta,finalUrl})[0].rule,'L5');
});
test('L6: both duplicate peers fail within a site; self and other sites excluded',()=>{
  const peer={...meta,pageId:'x-p2'};
  assert.equal(lintCapture(meta,[meta,peer])[0].rule,'L6');
  assert.equal(lintCapture(peer,[meta,peer])[0].rule,'L6');
  assert.deepEqual(lintCapture(meta,[meta,{...peer,siteId:'y'},{...peer,sha256:'b'}]),[]);
});
test('capture acceptance returns an explicit rejection for L5',()=>{
  const r=captureUrlRejection('x',meta.url,'https://example.test/');
  assert.equal(r.rejected,true);assert.equal(r.errors[0].rule,'L5');assert.match(r.reason,/L5/);
  assert.equal(captureUrlRejection('x',meta.url,meta.finalUrl),null);
});
test('eval mode has no reference dependency, hashes actual DOM, remains read-only',async()=>{
  const artifactRoot=path.resolve(__dirname,'../../../workspace/revision/corpus/archive/wp-a3-resumed-2026-11-21/test-artifacts');
  await fs.mkdir(artifactRoot,{recursive:true});
  const corpus=await fs.mkdtemp(path.join(artifactRoot,'lint-fixture-'));
  // Retain test artifacts in the centralized archive; no cleanup deletion.
  const html='<h1>Title</h1>',hash=crypto.createHash('sha256').update(html).digest('hex');
  for(const [id,url] of [['p1','https://example.test/'],['p2',meta.finalUrl]]) {
    const folder=path.join(corpus,'eval','x',id);await fs.mkdir(folder,{recursive:true});
    await fs.writeFile(path.join(folder,'meta.json'),JSON.stringify({...meta,url:meta.url,finalUrl:url,sha256:id}));
    await fs.writeFile(path.join(folder,'rendered-dom.html'),html);
  }
  const before=await fs.readdir(path.join(corpus,'eval','x','p1'));
  const report=await checkCorpus({corpus,evalCaptures:true});
  assert.deepEqual(report.ruleCounts,{L5:1,L6:2});assert.equal(report.pages,2);
  assert.ok(report.results.every(r=>r.sourceSha256===hash));
  assert.deepEqual(await fs.readdir(path.join(corpus,'eval','x','p1')),before);
  await assert.rejects(checkCorpus({corpus,evalCaptures:true,write:true}),/read-only/);
});
