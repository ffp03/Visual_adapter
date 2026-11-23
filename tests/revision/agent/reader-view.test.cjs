'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createDOM}=require('../eval/dom.cjs');
test('scored Reader View always adds escaped title and byline before content, including duplicate heading',()=>{
 const {formatArticle,run}=require('../eval/policies/p1-reader-view.cjs');
 assert.equal(formatArticle({title:'T',byline:'B',content:'<h1>T</h1><p>Body</p>'}),'<h1>T</h1><p>B</p><h1>T</h1><p>Body</p>');
 assert.equal(formatArticle({title:' ',byline:'',content:'<p>Body</p>'}),'<p>Body</p>');
 const html=formatArticle({title:'<img> & "title"',byline:'<script>x</script>',content:'<p>Body</p>'}),dom=createDOM(html);
 try{assert.equal(dom.window.document.querySelectorAll('img,script').length,0);assert.equal(dom.window.document.querySelector('h1').textContent,'<img> & "title"');assert.equal(dom.window.document.querySelector('p').textContent,'<script>x</script>');}finally{dom.window.close();}
 assert.equal(run('<title>T</title><article><h1>T</h1><p>'+('Article substantive reading content. '.repeat(30))+'</p></article>').ok,true);
});
test('agent Readability wrapper and baseline dispatch retain their v3 bytes',()=>{
 const {hash}=require('../../../backend/agent/ledger.cjs'),root=path.resolve(__dirname,'../../..');
 const v3={
  'tests/revision/eval/policies/p1-readability.cjs':'cc7307f4094b2c0b1cabf71aadbcd12f24cf3b716e3a6281f11532abd2a67005',
  'tests/revision/eval/policy-worker.cjs':'d87a041130d99eee7165e02aed29e4147fee45dfe9a201da4320ae998cfa2a74',
  'backend/agent/baselines.cjs':'06871329bf89809477f19dc0f0a92850d0881c42822982c597030f48e0263f70'
 };
 for(const [file,sha256] of Object.entries(v3))assert.equal(hash(fs.readFileSync(path.join(root,file))),sha256,file);
});
