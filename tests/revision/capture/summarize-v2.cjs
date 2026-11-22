'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {CORPUS,ARCHIVE,ROOT,hash}=require('./corpus-maintenance.cjs');
const {counts}=require('./check-reference.cjs');
const changes={
 'dev-01':'Leaf release-note blocks; metadata optional; sidebar references and source links separated.',
 'dev-02':'Required price, stock, description and data table; demo warning and recently viewed products are noise.',
 'dev-03':'Leaf documentation blocks, neutral TOC, footer/sidebar noise; missing shadow-code recorded.',
 'dev-04':'Leaf prose and genuine data tables; maintenance/navigation widgets separated; neutral TOC and hatnotes.',
 'dev-05':'Removed required layout tables/navigation; every captured comment body is required.',
 'dev-06':'Kept valid cookie-rejection captures; leaf guidance, neutral TOC; related/history/feedback separated.',
 'dev-07':'Leaf normative blocks; editor bylines optional; version links/TOC neutral; test dashboards are noise.',
 'dev-08':'Body and captions required; bylines/dates optional; sharing/player/related widgets are noise.',
 'dev-09':'Replaced four home redirects with Q-series products; full descriptions/specs required, reviews optional.',
 'dev-10':'Every captured post body required; author/time labels optional without nested duplicate labels.',
 'dev-11':'Clean title and leaf guide blocks; author names optional; collection/social controls are noise.',
 'dev-12':'Full RFC leaf sections, code and data tables; single neutral TOC; metadata optional.'
};
async function run(){
 const manifest=JSON.parse(await fs.readFile(path.join(CORPUS,'dev-manifest.json'),'utf8'));
 const lint=JSON.parse(await fs.readFile(path.join(ARCHIVE,'development-lint.json'),'utf8'));
 const evalLint=JSON.parse(await fs.readFile(path.join(ARCHIVE,'evaluation-lint.json'),'utf8'));
 const integrity=JSON.parse(await fs.readFile(path.join(ARCHIVE,'corpus-integrity.json'),'utf8'));
 const sites=[],referenceArchives=[];
 for(const site of manifest.sites){
  const after={},before={};for(const section of ['required','optional','noise','neutral'])after[section]={units:0,characters:0},before[section]={units:0,characters:0};
  let outside=0,changed=0;
  for(const p of site.pages){
   const folder=path.join(CORPUS,'dev',site.siteId,p.pageId),priorFile=path.join(CORPUS,'archive/dev-references-v2-2026-11-21',p.pageId+'.json');
   const [current,prior]=await Promise.all([fs.readFile(path.join(folder,'reference.json')),fs.readFile(priorFile)]);
   const c=counts(JSON.parse(current)),b=counts(JSON.parse(prior)),check=lint.results.find(r=>r.pageId===p.pageId);
   if(!check?.pass||check.referenceSha256!==hash(current))throw Error('stale or failing final reference '+p.pageId);
   if(hash(prior)!==hash(current))changed++;
   outside+=check.contentOutsideDom.count;
   for(const section of Object.keys(after))for(const measure of ['units','characters']){after[section][measure]+=c[section][measure];before[section][measure]+=b[section][measure];}
   referenceArchives.push({pageId:p.pageId,previousReference:path.relative(CORPUS,priorFile),previousSha256:hash(prior),currentSha256:hash(current),sourceSha256:p.sha256});
  }
  sites.push({siteId:site.siteId,host:site.host,pages:site.pages.length,changedReferences:changed,changes:changes[site.siteId],before,after,contentOutsideDom:outside});
 }
 let evaluationReferenceFiles=0;
 for(const entry of await fs.readdir(path.join(CORPUS,'eval'))){
  if(!/^eval-\d+$/.test(entry))continue;
  for(let i=1;i<=5;i++)try{await fs.access(path.join(CORPUS,'eval',entry,entry+'-p'+i,'reference.json'));evaluationReferenceFiles++;}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const full=JSON.parse(await fs.readFile(path.join(CORPUS,'manifest.json'),'utf8')),sanitized=JSON.parse(await fs.readFile(path.join(ROOT,'docs/revision/corpus-manifest.json'),'utf8'));
 if(full.sites.length!==52||sanitized.sites.length!==52)throw Error('manifest site count differs');
 for(const s of full.sites){const other=sanitized.sites.find(x=>x.siteId===s.siteId);if(JSON.stringify(s.pages)!==JSON.stringify(other?.pages))throw Error('sanitized page metadata mismatch '+s.siteId);}
 const report={completedAt:new Date().toISOString(),development:{pages:lint.pages,passed:lint.passed,failed:lint.failed},evaluation:{pages:evalLint.pages,passed:evalLint.passed,failed:evalLint.failed,ruleCounts:evalLint.ruleCounts,evaluationReferenceFiles},integrity,sites,referenceArchives,restrictions:'No model API calls, reader/Readability/rule outputs, Codex reviews, commits, pushes or deployments.'};
 await fs.writeFile(path.join(ARCHIVE,'completion-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({development:report.development,evaluation:report.evaluation,sites:sites.map(s=>({siteId:s.siteId,host:s.host,changedReferences:s.changedReferences,...s.after,contentOutsideDom:s.contentOutsideDom}))},null,2));
}
if(require.main===module)run().catch(e=>{console.error(e.stack);process.exitCode=1});
