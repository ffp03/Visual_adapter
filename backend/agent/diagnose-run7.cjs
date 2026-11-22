'use strict';
const fs=require('node:fs'),path=require('node:path');
const v3=require('../../extension/procedure-v3.js'),{PageRegistry}=require('./pages.cjs');
const baseline=require('./baselines.cjs'),{redact}=require('./privacy.cjs'),{score}=require('../../tests/revision/eval/score.cjs');
async function main(){
 const p=JSON.parse(fs.readFileSync('workspace/revision/dev-runs/run7/resume.json')),
 state=JSON.parse(fs.readFileSync(p.iterationFile)),trials=fs.readFileSync(state.folder+'/P4-off-trials.jsonl','utf8').trim().split('\n').map(JSON.parse),registry=new PageRegistry(),results=[];
 for(const [host,ids,selector] of [
  ['blog.python.org',['dev-01-p1','dev-01-p2'],'div.not-prose.mt-6'],
  ['www.bbc.com',['dev-08-p1','dev-08-p2'],'div[class~="Links-styles__LinksContainerStyled-sc-b3f84cef-0"]']
 ]){
  const trial=trials.find(t=>t.site===host),rule={...trial.rule,exclude:[selector]},doms=ids.map(id=>registry.load(id)),docs=doms.map(d=>d.window.document);
  try{
   const inventories=v3.inventory(docs,{mode:'P4'}),baselines=await baseline.forPages(ids),gate=v3.gate(docs,rule,{inventories,baselines});
   const pages=docs.map((doc,i)=>{
    const record=registry.resolve(ids[i]),ref=JSON.parse(fs.readFileSync(path.join(path.dirname(record.file),'reference.json'))),removed=v3.matches(doc,selector);
    const baseRule={...rule,exclude:[]},before=score(v3.render(doc,baseRule).innerHTML,ref,{format:'html'}),after=score(v3.render(doc,rule).innerHTML,ref,{format:'html'});
    return {id:ids[i],before:{recall:before.contentRecall,noise:before.noiseLeakage},after:{recall:after.contentRecall,noise:after.noiseLeakage},
      touchedUnique:inventories[i].unique.filter(b=>removed.some(n=>n.contains(b.node))).slice(0,12).map(b=>({tag:b.node.tagName,characters:b.characters,linkDensity:b.linkDensity,insideAnchor:!!b.node.closest('a[href]'),cue:redact(b.text).slice(0,80),
       referenceNoise:ref.noise.filter(n=>v3.norm(n.text).includes(b.text)||b.text.includes(v3.norm(n.text))).map(n=>n.id)}))};
   });results.push({host,selector,gateReasons:gate.reasons,pages});
  }finally{doms.forEach(d=>d.window.close());}
 }
 fs.writeFileSync(process.argv[2]||'workspace/revision/dev-runs/run7/gate-diagnostics.json',JSON.stringify(results,null,2),{flag:'wx'});console.log(JSON.stringify(results));
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
