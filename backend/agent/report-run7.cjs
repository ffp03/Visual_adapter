'use strict';
const fs=require('node:fs'),path=require('node:path');
const {Ledger,hash}=require('./ledger.cjs');
const {redact}=require('./privacy.cjs');
const BASE='workspace/revision/dev-runs/run7';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const lines=f=>fs.readFileSync(f,'utf8').split('\n').filter(Boolean).map(JSON.parse);
const policies=['P0','P1','P4-off','P4-on','P4-local','P3'];
const pct=n=>(100*n).toFixed(2),signed=n=>(n>=0?'+':'')+(100*n).toFixed(2);
const ci=v=>`${signed(v.estimate)} [${signed(v.low)}, ${signed(v.high)}]`;
function build(){
 const pointer=read(BASE+'/final.json'),context=read(pointer.contextFile),state=read(pointer.iterationFile),scorePointer=read(BASE+'/final-score.json'),summary=read(path.join(scorePointer.directory,'summary.json'));
 const rows=lines(path.join(scorePointer.directory,'rows.jsonl')),confirm=read(BASE+'/confirmation-score.json'),repeat=read(BASE+'/confirmation-comparison.json'),plan=read(BASE+'/confirmation-plan.json');
 const ledger=new Ledger(),totals=ledger.totals(),requests=new Map();
 for(const e of ledger.entries())if(e.event==='request')requests.set(e.id,{...e,startAt:e.at});else if(requests.has(e.id))requests.set(e.id,{...requests.get(e.id),...e});
 const runRequests=[...requests.values()].filter(e=>e.startAt>='2026-11-21T06:56:31Z');
 const accounting={global:totals,before:context.ledgerBefore,run:{requests:runRequests.length,paid:runRequests.filter(e=>e.paid).length,
  local:runRequests.filter(e=>e.provider==='pc11').length,dollars:totals.dollars-context.ledgerBefore.dollars,
  promptTokens:totals.promptTokens-context.ledgerBefore.promptTokens,completionTokens:totals.completionTokens-context.ledgerBefore.completionTokens,cachedTokens:totals.cachedTokens-context.ledgerBefore.cachedTokens,
  outcomes:runRequests.reduce((a,e)=>(a[e.outcome]=(a[e.outcome]||0)+1,a),{}),unreportedUsage:runRequests.filter(e=>!e.tokens).length},
  providers:Object.fromEntries(['deepseek','pc11'].map(provider=>{const selected=runRequests.filter(e=>e.provider===provider);return[provider,{requests:selected.length,providerErrors:selected.filter(e=>e.outcome==='provider-error').length,interrupted:selected.filter(e=>e.outcome==='interrupted').length,unknownUsage:selected.filter(e=>!e.tokens).length}];}))};
 const points=lines(path.join(context.directory,'progress.jsonl')),iterations=points.map(p=>{
  const s=read(path.join(p.scoreboard,'summary.json')).policies['P4-off'],config=read(path.join(context.directory,'iteration-'+p.iteration,'iteration.json'));
  return {index:p.iteration,promptHash:config.promptHash,clean:s.measures.cleanPass.estimate,recall:s.measures.contentRecall.estimate,noise:s.measures.noiseLeakage.estimate,
   requests:s.accounting.modelRequests,ownApplications:36-s.fallbacks,improved:p.improved,nonImproving:p.nonImproving,scoreboard:p.scoreboard};
 });
 const metrics=Object.fromEntries(policies.map(p=>[p,summary.policies[p].measures]));
 const targets=['P4-off','P4-on','P4-local'].filter(p=>['P0','P1'].every(b=>metrics[p].cleanPass.estimate>metrics[b].cleanPass.estimate&&metrics[p].noiseLeakage.estimate<metrics[b].noiseLeakage.estimate&&metrics[p].contentRecall.estimate>=metrics[b].contentRecall.estimate));
 const selected=read(path.join(context.directory,'iteration-2/iteration.json')),trials={};
 for(const p of ['P4-off','P4-on','P4-local','P3'])trials[p]=lines(path.join(p==='P4-off'?selected.folder:state.folder,p+'-trials.jsonl'));
 const text=[],headings=[];
 const add=(...s)=>text.push(...s);
 const heading=(s,level=1)=>{headings.push({text:s,level});add('',s);};
 add('Visual Adapter — Run 7 capability programme', '',targets.length?'Point-estimate target reached by '+targets.join(', ')+'.':'Target not reached: no P4 variant beat both P0 and P1 on clean pass and noise leakage while retaining baseline recall.');
 add('Thinking-on P4 was strongest: 17/36 clean, 99.89% unit recall, 25.07% noise leakage. P1 noise leakage was 19.91%. Its noise difference versus P1 is uncertain across twelve sites (see paired intervals).');
 heading('Protocol and cohort');
 add('60 valid development captures, 12 sites. P4 induces one rule from p1+p2 and transfers to p3-p5; P3 is fresh on each of the 36 transfer pages. All references pass validateReference and L1–L6 under annotation guideline v2. No pages were skipped. Hacker News p3-p5 are title-only. No evaluation pages or corpus files were changed.',
 'P0 and P1 were rerun on all 60 current captures in a fresh cache. The primary scoreboard uses the 36 transfer pages. P0 has one counted 120-second timeout (W3C p4). Every model uses the same selected prompt, retained view code, six-turn ceiling and bounded history. Local Qwen uses thinking off and its fixed private endpoint; no local service-start error occurred.',
 'Tuning was restricted to P4 thinking off after the watchdog resume. Thinking-on, local and P3 each ran once with the final prompt/views. The interrupted initial mixed-model pilot is preserved and fully charged, but is excluded from the final quality comparison. No model output was repaired or replaced with a better stochastic retry. Gate failure delivers the unchanged P0 fallback.');
 heading('Overall scoreboard');
 add('C = clean pages/36; R = unit recall; N = noise-unit leakage. No-fallback clean is also shown; higher R/C and lower N are better.');
 for(const p of policies){const s=summary.policies[p],m=s.measures;add(`${p}: C ${Math.round(36*m.cleanPass.estimate)}/36 (${pct(m.cleanPass.estimate)}%); R ${pct(m.contentRecall.estimate)}%; N ${pct(m.noiseLeakage.estimate)}%; own clean ${Math.round(36*m.noFallbackPass.estimate)}/36; fallbacks ${s.fallbacks}/36.`);}
 heading('Paired site-clustered differences');
 add('Policy minus baseline, in percentage points, with 95% site-clustered bootstrap intervals (10,000 resamples, seed 20261120, 36 matched pages/12 sites). Negative noise differences are better.');
 for(const p of ['P4-off','P4-on','P4-local'])for(const b of ['P0','P1']){const c=summary.comparisons.find(c=>c.policyA===p&&c.policyB===b);add(`${p} versus ${b}: clean ${ci(c.measures.cleanPass)}; recall ${ci(c.measures.contentRecall)}; noise ${ci(c.measures.noiseLeakage)}.`);}
 heading('Per-site scoreboard and diagnosis');
 const code=reason=>[...new Set((reason||'').match(/G[1-6]:[a-z-]+|use-time:[a-z-]+|applicability:[a-z-]+|family:[a-z-]+|provider-error|runtime-timeout|final-turn-must-submit|invalid-final-rule/g)||[])].join(', ')||reason;
 for(const site of context.sites){
  heading(site.id+' — '+site.host,2);
  for(const p of policies){const s=summary.bySite[site.host].policies[p],m=s.measures,own=rows.filter(r=>r.site===site.host&&r.policy===p&&r.ok&&!r.fallback).length;add(`${p}: clean ${Math.round(3*m.cleanPass.estimate)}/3; recall ${pct(m.contentRecall.estimate)}%; noise ${pct(m.noiseLeakage.estimate)}%; successful own application ${own}/3.`);}
  for(const p of ['P4-off','P4-on','P4-local','P3']){
   const t=trials[p].filter(t=>t.site===site.host),r=rows.filter(r=>r.site===site.host&&r.policy===p),s=summary.bySite[site.host].policies[p];
   const reasons=[...new Set([...t.flatMap(t=>t.reasons||[]),...r.filter(r=>!r.ok).map(r=>r.reason||'')].map(code).filter(Boolean))];
   add(`${p} diagnosis: ${t.filter(t=>t.admitted).length}/${t.length} induction attempts admitted; turns ${t.map(t=>t.turns).join('/')}; clean-failure causes (overlapping): noise ${s.cleanFailureBreakdown.noise}, recall ${s.cleanFailureBreakdown.recall}, title ${s.cleanFailureBreakdown.title}, order ${s.cleanFailureBreakdown.order}. ${reasons.length?'Declines: '+reasons.join('; '):'No own-rule decline.'}`);
  }
 }
 heading('Iteration log and retained changes');
 add('The initial pilot was interrupted by a coordinator watchdog, not an agent-requested retry. Three started-without-result entries were appended as counted interrupted failures, including the 07:20:13 request; no charges were erased. Pending returned to zero before resumption.');
 for(let i=0;i<iterations.length;i++){const r=iterations[i],previous=iterations[i-1],change=r.index===2?'Observed source-selector catalog and zero-match alternatives; preserve full article metadata; avoid optional singleton transfer assumptions.':'Title-bearing markers and optional-singleton warnings; stronger instruction to submit an accepted preview unchanged.';
  add(`Iteration ${r.index}: ${change}`,`Prompt SHA-256 ${r.promptHash}`,`36-page scores: clean ${pct(r.clean)}%; recall ${pct(r.recall)}%; noise ${pct(r.noise)}%; own applications ${r.ownApplications}/36; ${r.requests} paid calls.`,previous?`Delta versus iteration ${previous.index}: clean ${signed(r.clean-previous.clean)} pp; recall ${signed(r.recall-previous.recall)} pp; noise ${signed(r.noise-previous.noise)} pp.`:'This was the first complete resumed P4 configuration; it traded higher clean pass for worse noise than P1.',`Consecutive non-improving flag: ${r.nonImproving}.`);}
 add('Tuning stopped at two consecutive non-improving scoreboards under the recorded joint clean/noise/no-recall-regression criterion. Iteration 2 was retained. Iteration 3 improved admission (36/36 versus 21/36) and reduced calls (36 versus 55), but worsened clean pass and noise. Its source and integration test are archived with that discarded configuration; the retained suite passes 76/76.');
 heading('Confirmation repeatability check');
 const original=repeat.original.policies['P4-off'].measures,repeated=repeat.repeated.policies['P4-off-confirm'].measures;
 add(`Five sites were preselected by SHA-256 of a fixed seed and site ID before final scoring: ${plan.sites.map(s=>s.host).join(', ')}. Same selected prompt/views, new induction runs, 15 transfer pages; ${confirm.paidRequests} paid calls of the 30 reserved. This checks stochastic repeatability on development data and is not unseen evaluation.`,
 `Original selected configuration on this subset: clean ${pct(original.cleanPass.estimate)}%; recall ${pct(original.contentRecall.estimate)}%; noise ${pct(original.noiseLeakage.estimate)}%.`,
 `Repeated run: clean ${pct(repeated.cleanPass.estimate)}%; recall ${pct(repeated.contentRecall.estimate)}%; noise ${pct(repeated.noiseLeakage.estimate)}%.`,
 `Repeat minus original: clean ${ci(repeat.comparison.measures.cleanPass)} pp; recall ${ci(repeat.comparison.measures.contentRecall)} pp; noise ${ci(repeat.comparison.measures.noiseLeakage)} pp.`,
 'The repeat omitted the required Product Description and Product Information headings on all three Books to Scrape transfer pages (5/7 required units retained per page). The model excluded div.sub-header. These short headings do not enter the current substantive-block inventory, so admission did not prevent the loss. The repeated outputs were not substituted into the main comparison.');
 heading('Accounting');
 for(const p of ['P4-off','P4-on','P4-local','P3']){const a=summary.policies[p].accounting,unknown=rows.filter(r=>r.policy===p).reduce((n,r)=>n+(r.usageUnknown||0),0),usage=unknown===a.modelRequests?'unreported':`${a.promptTokens}/${a.completionTokens}/${a.cachedTokens}`;add(`${p} final comparison: ${a.modelRequests} requests; reported prompt/completion/cached tokens ${usage}; ${unknown} requests without usage; cost estimate $${a.costEstimate.toFixed(6)}.`);}
 add('Local endpoint token usage was not reported for any of its 64 final-comparison requests; zero token sums are not zero consumption. Local requests are unpaid, and local compute cost is not estimated. Cached tokens are part of prompt tokens.',
 `Study ledger across all runs: ${totals.requests} model requests; ${totals.paidRequests}/700 paid development requests; ${totals.dollars.toFixed(6)} estimated USD of the $5 cap; pending ${totals.pending}; budget refusals ${totals.budgetRefusals}. The global paid cap remains 2,000. ${700-totals.devRequests} development requests remain.`,
 `Run 7 including interrupted pilot, tuning, final comparisons and confirmation: ${accounting.run.requests} requests (${accounting.run.paid} paid DeepSeek, ${accounting.run.local} unpaid local); $${accounting.run.dollars.toFixed(6)} estimated USD. Reported prompt/completion/cached tokens ${accounting.run.promptTokens}/${accounting.run.completionTokens}/${accounting.run.cachedTokens}. ${accounting.run.unreportedUsage} requests have no usage report. No new Codex call occurred.`,
 `Run-7 request-level outcomes: ${JSON.stringify(accounting.run.outcomes)}. Rejected previews/invalid actions are counted requests, not dropped examples. These are distinct from final page declines. Unknown paid usage is conservatively cost-reserved. The ledger preserves all attempts, while comparison rows charge shared P4 induction once, on the first transfer row.`);
 heading('What helped and what did not');
 add('Thinking-on P4 gave the strongest final quality: all 36 applications admitted, 17 clean. The source-selector catalog grounded proposals in selectors actually observed on both induction pages, but did not eliminate local-model errors. Full article-header preservation avoids losing author/date context. These combined prompt/view observations are not isolated causal estimates.',
 'Immediate unchanged-preview submission improved admission and reduced calls, but retained more boilerplate and lowered the scored clean-pass rate. It was discarded. Optional non-multiple regions remain fragile because they still require exactly one match on every later page.',
 'Python provides a concrete gate limitation: excluding its source-promotional card keeps gold recall at 100% and cuts noise from 20% to 0%, but G4/G6 reject it. Its 84–86-character URL paragraph is inside an anchor yet measured at link density zero after detachment. Gate semantics and thresholds were left unchanged. BBC broad-link exclusions also remove annotated required units, so that rejection is justified.',
 'Short product headings are a second preservation gap, exposed by confirmation. A passed reference-free gate is not a guarantee of gold-unit completeness. W3C remains computationally expensive, but the measured application case improved from more than 326 seconds unfinished to 49.5 seconds after sanitizing the body once and reusing subtree measurements. Tests compare text/link/sidebar metrics with the previous algorithm and verify bounded clone counts.',
 'P1 often omits titles (21/36 pages) and has lower recall, which contributes to the clean-pass difference. One P0 timeout contributes to the P4 recall advantage. The primary analysis retains that failure, as declared. The on-versus-P1 noise confidence interval spans zero; its direction remains uncertain with twelve sites.');
 heading('Admitted P4 exclusions');
 for(const p of ['P4-off','P4-on','P4-local'])for(const t of trials[p].filter(t=>t.admitted)){add(`${t.site} / ${p}:`);if(!t.excluded?.length)add('  none');for(const e of t.excluded||[])add(`  ${e.selector} [matches ${e.counts.join('/')}]: ${redact(e.firstCue||'').slice(0,60)}`);}
 heading('Frozen configuration and evidence');
 add('Final system prompt SHA-256: '+state.promptHash,'Final view-components SHA-256: '+state.viewsHash,'Gate implementation SHA-256: '+state.gateHash,
 'No gate thresholds, corpus files, evaluation pages, frozen P0/core, package.json, commits, pushes or deployments were changed. Only the authorized v3 performance implementation and agent/tests were changed. All final comparators use the selected prompt and retained source-view implementation.',
 'Primary scoreboard: '+scorePointer.directory,'Confirmation scoreboard: '+confirm.directory,'Working evidence: '+BASE,'These are development-tuned results. No evaluation run was started.');
 const report={title:'Visual Adapter — Run 7 capability programme',text:text.join('\n')+'\n',headings};
 const data={targets,metrics,bySite:summary.bySite,comparisons:summary.comparisons,iterations,accounting,confirmation:{...confirm,...repeat},promptHash:state.promptHash,viewsHash:state.viewsHash,gateHash:state.gateHash,scoreDirectory:scorePointer.directory};
 fs.writeFileSync(BASE+'/report.json',JSON.stringify(report,null,2),{flag:'wx'});fs.writeFileSync(BASE+'/report-data.json',JSON.stringify(data,null,2),{flag:'wx'});
 console.log(JSON.stringify({targets,promptHash:state.promptHash,reportCharacters:report.text.length,accounting}));
 console.log('Site | '+policies.join(' | '));
 for(const site of context.sites)console.log(site.host+' | '+policies.map(p=>{const m=summary.bySite[site.host].policies[p].measures;return `${Math.round(3*m.cleanPass.estimate)}/3;${pct(m.contentRecall.estimate)};${pct(m.noiseLeakage.estimate)}`;}).join(' | '));
}
if(require.main===module)build();
module.exports={build};
