// Pure reporting guard; it never changes reading output, annotations or rules.
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
        group.set(row.id, { complete, noFallback, measurementComplete: row.measurementComplete !== false, measurementError: false });
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
    const passedPages = metrics['compiled-shared'].noFallbackPages;
    return { experimentComplete, paperUpdateAllowed: experimentComplete && passedPages * 5 > 44 * 4,
        criterion: 'Shared compiled-rule all-check page success without runtime fallback, strictly greater than80percent; all44 pages completed for all3 approaches',
        requiredPassingPages: 36, passedPages, pageDenominator: 44, successRate: passedPages / 44, metrics };
}
module.exports = { paperGate };
