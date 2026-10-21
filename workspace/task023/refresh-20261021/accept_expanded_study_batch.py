from pathlib import Path
import hashlib,json,sys
b=Path(__file__).parent;r=b.parents[2];base=b/'final-study-v1';n=int(sys.argv[1]);expectedHash=sys.argv[2]
read=lambda p:json.loads(p.read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
plan=read(base/'remaining-batch-plan.json');spec=next(x for x in plan['batches']if x['batch']==n);folder=base/('scored-batch'+str(n)+'-v1');file=folder/'summary.json'
assert sha(file)==expectedHash;summary=read(file);assert summary['selectedIds']==spec['selectedIds']and summary['rootCleanupAccepted']and len(summary['rows'])==24
status=base/'contracts'/('batch'+str(n)+'-v1.json.root-status.json');assert sha(status)==summary['rootStatusSha256'];s=read(status)
assert s['exitCode']==0 and s['cleanup']['rootExited']and s['cleanup']['activeProcesses']==0
checked=0
for c in summary['checkpoints']:
 sub=folder/c['id'];checkpoint=sub/'checkpoint.json';assert sha(checkpoint)==c['checkpointSha256'];cv=read(checkpoint)
 for name,h in cv['files'].items():assert sha(sub/name)==h;checked+=1
prepared=base/'prepared44-v2';manifest=read(prepared/'manifest.json');entries=[p for p in manifest['pages']if p['id']in spec['selectedIds']];assert len(entries)==8
metrics=[]
for approach in ['fallback','compiled-fresh','compiled-shared']:
 rows=[v for v in summary['rows']if v['approach']==approach];assert len(rows)==8 and {x['id']for x in rows}==set(spec['selectedIds'])
 assert all(v['measurementComplete']and not v.get('measurementError')for v in rows)
 reading=sum(v['score']['complete']for v in rows);nf={v['id']:bool(v['score']['complete']and v['delivery']['noFallback']and v['delivery']['ruleApplied']and v['delivery']['procedureDelivered'])for v in rows}
 for v in rows:assert nf[v['id']]==v['score']['noFallbackPass']
 sites={p['site']for p in entries};siteReading=sum(all(next(v for v in rows if v['id']==p['id'])['score']['complete']for p in entries if p['site']==site)for site in sites);siteNF=sum(all(nf[p['id']]for p in entries if p['site']==site)for site in sites)
 metrics.append({'approach':approach,'strictReadingPages':reading,'noFallbackPages':sum(nf.values()),'strictReadingSitePairs':siteReading,'noFallbackSitePairs':siteNF})
for p in entries:
 rows=[v for v in summary['rows']if v['id']==p['id']];m=read(prepared/p['id']/'metadata.json')
 assert all(v['sourceSha256']==p['sourceSha256']and v['referenceSha256']==p['referenceSha256']and v['candidateProvenance']=='study-results'and v['sourceEligibilityFailure']==(not m['generationEligible'])for v in rows)
 shared=next(v for v in rows if v['approach']=='compiled-shared');assert shared['compilation']['id']==p['seedId']
 seed=next(v for v in summary['rows']if v['id']==p['seedId']and v['approach']=='compiled-shared');assert shared['procedureSha256']==seed['procedureSha256']
audit={'accepted':True,'batch':n,'pages':8,'genuinePolicyRows':24,'checkpointArtifacts':checked,'metrics':metrics,'summarySha256':sha(file),'methodChanged':False,'fixedDenominatorKept':True}
out=base/('batch'+str(n)+'-parent-quality-acceptance.json')
with out.open('x',encoding='utf-8')as f:json.dump(audit,f,indent=2)
print(json.dumps(audit))
