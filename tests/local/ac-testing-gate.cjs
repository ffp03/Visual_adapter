// Pure reporting guard; it never changes reading output, annotations or rules.
const BASELINE=Object.freeze({sharedNoFallbackPages:32,sharedNoFallbackSites:14,sharedReadingPages:40,sharedReadingSites:20,summarySha256:'e2d2f8e5c18b72501910327d51a7f96586c90b140bbb82f32f2e5dae2da11573'});
const approaches = ['fallback', 'compiled-fresh', 'compiled-shared'];
function paperGate(rows, pages) {
    if (!Array.isArray(pages) || pages.length !== 44 || new Set(pages.map(p => p.id)).size !== 44) throw Error('Expected fixed44 page identities');
    const identities = new Map(pages.map(page => [page.id, page])), sites = new Map();
    for (const page of pages) {
        if (![1, 2].includes(page.position)) throw Error('Invalid seed/transfer position');
        if (!sites.has(page.site)) sites.set(page.site, new Set());
        if (sites.get(page.site).has(page.position)) throw Error('Duplicate site position');
        sites.get(page.site).add(page.position);
    }
    if (sites.size !== 22 || [...sites.values()].some(positions => positions.size !== 2)) throw Error('Expected22 two-page site pairs');
    const measured = new Map(approaches.map(approach => [approach, new Map()]));
    for (const row of rows) {
        const page = identities.get(row.id), group = measured.get(row.approach);
        if (!page || !group || page.site !== row.site || page.position !== row.position) throw Error('Result identity/pair mismatch');
        if (group.has(row.id)) throw Error('Duplicate result');
        const q = row.score, d = row.delivery;
        if (!q || !d || !['targets', 'noise', 'links', 'images'].every(key => Array.isArray(q[key]))) throw Error('Missing scored checks');
        if (row.measurementError) {
            if (q.complete || q.usedRule || q.noFallbackPass || d.usedRule || d.ruleApplied || d.noFallback
                || ['targets', 'noise', 'links', 'images'].some(key => q[key].length)
                || (q.total != null && q.total !== 0) || (q.retained != null && q.retained !== 0)) throw Error('Measurement error cannot claim a measured success');
            group.set(row.id, { complete: false, noFallback: false, measurementComplete: false, measurementError: true });
            continue;
        }
        if (q.total !== q.targets.length || q.retained !== q.targets.filter(t => t.retained).length) throw Error('Count/check mismatch');
        const complete = q.targets.length >= 3 && q.targets.every(t => t.retained) && q.noise.every(t => !t.retained)
            && q.links.every(t => t.retained) && q.images.every(t => t.retained) && q.relativeUrls === 0;
        if (q.complete !== complete) throw Error('Completeness predicate mismatch');
        if (q.usedRule !== d.usedRule || d.usedRule !== d.ruleApplied || d.noFallback !== d.ruleApplied) throw Error('Rule provenance mismatch');
        if (d.delivery === 'fallback' && d.ruleApplied) throw Error('Fallback cannot be relabeled');
        const noFallback = complete && d.ruleApplied && d.noFallback && d.procedureDelivered === true && !d.runtimeSupplementation && d.delivery !== 'fallback';
        if (q.noFallbackPass !== (complete && q.usedRule)) throw Error('Scorer no-fallback mismatch');
        group.set(row.id, { complete, noFallback, measurementComplete: row.measurementComplete === true, measurementError: false });
    }
    const metrics = Object.fromEntries([...measured].map(([approach, group]) => {
        const pairCount = key => [...sites.keys()].filter(site => pages.filter(page => page.site === site).every(page => group.get(page.id)?.[key])).length;
        return [approach, { pageDenominator: 44, siteDenominator: 22, recordedPages: group.size,
            measuredPages: [...group.values()].filter(row => row.measurementComplete).length,
            completePages: [...group.values()].filter(row => row.complete).length,
            noFallbackPages: [...group.values()].filter(row => row.noFallback).length,
            measurementErrors: [...group.values()].filter(row => row.measurementError).length,
            completeSites: pairCount('complete'), noFallbackSites: pairCount('noFallback') }];
    }));
    const experimentComplete = [...measured.values()].every(group => group.size === 44 && [...group.values()].every(row => row.measurementComplete));
    const shared=metrics['compiled-shared'],passedPages=shared.noFallbackPages,passedSites=shared.noFallbackSites;
    const noFallbackNonRegression=passedPages>=BASELINE.sharedNoFallbackPages&&passedSites>=BASELINE.sharedNoFallbackSites;
    const strictNoFallbackImprovement=passedPages>BASELINE.sharedNoFallbackPages||passedSites>BASELINE.sharedNoFallbackSites;
    const readingPreserved=shared.completePages>=BASELINE.sharedReadingPages&&shared.completeSites>=BASELINE.sharedReadingSites;
    return{experimentComplete,paperUpdateAllowed:experimentComplete&&noFallbackNonRegression&&strictNoFallbackImprovement&&readingPreserved,
        criterion:'All132 genuine complete observations without measurement errors; shared no-fallback pages/pairs Pareto-improve32/14, preserving shared reading40pages/20pairs',
        baseline:BASELINE,noFallbackNonRegression,strictNoFallbackImprovement,readingPreserved,passedPages,passedSites,pageDenominator:44,siteDenominator:22,successRate:passedPages/44,metrics};
}
module.exports = { paperGate, BASELINE };
