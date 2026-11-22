'use strict';
// Separate stress test: deliberately cross-site, never a generation input.
const fs=require('node:fs'),path=require('node:path');
const {verify,ROOT}=require('./eval-freeze.cjs'),{PageRegistry}=require('./pages.cjs');
const {seededRandom}=require('../../tests/revision/eval/stats.cjs');
const v3=require('../../extension/procedure-v3.js'),baseline=require('./baselines.cjs');
const {newRun,writeRow,json}=require('./eval-run.cjs');
function pairs(sites){
 const ordered=sites.map(s=>s.siteId).sort(),random=seededRandom(20261121);
 for(let i=ordered.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}
 return ordered.map((id,i)=>({sourceSiteId:id,targetSiteId:ordered[(i+1)%ordered.length],targetPage:ordered[(i+1)%ordered.length]+'-p3'}));
}
async function run({sourceDirectory,siteIds,root=ROOT}={}){
 const verified=verify({root}),config=JSON.parse(fs.readFileSync(path.join(sourceDirectory,'run.json')));
 if(config.policy!=='P4-on'||config.freezeSha256!==verified.sha256)throw Error('applicability-source-binding');
 const pairing=pairs(verified.manifest.sites),selected=pairing.filter(p=>siteIds.includes(p.sourceSiteId));
 if(selected.length!==siteIds.length)throw Error('applicability-unknown-site');
 const directory=newRun('P4-applicability',siteIds,verified,{root}),registry=new PageRegistry({root}),rows=[];
 json(path.join(directory,'pairing.json'),{seed:20261121,pairs:pairing});
 for(const pair of selected){
  if(!fs.existsSync(path.join(sourceDirectory,'sites',pair.sourceSiteId,'complete.json')))throw Error('applicability-source-site-not-complete');
  const sourceFolder=path.join(sourceDirectory,'sites',pair.sourceSiteId),complete=JSON.parse(fs.readFileSync(path.join(sourceFolder,'complete.json'))),trialBytes=fs.readFileSync(path.join(sourceFolder,'trial.json'));
  if(complete.freezeSha256!==verified.sha256||complete.evidenceHashes?.['trial.json']!==require('./ledger.cjs').hash(trialBytes))throw Error('applicability-source-trial-hash-mismatch');
  const trial=JSON.parse(trialBytes);
  if(!trial.accepted){rows.push({...pair,status:'no-admitted-rule',modelRequests:0});continue;}
  const started=Date.now(),dom=registry.load(pair.targetPage,'eval');
  try{
   const verdict=v3.useTime(dom.window.document,trial.rule),canonical=dom.manifestPage;
   const output=verdict.accepted?verdict:await baseline.fromRecord('P0',canonical,{cacheDirectory:path.join(root,'workspace/revision/evaluation/baseline-cache')});
   const row=writeRow(directory,{id:pair.targetPage,site:canonical.site,siteId:pair.targetSiteId,policy:'P4-applicability',sourceSiteId:pair.sourceSiteId,
    ok:verdict.accepted,reason:verdict.accepted?null:verdict.reasons.join(';'),fallback:!verdict.accepted,modelRequests:0,promptTokens:0,completionTokens:0,cachedTokens:0,costEstimate:0,latencyMs:Date.now()-started,sourceSha256:canonical.sha256,freezeSha256:verified.sha256},output.html);
   rows.push({...pair,status:verdict.accepted?'unexpectedly-applicable':'declined',...row});
  }finally{dom.window.close();}
 }
 const summary={freezeSha256:verified.sha256,rows,admittedRules:rows.filter(r=>r.status!=='no-admitted-rule').length,declined:rows.filter(r=>r.status==='declined').length,unexpectedlyApplicable:rows.filter(r=>r.status==='unexpectedly-applicable').length,modelRequests:0};
 json(path.join(directory,'summary.json'),summary);return {directory,summary};
}
module.exports={pairs,run};
if(require.main===module){const [sourceDirectory,sites]=process.argv.slice(2);run({sourceDirectory,siteIds:sites.split(',')}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.stack);process.exitCode=1;});}
