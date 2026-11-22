'use strict';
// Blind inspection utility: frozen DOM only; no policy imports or outputs.
const fs=require('node:fs');
const path=require('node:path');
const {createDOM}=require('../eval/dom.cjs');
const {extractText}=require('../eval/text.cjs');
const [pageId='dev-01-p1',selector='body',mode='outline']=process.argv.slice(2);
const folder=path.resolve(__dirname,'../../../workspace/revision/corpus/dev',pageId.slice(0,6),pageId);
const html=fs.readFileSync(path.join(folder,'rendered-dom.html'),'utf8');
const dom=createDOM(html.replace(/<(style|script|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,''));
const doc=dom.window.document;
const label=n=>n.tagName.toLowerCase()+(n.id?'#'+n.id:'')+(n.className&&typeof n.className==='string'?'.'+n.className.trim().replace(/\s+/g,'.'):'');
if(mode==='text') for(const n of doc.querySelectorAll(selector)) console.log(label(n),JSON.stringify(extractText(n)));
else if(mode==='blocks') for(const n of doc.querySelectorAll(selector)) console.log(label(n),'anc='+[...function*(el){for(let k=el.parentElement;k&&k!==doc.body;k=k.parentElement)yield label(k)}(n)].slice(0,5).join(' > '),JSON.stringify(extractText(n).slice(0,240)));
else {
 const visit=(n,depth)=>{
  if(!n||depth>5)return;const text=extractText(n);if(!text)return;
  console.log('  '.repeat(depth)+label(n)+' ['+text.length+'] '+JSON.stringify(text.slice(0,130)));
  for(const child of n.children) visit(child,depth+1);
 };
 for(const n of doc.querySelectorAll(selector))visit(n,0);
}
dom.window.close();
