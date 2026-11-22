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
test('agent Readability wrapper and its evidence/gate generation path remain byte-identical to v3',()=>{
 const {hash}=require('../../../backend/agent/ledger.cjs'),root=path.resolve(__dirname,'../../..'),archive=path.join(root,'workspace/revision/freeze/archive/v3/evaluation-freeze.json'),old=JSON.parse(fs.readFileSync(fs.existsSync(archive)?archive:path.join(root,'workspace/revision/freeze/evaluation-freeze.json'),'utf8'));
 for(const file of ['tests/revision/eval/policies/p1-readability.cjs','tests/revision/eval/policy-worker.cjs','backend/agent/baselines.cjs','backend/agent/loop.cjs','backend/agent/outline.cjs','extension/procedure-v3.js'])assert.equal(hash(fs.readFileSync(path.join(root,file))),old.files[file],file);
});
