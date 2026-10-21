from pathlib import Path
from collections import Counter
import hashlib,json,math

def validate_manifest_pages(pages):
    assert len(pages) == 44, 'Expected exactly 44 pages'
    ids = [page['id'] for page in pages]
    assert all(isinstance(ident, str) and ident for ident in ids), 'Invalid page ID'
    assert len(set(ids)) == 44, 'Duplicate page ID'
    sites = Counter(page['site'] for page in pages)
    assert len(sites) == 22 and all(count == 2 for count in sites.values()), 'Expected 22 two-page sites'


def index_ledger_records(records, kind):
    """Reject repeated attempt identities before any record can be overwritten."""
    indexed = {}
    for file, record in records:
        ident = record['id']
        assert ident not in indexed, f'Duplicate {kind} ID: {ident}'
        indexed[ident] = (file, record)
    return indexed


def validate_row_binding(row, page):
    assert row['site'] == page['site'], 'Row site differs from manifest'
    assert row['sourceSha256'] == page['sourceSha256'] and row['referenceSha256'] == page['referenceSha256']


def synthetic_test():
    from copy import deepcopy
    pages = [dict(id=f'page-{i}', site=i // 2) for i in range(44)]
    validate_manifest_pages(pages)
    invalid = []
    duplicate = deepcopy(pages); duplicate[1]['id'] = duplicate[0]['id']; invalid.append(duplicate)
    uneven = deepcopy(pages); uneven[0]['site'] = uneven[2]['site']; invalid.append(uneven)
    invalid.extend((pages[:-1], pages + [dict(id='extra', site=22)]))
    for bad in invalid:
        try:
            validate_manifest_pages(bad)
        except AssertionError:
            pass
        else:
            raise AssertionError('Invalid manifest accepted')
    for kind in ('reservation', 'outcome'):
        records = [('first.json', {'id': 'one', 'estimatedUsd': 0.1}),
                   ('second.json', {'id': 'two', 'estimatedUsd': 0.2})]
        indexed = index_ledger_records(records, kind)
        assert list(indexed) == ['one', 'two'] and indexed['one'] == records[0]
        for repeated in ({'id': 'one', 'estimatedUsd': 0.1}, {'id': 'one', 'estimatedUsd': 0.9}):
            try:
                index_ledger_records(records + [('third.json', repeated)], kind)
            except AssertionError:
                pass
            else:
                raise AssertionError('Duplicate ledger ID accepted')
    page = dict(site=7, sourceSha256='a' * 64, referenceSha256='b' * 64)
    validate_row_binding(dict(page), page)
    for field in ('site', 'sourceSha256', 'referenceSha256'):
        bad = dict(page); bad[field] = 8 if field == 'site' else 'c' * 64
        try:
            validate_row_binding(bad, page)
        except AssertionError:
            pass
        else:
            raise AssertionError('Invalid row binding accepted')
    print(json.dumps({'synthetic_manifest_cases': 5, 'synthetic_ledger_cases': 6,
                      'synthetic_row_binding_cases': 4,
                      'passed': True, 'study_reads': 0, 'writes': 0}))


def main():
    b=Path(__file__).parent;r=b.parents[2];base=b/'final-study-v1';prepared=base/'prepared44-v2';live=b/'fresh-development-pilot/live-v2'
    read=lambda p:json.loads(p.read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    manifest=read(prepared/'manifest.json');validate_manifest_pages(manifest['pages'])
    plan=read(prepared/'study-plan.json');assert sha(prepared/'study-plan.json')=='7639c2bdd393b49418c8589fe76dbb4fe09bd778e9926b220eea4ceb130ee3ac'
    audits=[base/'first4-parent-quality-acceptance.json']+[base/('batch'+str(i)+'-parent-quality-acceptance.json')for i in range(1,6)]
    folders=[base/'scored-first4-v2']+[base/('scored-batch'+str(i)+'-v1')for i in range(1,6)]
    rows=[];batches=[];artifactChecks=0
    for file,folder in zip(audits,folders):
     a=read(file);sfile=folder/'summary.json';assert a['accepted']and sha(sfile)==a['summarySha256'];s=read(sfile)
     assert s['rootCleanupAccepted'];rows.extend(s['rows']);artifactChecks+=a['checkpointArtifacts']
     batches.append({'summaryFile':str(sfile.relative_to(r)).replace('\\','/'),'summarySha256':sha(sfile),'parentAcceptanceSha256':sha(file),'genuineRows':a['genuinePolicyRows'],'readingPages':a['pages']})
    assert len(rows)==132
    metrics=[];portableRows=[];freshAdjusted=0;seedAdjusted=0;adjustmentKinds=Counter()
    for approach in ['fallback','compiled-fresh','compiled-shared']:
     rr=[v for v in rows if v['approach']==approach];assert len(rr)==44 and {v['id']for v in rr}=={p['id']for p in manifest['pages']}
     assert all(v['measurementComplete']and not v.get('measurementError')and v['candidateProvenance']=='study-results'for v in rr)
     pageRead={};pageNF={}
     for v in rr:
      score=v['score'];complete=len(score['targets'])>=3 and all(x['retained']for x in score['targets'])and all(not x['retained']for x in score['noise'])and all(x['retained']for x in score['links'])and all(x['retained']for x in score['images'])and score['relativeUrls']==0
      nf=complete and v['delivery']['noFallback']and v['delivery']['ruleApplied']and v['delivery']['procedureDelivered'];assert complete==score['complete']and bool(nf)==score['noFallbackPass'];pageRead[v['id']]=complete;pageNF[v['id']]=bool(nf)
      p=next(p for p in manifest['pages']if p['id']==v['id']);validate_row_binding(v,p)
      proc=(v.get('compilation')or{}).get('procedure')or{}
      if approach=='compiled-fresh'and proc.get('compilationAdjusted'):
       freshAdjusted+=1;adjustmentKinds.update(x['kind']for x in proc.get('adjustments',[]))
      if approach=='compiled-shared'and p['id']==p['seedId']and proc.get('compilationAdjusted'):seedAdjusted+=1
      portableRows.append({'id':v['id'],'site':v['site'],'approach':approach,'readingPass':complete,'noFallbackPass':bool(nf),'generationIneligible':v['sourceEligibilityFailure'],'targetCount':len(score['targets']),'targetsMissing':sum(not x['retained']for x in score['targets']),'linkChecks':len(score['links']),'linksMissing':sum(not x['retained']for x in score['links']),'imageChecks':len(score['images']),'imagesMissing':sum(not x['retained']for x in score['images']),'noiseChecks':len(score['noise']),'noiseRetained':sum(x['retained']for x in score['noise']),'unresolvedRelativeUrls':score['relativeUrls'],'sourceSha256':v['sourceSha256'],'referenceSha256':v['referenceSha256'],'candidateSha256':v.get('candidateSha256'),'procedureSha256':v['procedureSha256'],'compilationAdjusted':bool(proc.get('compilationAdjusted'))})
     sites={p['site']for p in manifest['pages']};siteRead=sum(all(pageRead[p['id']]for p in manifest['pages']if p['site']==s)for s in sites);siteNF=sum(all(pageNF[p['id']]for p in manifest['pages']if p['site']==s)for s in sites)
     metrics.append({'approach':approach,'readingPassPages':sum(pageRead.values()),'readingPassSites':siteRead,'noFallbackPassPages':sum(pageNF.values()),'noFallbackPassSites':siteNF,'pages':44,'sites':22,'targetsTotal':sum(len(v['score']['targets'])for v in rr),'targetsRetained':sum(sum(x['retained']for x in v['score']['targets'])for v in rr)})
    events=index_ledger_records(((f,read(f))for f in(live/'events').glob('*-b-outcome.json')), 'outcome')
    reservations=index_ledger_records(((f,read(f))for f in(live/'events').glob('*-a-reserved.json')), 'reservation')
    assert len(events)==len(reservations)==43 and len(plan['records'])==39
    requests=[];prompt=completion=hits=0;estimated=0.;aliases=set();seedIds={p['id']for p in manifest['pages']if p['id']==p['seedId']};seedCalls=0;seedEstimate=0.
    for record in plan['records']:
     ident=record['id'];ef,e=events[ident];sf,s=reservations[ident];resultFile=live/ident/'provider-result.json';raw=live/ident/'raw-response.json'
     assert e['success']and e['estimatedUsd']is not None and s['scope']=='unseen-final'and s['planSha256']==sha(prepared/'study-plan.json')and s['approvalSha256']==sha(prepared/'parent-approval.json')and s['requestFileSha256']==record['requestSha256']
     assert sha(resultFile)==e['resultSha256']and sha(raw)==e['rawResponseSha256']and sha(r/record['requestFile'])==record['requestSha256']and sha(r/record['argumentsFile'])==record['argumentsSha256']
     result=read(resultFile);u=result['usage'];p,o,h=u['prompt_tokens'],u['completion_tokens'],u.get('prompt_cache_hit_tokens',0);assert 0<=h<=p
     cost=((p-h)*.30+h*.006+o*1.20)/1000000;assert math.isclose(cost,e['estimatedUsd'],abs_tol=1e-12)
     prompt+=p;completion+=o;hits+=h;estimated+=cost;aliases.add(result['servedModel']);pageId=ident.removeprefix('unseen-final-')
     if pageId in seedIds:seedCalls+=1;seedEstimate+=cost
     requests.append({'id':ident,'pageId':pageId,'requestId':e.get('requestId'),'servedModel':result['servedModel'],'promptTokens':p,'completionTokens':o,'cachedPromptTokens':h,'peakListEstimateUsd':cost,'requestFileSha256':record['requestSha256'],'reservationSha256':sha(sf),'outcomeSha256':sha(ef),'rawResponseSha256':sha(raw),'resultSha256':sha(resultFile)})
    assert seedCalls==19
    decoder=read(prepared/'parent-validation-decoder-audit.json');assert decoder['accepted']and decoder['pages']==44 and decoder['completeContexts']==44
    retained=read(b/'retained-regression-v4/full32-parent-acceptance.json');assert retained['accepted']and retained['pages']==32
    result={'schemaVersion':1,'status':'completed-parent-accepted-frozen-reading-evaluation','development':{'pages':34,'sites':17,'modelFineTuned':False},'unseen':{'pages':44,'sites':22,'genuinePolicyMeasurements':132,'measurementErrors':0,'metrics':metrics,'completeSourcePairs':22,'allPairsSameHostname':True,'categories':read(base/'corpus-profile.json')['categoryPairs']},'generation':{'actualRequests':39,'successfulRequests':39,'failedRequests':0,'pendingRequests':0,'promptTokens':prompt,'completionTokens':completion,'cachedPromptTokens':hits,'peakListEstimateUsd':estimated,'peakUncachedUpperEstimateUsd':(prompt*.30+completion*1.20)/1000000,'invoiceUsd':None,'servedModelAliases':sorted(aliases),'perPagePolicyDemand':39,'fixedSeedPolicyDemand':19,'seedSubsetPeakListEstimateUsd':seedEstimate,'policyDemandIsCounterfactual':True,'globalAuthorizedCallCap':80,'globalAuthorizedBudgetUsd':1,'globalCompletedCalls':43,'globalKnownPeakListEstimateUsd':sum(v[1].get('estimatedUsd')or 0 for v in events.values())},'inputReadiness':{'completeContexts':44,'generationEligiblePages':39,'generationIneligiblePages':5,'compressedContexts':decoder['compressedContexts'],'maxDecodedValidationBytes':decoder['maxDecodedBytes'],'maxModelCharacters':decoder['maxModelCharacters']},'compiler':{'adjustedFreshPages':freshAdjusted,'adjustedSeedArtifacts':seedAdjusted,'freshAdjustmentKinds':dict(adjustmentKinds)},'retainedRegression':retained,'pilot':read(live/'pilot-assessment.json'),'provenance':{'studyPlanSha256':sha(prepared/'study-plan.json'),'approvalSha256':sha(prepared/'parent-approval.json'),'normalizedManifestSha256':sha(base/'unseen44-normalized-manifest.json'),'scorerSha256':'76282ffdac9e3030fef6300c2c3081d0c79690488ca9472dd9b3a24b935034c7','parentVerifiedCheckpointArtifacts':artifactChecks,'productionHashes':read(prepared/'freeze.json')['production'],'batchBindings':batches},'rows':portableRows,'requests':requests,'scope':'Reading-task engineering checks; fixed first-page transfer; controlled admission evidence separate; no comparative timing, usability, universal accessibility or total operating-cost claim.'}
    out=base/'final-parent-portable-summary.json'
    with out.open('x',encoding='utf-8')as f:json.dump(result,f,indent=2)
    print(json.dumps({'accepted':True,'pages':44,'sites':22,'genuinePolicyMeasurements':132,'metrics':metrics,'providerRequests':39,'promptTokens':prompt,'completionTokens':completion,'peakListEstimateUsd':estimated,'sharedSeedDemand':seedCalls,'checkpointArtifacts':artifactChecks,'summaryFile':str(out),'summarySha256':sha(out)}))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(); parser.add_argument('--synthetic-test', action='store_true')
    args = parser.parse_args()
    synthetic_test() if args.synthetic_test else main()
