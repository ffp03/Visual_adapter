'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createDOM}=require('../eval/dom.cjs');
const {extractText,normalize}=require('../eval/text.cjs');
const {validateReference}=require('../eval/references.cjs');
const ROOT=path.resolve(__dirname,'../../..');
const DEV=path.join(ROOT,'workspace/revision/corpus/dev');
async function walk(dir){let out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(f));else if(e.name==='reference.json')out.push(f)}return out}
function hint(node){if(node.id)return `#${node.id}`;const classes=[...node.classList||[]].slice(0,2);return node.tagName.toLowerCase()+(classes.length?'.'+classes.join('.'):'' )}
function nodesFor(doc,kind){
  const selectors=kind==='site-nav'?['header','nav','[role="navigation"]','.pagetop']:['footer','[role="contentinfo"]','[id*="footer" i]','[class*="footer" i]'];
  let nodes=[];for(const s of selectors)nodes.push(...doc.querySelectorAll(s));
  if(kind==='site-nav'&&!nodes.length)nodes.push(...doc.body.children);
  if(kind==='footer'&&!nodes.length)nodes.push(...[...doc.body.children].reverse());
  return [...new Set(nodes)];
}
async function main(){const reports=[];for(const file of await walk(DEV)){const html=await fs.readFile(path.join(path.dirname(file),'rendered-dom.html'),'utf8'),sourceText=extractText(html),ref=JSON.parse(await fs.readFile(file,'utf8')),dom=createDOM(html),doc=dom.window.document;let added=[];
  for(const kind of ['site-nav','footer'])if(!ref.noise.some(u=>u.kind===kind&&normalize(u.text))){let success=false;for(const node of nodesFor(doc,kind)){const text=extractText(node);if(!text||!sourceText.includes(text))continue;const unit={id:`${kind}-repaired-${ref.noise.length+1}`,kind,text,selectorHint:hint(node)};ref.noise.push(unit);if(!validateReference(ref,html).some(e=>e.id===unit.id)){added.push(kind);success=true;break}ref.noise.pop()}if(!success)reports.push({page:path.basename(path.dirname(file)),missing:kind})}
  if(added.length)await fs.writeFile(file,JSON.stringify(ref,null,2)+'\n');dom.window.close();}
  console.log(JSON.stringify({pagesUpdated:reports.length,missing:reports},null,2));if(reports.length)process.exitCode=1
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
