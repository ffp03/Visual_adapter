'use strict';
const fs=require('node:fs');const path=require('node:path');const {Ledger,hash}=require('./ledger.cjs');
const privacy=require('./privacy.cjs');
function residuals(value) {
 const s=typeof value==='string'?value:JSON.stringify(value);
 const patterns={emails:privacy.emails(),
  urls:/(?:https?:\/\/|www\.)[^\s<>"']+/gi,urlPaths:/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\/[^\s<>"']*/gi,
  digitRuns:privacy.digitRuns(),handles:/@[\p{L}\p{N}_][\p{L}\p{N}_.-]*/gu};
 patterns.urlPaths=/(?<![\p{L}\p{N}_])(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?::\d+)?[/?#][^\s<>"']*/giu;
 return {...Object.fromEntries(Object.entries(patterns).map(([k,re])=>[k,[...s.matchAll(re)].length])),phones:[...s.matchAll(privacy.phones())].filter(m=>privacy.isPhone(m[0])).length};
}
function collectCues(value, cues=[]) {
 if(Array.isArray(value)){for(const v of value)collectCues(v,cues);return cues;}
 if(!value || typeof value!=='object')return cues;
 for(const [key,v] of Object.entries(value)){
  if(key==='cue' && typeof v==='string')cues.push(v);
  else if(key==='outline' && typeof v==='string')for(const line of v.split('\n')){
   const quoted=line.match(/ ("(?:[^"\\]|\\.)*")(?: \[collapsed\])?$/);
   if(quoted)try{cues.push(JSON.parse(quoted[1]));}catch{}
  }else collectCues(v,cues);
 }
 return cues;
}
function audit(ledger=new Ledger()) {
 return ledger.entries().filter(e=>e.event==='request').map(e=>{
  const raw=fs.readFileSync(path.join(ledger.directory,e.payloadFile),'utf8'),payload=JSON.parse(raw);
  const cues=[];for(const m of payload.messages.filter(m=>m.role==='user'))try{collectCues(JSON.parse(m.content),cues);}catch{}
  return {id:e.id,experimentPolicy:e.experimentPolicy,pages:e.pages,payloadHashValid:hash(raw)===e.payloadHash,cuesInspected:cues.length,
   allMessages:residuals(payload.messages),dataMessages:residuals(payload.messages.filter(m=>m.role==='user')),sourceCues:residuals(cues)};
 });
}
if(require.main===module)console.log(JSON.stringify(audit(),null,2));
module.exports={residuals,collectCues,audit};
