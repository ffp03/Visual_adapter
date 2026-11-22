#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateReference } = require('../eval/references.cjs');
const { normalize, extractText } = require('../eval/text.cjs');
const { createDOM } = require('../eval/dom.cjs');
const { VirtualConsole } = require('jsdom');
const CORPUS = path.resolve(__dirname, '../../../workspace/revision/corpus');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Capture checks need no annotations or policy outputs. Peers use observed DOM hashes.
function lintCapture(meta, peers = []) {
  const errors = [];
  try {
    const requested = new URL(meta.url), final = new URL(meta.finalUrl);
    const requestedParts=requested.pathname.split('/').filter(Boolean),finalParts=final.pathname.split('/').filter(Boolean);
    // Ignore one added leading locale, not an arbitrary changed family.
    if (/^[a-z]{2}(?:-[a-z]{2})?$/i.test(finalParts[0]||'') && finalParts[0]!==requestedParts[0] && finalParts[1]===requestedParts[0]) finalParts.shift();
    if (final.pathname==='/' || requestedParts[0]!==finalParts[0])
      errors.push({ rule:'L5', reason:'redirect-away-from-family', url:meta.url, finalUrl:meta.finalUrl });
  } catch {
    errors.push({ rule:'L5', reason:'missing-or-invalid-capture-url', url:meta?.url, finalUrl:meta?.finalUrl });
  }
  const duplicates = peers.filter(p => p.pageId !== meta.pageId && p.siteId === meta.siteId && p.sha256 && p.sha256 === meta.sha256);
  if (duplicates.length) errors.push({ rule:'L6', reason:'duplicate-rendered-dom', sha256:meta.sha256, pages:duplicates.map(p=>p.pageId) });
  return errors;
}

function lintReference(reference, html, meta, peers = []) {
  const errors = lintCapture(meta, peers);
  const required = (reference?.content || []).filter(u => u?.required === true && typeof u.text === 'string');
  for (const unit of required) {
    const text = normalize(unit.text);
    for (const noise of reference?.noise || []) {
      const value = normalize(noise?.text);
      if (value.length >= 15 && text.includes(value)) errors.push({ rule:'L1', reason:'required-contains-noise', id:unit.id, noiseId:noise.id });
    }
    if (text.length > 5000 && !['code','table'].includes(unit.role)) errors.push({ rule:'L2', reason:'oversized-required-unit', id:unit.id, characters:text.length });
  }
  const dom = typeof html==='string'?createDOM(html,{virtualConsole:new VirtualConsole()}):null;
  try {
    const doc = dom?dom.window.document:html;
    for (const [selector,kind] of [
      ['nav,header,[role~="navigation"],[role~="banner"]','site-nav'],
      ['footer,[role~="contentinfo"]','footer']
    ]) if ([...doc.querySelectorAll(selector)].some(node=>extractText(node) && !node.closest('main,article,[role="main"]') && !isInPageToc(node,reference,doc)) && !(reference?.noise || []).some(u=>u?.kind===kind && normalize(u.text)))
      errors.push({ rule:'L3', reason:'missing-boilerplate-unit', kind });
  } finally { dom?.window.close(); }
  const requiredCharacters = required.reduce((n,u)=>n+normalize(u.text).length,0);
  const neutralCharacters = (reference?.neutral || []).reduce((n,u)=>n+normalize(u?.text).length,0);
  // DESIGN 2a (2026-11-21): L4 applies only to pages with at least 1,000 required characters.
  if (requiredCharacters >= 1000 && neutralCharacters > requiredCharacters * 0.15) errors.push({ rule:'L4', reason:'excessive-neutral-text', requiredCharacters, neutralCharacters });
  return errors;
}

function isInPageToc(node,reference,doc) {
  if(node.matches('#toc,.toc,[role="doc-toc"],[aria-label*="contents" i],[aria-labelledby*="toc" i]')) return true;
  // Some templates place their in-page TOC in an unlabelled nav wrapper.
  return (reference?.neutral||[]).some(unit=>{
    if(!unit.selectorHint)return false;
    try{return [...doc.querySelectorAll(unit.selectorHint)].some(toc=>toc===node||toc.contains(node));}catch{return false;}
  });
}

function contentOutsideDom(html) {
  const dom=typeof html==='string'?createDOM(html,{virtualConsole:new VirtualConsole()}):null;
  try {
    const count=[...(dom?dom.window.document:html).querySelectorAll('mdn-code-example')].filter(n=>!extractText(n)).length;
    return {count,kinds:count?['code']:[]};
  }finally{dom?.window.close();}
}

