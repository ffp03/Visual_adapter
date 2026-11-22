'use strict';
const fs=require('node:fs'),path=require('node:path');
const freeze=require('./eval-freeze.cjs'),{lines,json,accounting}=require('./eval-run.cjs');
const {Ledger}=require('./ledger.cjs');
const {score,SCORING_VERSION}=require('../../tests/revision/eval/score.cjs');
const {summarize,pairedDifference}=require('../../tests/revision/eval/stats.cjs');
const {metadata}=require('../../tests/revision/eval/scoreboard.cjs');
const {failureCategory}=require('../../tests/revision/eval/output.cjs');
const {validateReference}=require('../../tests/revision/eval/references.cjs');
const comparators=['P0','P1','P2-fresh','P2-shared','P3'];
const PAIRS=[...comparators.map(p=>['P4-on',p]),['P4-off','P0'],['P4-off','P1'],['P4-off','P4-on'],['P4-Codex','P4-on']];
const ACCOUNT_KEYS=['modelRequests','promptTokens','completionTokens','cachedTokens','costEstimate'];
function siteAccounting({ledger,directory,config,site,freezeSha256}){
 const file=path.join(directory,'sites',site.siteId,'complete.json'),receipt=JSON.parse(fs.readFileSync(file));
 if(receipt.policy!==config.policy||receipt.siteId!==site.siteId||receipt.freezeSha256!==freezeSha256)throw Error('score-site-receipt-binding');
 const canonical=accounting(ledger,config.experiment,site.host),recorded=receipt.accounting;
 for(const key of ACCOUNT_KEYS){
  if(typeof recorded?.[key]!=='number'||!Number.isFinite(recorded[key])||recorded[key]<0||Math.abs(recorded[key]-canonical[key])>1e-10)throw Error('score-site-accounting-ledger-mismatch:'+key);
 }
 if(JSON.stringify([...(recorded.requestIds||[])].sort())!==JSON.stringify([...canonical.requestIds].sort()))throw Error('score-site-accounting-request-binding');
 return {policy:config.policy,site:site.host,siteId:site.siteId,...canonical,latencyMs:receipt.wallMs,receiptFile:file,receiptSha256:freeze.sha(fs.readFileSync(file)),experiment:config.experiment};
}
function attachAccounting(summary,rows,accounts){
 const sites=new Set(rows.map(r=>r.site));
 for(const [policy,value] of Object.entries(summary.policies)){
  const selected=accounts.filter(a=>a.policy===policy&&sites.has(a.site));
  value.accounting=Object.fromEntries([...ACCOUNT_KEYS,'latencyMs','unknownUsageRequests'].map(k=>[k,selected.reduce((s,a)=>s+(a[k]||0),0)]));
  value.accountingSource='site completion receipts verified against the full run ledger, including induction requests';
 }
 for(const [site,sub] of Object.entries(summary.bySite||{}))attachAccounting(sub,rows.filter(r=>r.site===site),accounts);
 return summary;
}
function summarizeCohort(rows,{resamples=10000,seed=20261121}={}){
 const options={resamples,seed},summary=rows.length?summarize(rows,options):{policies:{},...options};
 summary.comparisons=[];summary.unavailableComparisons=[];
 for(const [mainPolicy,policy] of PAIRS){
  const base=rows.filter(r=>r.policy===policy),main=rows.filter(r=>r.policy===mainPolicy);
  const baseIds=new Set(base.map(r=>r.id)),mainIds=new Set(main.map(r=>r.id));
  const ids=new Set([...baseIds].filter(id=>mainIds.has(id)));
  if(!ids.size){summary.unavailableComparisons.push({policyA:mainPolicy,policyB:policy,reason:'no-common-pages'});continue;}
  const result=pairedDifference(rows.filter(r=>(r.policy===mainPolicy||r.policy===policy)&&ids.has(r.id)),mainPolicy,policy,options);
  summary.comparisons.push({...result,cohort:mainPolicy==='P4-Codex'?'frozen-Codex-sites':policy==='P3'?'p3-only':'common-heldout-p3-p5',pageIds:[...ids].sort()});
 }
 summary.bySite=Object.fromEntries([...new Set(rows.map(r=>r.site))].sort().map(site=>[site,summarize(rows.filter(r=>r.site===site),options)]));
 return summary;
}
function run({directories,siteIds,root=freeze.ROOT,outputDirectory}={}){
 const verified=freeze.verify({root});
 if(!directories?.length||!siteIds?.length)throw Error('score-named-sites-and-directories-required');
 const sites=siteIds.map(id=>{const s=verified.manifest.sites.find(s=>s.siteId===id);if(!s)throw Error('score-unknown-site');return s;});
 const pages=new Map(sites.flatMap(s=>s.pages.filter(p=>p.heldOut).map(p=>[p.id,{...p,site:s.host,mixedFamily:s.mixedFamily}])));
 const keys=new Set(),inputs=[],rows=[],referenceCache=new Map(),skippedRows=[],accounts=[],ledger=new Ledger({root}),policies=new Set();
 for(const dir of directories){
  const config=JSON.parse(fs.readFileSync(path.join(dir,'run.json')));
  if(config.freezeSha256!==verified.sha256)throw Error('score-input-freeze-mismatch');
  if(!Array.isArray(config.siteIds)||!config.siteIds.length||new Set(config.siteIds).size!==config.siteIds.length)throw Error('score-run-sites-invalid');
  if(config.policy==='P4-Codex'&&config.siteIds.some(id=>!verified.freeze.execution.Codex.siteIds.includes(id)))throw Error('score-Codex-outside-frozen-subset');
  policies.add(config.policy);
  for(const site of sites.filter(s=>config.siteIds.includes(s.siteId)))accounts.push(siteAccounting({ledger,directory:dir,config,site,freezeSha256:verified.sha256}));
  inputs.push({directory:path.resolve(dir),rowsSha256:freeze.sha(fs.readFileSync(path.join(dir,'rows.jsonl')))});
  for(const original of lines(path.join(dir,'rows.jsonl'))){
   const page=pages.get(original.id);
   if(!page){skippedRows.push({id:original.id,policy:original.policy,reason:'outside-heldout-score-cohort'});continue;}
   if(!config.siteIds.includes(page.siteId)||original.policy!==config.policy||original.freezeSha256!==verified.sha256||original.sourceSha256!==page.sha256||original.referenceSha256!==page.referenceSha256||original.site!==page.site)throw Error('score-row-binding-mismatch:'+original.id);
   const key=original.id+':'+original.policy;if(keys.has(key))throw Error('duplicate-page-policy:'+key);keys.add(key);
   const parsed=metadata(original);if(parsed.errors.length)throw Error('invalid-score-row-metadata:'+key+':'+parsed.errors.join(','));
   let ref=referenceCache.get(page.id);
   if(!ref){
    ref=JSON.parse(fs.readFileSync(path.join(root,page.referenceFile)));
    // Validate only the named score cohort; never use gold references in generation.
    const errors=validateReference(ref,fs.readFileSync(path.join(root,page.sourceFile),'utf8'));
    if(errors.length)throw Error('frozen-reference-invalid:'+page.id);referenceCache.set(page.id,ref);
   }
   const source=fs.realpathSync(path.resolve(dir,original.outputFile)),relative=path.relative(fs.realpathSync(dir),source);
   if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('score-output-outside-folder');
   const bytes=fs.readFileSync(source);if(freeze.sha(bytes)!==original.outputSha256)throw Error('score-output-hash-mismatch');
   const delivered=original.ok||original.fallback;
   rows.push({...original,...parsed.values,scoringVersion:SCORING_VERSION,mixedFamily:page.mixedFamily,audited:ref.audited===true||ref.audit?.status==='audited',failureCategory:original.ok?null:failureCategory(original.reason),
    scores:score(delivered?bytes.toString('utf8'):'',ref,{format:'html',ok:original.ok,fallback:original.fallback,...verified.freeze.scoreThresholds})});
  }
 }
 // Validate the union after every folder has contributed, with the frozen Codex subset.
 for(const policy of policies)for(const site of sites){
  if(policy==='P4-Codex'&&!verified.freeze.execution.Codex.siteIds.includes(site.siteId))continue;
  for(const page of policy==='P3'?[site.pages[2]]:site.pages.slice(2)){
   const key=page.id+':'+policy;if(!keys.has(key))throw Error('score-missing-policy-row:'+key);
  }
 }
 const without=rows.filter(r=>!r.mixedFamily),audited=rows.filter(r=>r.audited);
 const summary={freezeSha256:verified.sha256,scoringVersion:SCORING_VERSION,siteIds,inputs,skippedRows,
  all:attachAccounting(summarizeCohort(rows),rows,accounts),withoutMixedFamily:attachAccounting(summarizeCohort(without),without,accounts),audited:audited.length?attachAccounting(summarizeCohort(audited),audited,accounts):null,
  accountingByPolicyAndSite:accounts,
  note:'Intervals use 10,000 site resamples. One-site sample intervals are degenerate and do not support population claims. P2-shared p2 is written but excluded from held-out comparisons. P3 comparisons use p3 only.'};
 const directory=outputDirectory||path.join(root,'workspace/revision/results/eval-score-'+Date.now());
 fs.mkdirSync(directory,{recursive:true});json(path.join(directory,'summary.json'),summary);
 fs.writeFileSync(path.join(directory,'rows.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});
 return {directory,rows,summary};
}
module.exports={comparators,PAIRS,summarizeCohort,siteAccounting,attachAccounting,run};
if(require.main===module){const [sites,...directories]=process.argv.slice(2);try{const r=run({siteIds:sites.split(','),directories});console.log(JSON.stringify({directory:r.directory,policies:r.summary.all.policies}));}catch(e){console.error(e.stack);process.exitCode=1;}}
