'use strict';
const v3=require('../../extension/procedure-v3.js');
class Families{
 constructor(){this.hosts=new Map();}
 add(rule,admission){
  if(!admission?.accepted)throw Error('family-requires-admission');
  const host=v3.hostnameKey(rule.applicability.hostname),key=JSON.stringify([...rule.applicability.anchors].sort((a,b)=>a.selector.localeCompare(b.selector)));
  const rules=this.hosts.get(host)||new Map();rules.set(key,JSON.parse(JSON.stringify(rule)));this.hosts.set(host,rules);return this;
 }
 rules(hostname){return [...(this.hosts.get(v3.hostnameKey(hostname))?.values()||[])];}
 select(doc){return v3.selectFamily(doc,this.rules(doc.location.hostname));}
 toJSON(){return Object.fromEntries([...this.hosts].map(([host])=>[host,this.rules(host)]));}
}
module.exports={Families};
