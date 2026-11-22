'use strict';
const v3 = require('../../extension/procedure-v3.js');
// Observations only: these candidates never rewrite a submitted rule.
function catalog(view, index, seeds = {}, budget = { remaining: 12000 }) {
    const doc = view.pages[index], map = view.maps[index], nodes = new Set();
    for (const node of v3.matches(doc, 'main,article,[role="main"],h1')) nodes.add(node);
    for (const baseline of Object.values(seeds)) for (const selector of baseline.sourceContainers || [])
        for (const node of v3.matches(doc, selector)) nodes.add(node);
    nodes.add(doc.body);
    const result = [], used = new Set();
    for (const node of nodes) {
        if (!map.allowed.has(node)) continue;
        const hints = [...view.selectorHints(node), node.tagName.toLowerCase()];
        for (const selector of hints) {
            if (used.has(selector) || !v3.validSelector(selector, doc)) continue;
            const counts = view.pages.map(d => v3.matches(d, selector).length);
            if (counts.some(n => n !== 1)) continue;
            used.add(selector);
            result.push({ selector, counts, node: map.ids.get(node), tag: node.tagName.toLowerCase(),
                anchorEligible: v3.identityAnchor(selector), cue: view.cue(map.measure(node).text, budget) });
            break;
        }
        if (result.length >= 12) break;
    }
    view.selectorCatalogPages ||= [];
    view.selectorCatalogPages[index] = result;
    return result;
}
function alternatives(view, index, selector) {
    const terms = value => new Set(value.match(/[A-Za-z][A-Za-z0-9_-]*/g) || []), wanted = terms(selector);
    const candidates = view.selectorCatalogPages?.[index] || catalog(view, index);
    return candidates.map(c => ({ ...c, similarity: [...terms(c.selector)].filter(t => wanted.has(t)).length }))
        .sort((a, b) => b.similarity - a.similarity).slice(0, 3).map(({ similarity, ...c }) => c);
}
module.exports = { catalog, alternatives };
