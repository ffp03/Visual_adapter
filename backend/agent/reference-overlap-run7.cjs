'use strict';
const fs=require('node:fs');
const {normalize}=require('../../tests/revision/eval/text.cjs');
const {tokenize}=require('../../tests/revision/eval/score.cjs');
const {redact}=require('./privacy.cjs');
const pointer=JSON.parse(fs.readFileSync('workspace/revision/dev-runs/run7/final.json')),
 context=JSON.parse(fs.readFileSync(pointer.contextFile)),manifest=JSON.parse(fs.readFileSync(context.manifest)),findings=[];
for(const page of manifest.pages){
 const reference=JSON.parse(fs.readFileSync(page.referenceFile)),overlaps=[];
 for(const noise of reference.noise){
  const text=normalize(noise.text);
  for(const required of reference.content.filter(u=>u.required)){
   if(tokenize(normalize(required.text)).length<5&&normalize(required.text).includes(text))
    overlaps.push({noiseId:noise.id,requiredId:required.id,role:required.role,noise: redacted(text),required:redacted(normalize(required.text))});
  }
 }
 if(overlaps.length)findings.push({id:page.id,site:page.site,noiseUnits:reference.noise.length,
  exactRequiredNoiseFloor:new Set(overlaps.map(x=>x.noiseId)).size/Math.max(1,reference.noise.length),overlaps});
}
function redacted(text){return redact(text).slice(0,100);}
fs.writeFileSync('workspace/revision/dev-runs/run7/reference-overlap-diagnostics.json',JSON.stringify(findings,null,2),{flag:'wx'});
console.log(JSON.stringify(findings));
