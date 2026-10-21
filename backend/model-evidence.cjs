// Optional, untrusted analysis hints. Never used as admission or preservation evidence.
const PREFIX = 'UNTRUSTED DOM EVIDENCE (hints only; not validation):\n';
const SEPARATOR = '\nHTML DATA:\n';
const KINDS = ['primary','article','title','heading','prose','code','table','list','image','svg','math','audio','video','canvas','navigation','discussion'];
function normalizeEvidence(value) {
    if (value === undefined || value === null) return null;
    if (value.schemaVersion !== 1 || typeof value !== 'object') throw Error('Unsupported model evidence');
    const counts = object => Object.fromEntries(KINDS.filter(key => Number.isSafeInteger(object?.[key]) && object[key] >= 0 && object[key] <= 10000000).map(key => [key, object[key]]));
    const evidence = { schemaVersion: 1, scope: 'eligible-full-dom-hints-not-validation', sourceCounts: counts(value.sourceCounts), representedCounts: counts(value.representedCounts),
        locators: [], limitations: ['bounded-component-and-locator-witnesses', 'omitted-components-are-not-empty'] };
    for (const item of Array.isArray(value.locators) ? value.locators.slice(0, 32) : []) {
        if (typeof item?.selector !== 'string' || item.selector.length > 240 || !item.selector.trim()) continue;
        if (![item.sourceMatches,item.representedMatches].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 10000000)) continue;
        const locator = { selector: item.selector, sourceMatches: item.sourceMatches, representedMatches: item.representedMatches };
        evidence.locators.push(locator);
        if (JSON.stringify(evidence).length > 3000) { evidence.locators.pop(); break; }
    }
    return evidence;
}
function boundModelInput(html, value) {
    const evidence = normalizeEvidence(value);
    if (!evidence) return { html: html.slice(0, 30000), evidence: null };
    const available = 12000 - PREFIX.length - SEPARATOR.length - JSON.stringify(evidence).length;
    return { html: html.slice(0, Math.max(0, available)), evidence };
}
function modelInputText(html, value) {
    const bounded = boundModelInput(html, value);
    return bounded.evidence ? PREFIX + JSON.stringify(bounded.evidence) + SEPARATOR + bounded.html : 'HTML DATA:\n' + bounded.html;
}
module.exports = { normalizeEvidence, boundModelInput, modelInputText };