async function walk(dir, name) {
  let entries;
  try { entries=await fs.readdir(dir,{withFileTypes:true}); } catch(e) { if(e.code==='ENOENT') return []; throw e; }
  const found=[];
  for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) found.push(...await walk(full,name));
    else if(entry.name===name) found.push(full);
  }
  return found;
}
function counts(reference) {
  const total = units => ({ units:units.length, characters:units.reduce((n,u)=>n+normalize(u.text).length,0) });
  return {
    required:total((reference.content||[]).filter(u=>u.required)),
    optional:total((reference.content||[]).filter(u=>!u.required)),
    noise:total(reference.noise||[]), neutral:total(reference.neutral||[])
  };
}

async function checkCorpus({ corpus = CORPUS, evalCaptures = false, evalReferences = false, write = false } = {}) {
  if (evalCaptures && write) throw Error('--eval-captures is read-only; --write is not permitted');
  const split = evalCaptures || evalReferences ? 'eval' : 'dev';
  // Metadata enumeration includes eval captures that have no reference.
  const files = await walk(path.join(corpus,split),'meta.json'), inputs=[], results=[];
  for (const file of files) {
    const folder=path.dirname(file), pageId=path.basename(folder), siteId=path.basename(path.dirname(folder));
    try {
      const [meta,html] = await Promise.all([fs.readFile(file,'utf8').then(JSON.parse),fs.readFile(path.join(folder,'rendered-dom.html'),'utf8')]);
      inputs.push({folder,html,meta:{...meta,pageId,siteId,sha256:sha256(html)}});
    } catch(e) { results.push({pageId,siteId,pass:false,errors:[{reason:'capture-read-error',detail:e.message}]}); }
  }
  const peers=inputs.map(p=>p.meta);
  for (const {folder,html,meta} of inputs) {
    let errors, statistics, limitation, referenceSha256;
    if (evalCaptures) errors=lintCapture(meta,peers);
    else {
      try {
        const referenceBytes=await fs.readFile(path.join(folder,'reference.json'));
        const reference=JSON.parse(referenceBytes),dom=createDOM(html,{virtualConsole:new VirtualConsole()});
        referenceSha256=sha256(referenceBytes);
        try{
          errors=[...validateReference(reference,dom.window.document),...lintReference(reference,dom.window.document,meta,peers)];
          statistics=counts(reference);limitation=contentOutsideDom(dom.window.document);
        }finally{dom.window.close();}
      } catch(e) { errors=[{reason:'reference-read-error',detail:e.message}]; }
    }
    const result={pageId:meta.pageId,siteId:meta.siteId,sourceSha256:meta.sha256,pass:errors.length===0,errors,...(statistics?{referenceSha256,counts:statistics,contentOutsideDom:limitation}:{})};
    results.push(result);
    if (write) await fs.writeFile(path.join(folder,'reference-lint.json'),JSON.stringify({guidelineVersion:2,checkedAt:new Date().toISOString(),...result},null,2)+'\n');
  }
  const missing=[];
  if(!evalCaptures) {
    // Eval references are listed in the combined manifest; dev keeps its own manifest.
    const manifest=JSON.parse(await fs.readFile(path.join(corpus,split==='eval'?'manifest.json':'dev-manifest.json'),'utf8'));
    for(const site of (manifest.sites||[]).filter(s=>!s.split||s.split===split)) for(const page of site.pages||[]) if(!results.some(r=>r.pageId===page.pageId)) missing.push(page.pageId);
  }
  const ruleCounts={};
  for(const r of results) for(const e of r.errors) ruleCounts[e.rule||'validation']=(ruleCounts[e.rule||'validation']||0)+1;
  return {split,checkedAt:new Date().toISOString(),rules:evalCaptures?['L5','L6']:['validateReference','L1','L2','L3','L4','L5','L6'],pages:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,missing,ruleCounts,results};
}

async function main() {
  const report=await checkCorpus({evalCaptures:process.argv.includes('--eval-captures'),evalReferences:process.argv.includes('--eval'),write:process.argv.includes('--write')});
  if(process.argv.includes('--json') || process.argv.includes('--deep-lint')) console.log(JSON.stringify(report,null,2));
  else {
    console.log(report.split+': '+report.pages+' pages; '+report.passed+' passed; '+report.failed+' failed; missing '+report.missing.length);
    console.log('Errors by rule: '+JSON.stringify(report.ruleCounts));
    for(const r of report.results.filter(r=>!r.pass)) console.log('FAIL '+r.pageId+': '+JSON.stringify(r.errors));
  }
  if(report.failed || report.missing.length) process.exitCode=1;
}
module.exports={lintCapture,lintReference,checkCorpus,counts,contentOutsideDom};
if(require.main===module) main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
