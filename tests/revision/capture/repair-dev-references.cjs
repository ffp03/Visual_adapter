'use strict';

// Re-copy only validator-failing units from their frozen DOM using the shared
// section-3 text extractor; keep annotation roles/kinds and selectors intact.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createDOM } = require('../eval/dom.cjs');
const { extractText, normalize } = require('../eval/text.cjs');
const { validateReference } = require('../eval/references.cjs');

const ROOT = path.resolve(__dirname, '../../..');
const DEV = path.join(ROOT, 'workspace/revision/corpus/dev');
const ARCHIVE = path.join(ROOT, 'workspace/revision/corpus/archive/dev-references-2026-11-21');

async function walk(dir) {
  const out=[];
  for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...await walk(full));
    else if(entry.name==='reference.json') out.push(full);
  }
  return out;
}
function occurrenceCount(source, value) {
  let n=0; for(let i=source.indexOf(value);i>=0;i=source.indexOf(value,i+value.length)) n++;
  return n;
}
function units(ref) { return ['content','noise','neutral'].flatMap(section=>(ref[section]||[]).map(unit=>({section,unit}))); }

async function main() {
  await fs.mkdir(ARCHIVE,{recursive:true});
  const siteArg=process.argv.find(arg=>arg.startsWith('--sites='));
  const selected=siteArg?new Set(siteArg.slice('--sites='.length).split(',').filter(Boolean)):null;
  const reports=[];
  for(const file of (await walk(DEV)).sort()) {
    const folder=path.dirname(file), id=path.basename(folder), archive=path.join(ARCHIVE,`${id}.json`);
    if(selected&&!selected.has(id.slice(0,6)))continue;
    const [referenceBytes,html]=await Promise.all([fs.readFile(file),fs.readFile(path.join(folder,'rendered-dom.html'),'utf8')]);
    try { await fs.access(archive); }
    catch(e) { if(e.code!=='ENOENT') throw e; await fs.writeFile(archive,referenceBytes,{flag:'wx'}); }
    const ref=JSON.parse(referenceBytes), dom=createDOM(html), doc=dom.window.document;
    const before=validateReference(ref,html), byId=new Map(units(ref).map(x=>[x.unit.id,x]));
    const changed=new Set(), removed=[];
    for(const error of before) {
      if(!error.id || error.reason==='duplicate-unit-multiplicity') continue;
      const entry=byId.get(error.id); if(!entry) continue;
      const {unit}=entry;
      if(typeof unit.selectorHint==='string' && unit.selectorHint) {
        try {
          const node=doc.querySelector(unit.selectorHint);
          if(node) { unit.text=extractText(node); changed.add(unit.id); }
        } catch {}
      }
    }
    // Empty annotations are never useful and the authoritative validator
    // rejects them. This also removes the legacy synthetic empty footer rows.
    for(const section of ['content','noise','neutral']) {
      ref[section]=(ref[section]||[]).filter(unit=>{
        if(typeof unit.text==='string' && normalize(unit.text)) return true;
        removed.push(unit.id||'(no id)'); return false;
      });
    }
    let sourceText=extractText(html);
    const groups=new Map();
    for(const entry of units(ref)) {
      const value=normalize(entry.unit.text);
      if(!groups.has(value)) groups.set(value,[]);
      groups.get(value).push(entry);
    }
    for(const [value,group] of groups) {
      let surplus=group.length-occurrenceCount(sourceText,value);
      while(surplus>0) {
        // Keep a title and required units where possible; remove later
        // duplicate annotations because a single source occurrence cannot
        // represent more than one reference unit.
        const candidates=group.filter(x=>!removed.includes(x.unit.id));
        candidates.sort((a,b)=>{
          const score=x=>x.unit.role==='title'?4:x.unit.required===true?3:x.section==='content'?2:0;
          return score(a)-score(b);
        });
        const drop=candidates[0]; if(!drop) break;
        ref[drop.section]=ref[drop.section].filter(u=>u!==drop.unit);
        removed.push(drop.unit.id||'(no id)'); surplus--;
      }
    }
    const after=validateReference(ref,html);
    // A selector can be too broad or point at a wrapper with no extractable
    // text; leave only units that the canonical source validator accepts.
    if(after.length) {
      for(const error of after) if(error.id && error.reason==='unit-not-in-source-text') {
        const entry=units(ref).find(x=>x.unit.id===error.id); if(!entry) continue;
        if(entry.unit.required===true && entry.unit.role==='title') continue;
        ref[entry.section]=ref[entry.section].filter(u=>u!==entry.unit);
        removed.push(entry.unit.id||'(no id)');
      }
    }
    await fs.writeFile(file,JSON.stringify(ref,null,2)+'\n');
    dom.window.close();
    reports.push({pageId:id,changed:[...changed],removed:[...new Set(removed)],remaining:validateReference(ref,html)});
  }
  console.log(JSON.stringify({pages:reports.length,reports},null,2));
  if(reports.some(r=>r.remaining.length)) process.exitCode=1;
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
