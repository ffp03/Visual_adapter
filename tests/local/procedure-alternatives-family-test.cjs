const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const core = require('../../extension/procedure-core');
const { page } = require('./harness.cjs');
const make = html => new JSDOM(html, { url: 'https://example.test/reading' });
const rule = main => ({ main, name: 'Synthetic reading procedure', exclude: [] });
const seedHTML = '<main><div id=old class=reading><h1>Seed heading</h1><p>Seed readable body.</p></div></main>';
test('seed alternatives are ordered, bounded, nonpositional and identify exactly the same seed node', () => {
    const dom = make(seedHTML), procedure = core.compile(dom.window.document, rule('#old'));
    assert.equal(procedure.compilationAdjusted, true);
    assert(procedure.adjustments.some(adjustment => adjustment.kind === 'predeclared-selector-alternatives'));
    for (const region of procedure.regions) {
        assert.equal(region.selectors[0], region.selector); assert(region.selectors.length <= 4);
        const expected = dom.window.document.querySelector(region.selector);
        for (const selector of region.selectors) {
            assert(!selector.includes('nth-')); assert.equal(core.matches(dom.window.document, selector).length, 1);
            assert.equal(core.matches(dom.window.document, selector)[0], expected); assert.notEqual(selector, 'body');
        }
    }
    dom.window.close();
});
test('missing, ambiguous and guard-failing primaries recover only through declared alternatives', () => {
    const seed = make(seedHTML), procedure = core.compile(seed.window.document, rule('#old'));
    const before = JSON.stringify(procedure);
    for (const prefix of ['', '<div id=old></div>', '<div id=old></div><div id=old></div>']) {
        const transfer = make('<main>' + prefix + '<div id=new class=reading><h1>New heading</h1><p>New readable body.</p></div></main>');
        const result = core.apply(transfer.window.document, procedure);
        assert.equal(result.accepted, true); assert.equal(result.alternativeUsed, true);
        assert(result.chosenSelectors.length && result.chosenSelectors[0] !== '#old');
        assert(result.attemptedCombinations <= 64); assert(result.html.includes('New readable body.'));
        transfer.window.close();
    }
    assert.equal(JSON.stringify(procedure), before); seed.window.close();
});
test('unique primary failure really invokes full guard before a later candidate succeeds', () => {
    const seed = make(seedHTML), procedure = core.compile(seed.window.document, rule('#old'));
    const transfer = make('<main><div id=old></div><div class=reading><h1>Transfer title</h1><p>Transfer body.</p></div></main>');
    const result = core.apply(transfer.window.document, procedure);
    assert.equal(result.accepted, true); assert.equal(result.attemptedCombinations, 2);
    assert.equal(result.alternativeUsed, true); seed.window.close(); transfer.window.close();
});
test('no first-match ambiguity, BODY substitution, malformed choices or duplicate region selection', () => {
    const seed = make(seedHTML), procedure = core.compile(seed.window.document, rule('#old'));
    const transfer = make('<main><div id=old></div><div id=old><h1>Actual title</h1><p>Actual body</p></div></main>');
    const onlyPrimary = structuredClone(procedure); delete onlyPrimary.regions[0].selectors;
    assert.equal(core.apply(transfer.window.document, onlyPrimary).accepted, false);
    const bodyAttempt = structuredClone(procedure); bodyAttempt.regions[0].selectors = ['#old', 'body'];
    assert.equal(core.apply(transfer.window.document, bodyAttempt).accepted, false);
    for (const choices of [['#old', '[broken'], ['#old', '#old'], ['#old', 'div', 'main', 'body', 'article']]) {
        const invalid = structuredClone(procedure); invalid.regions[0].selectors = choices;
        assert.equal(core.apply(seed.window.document, invalid).accepted, false);
    }
    const duplicate = structuredClone(procedure); duplicate.regions.push(structuredClone(duplicate.regions[0]));
    assert.equal(core.apply(seed.window.document, duplicate).accepted, false);
    seed.window.close(); transfer.window.close();
});
test('overlapping adversarial combinations have finite complete and visited-state budgets', () => {
    const dom = make('<main><div id=a><div id=b><div id=c><div id=d><p>Required reading</p></div></div></div></div></main>');
    const region = { selector: '#a', selectors: ['#a','#b','#c','#d'], required: true };
    const procedure = { schemaVersion: 2, regions: Array.from({ length: 6 }, () => structuredClone(region)), exclude: [], preconditions: { scope: core.descriptor(dom.window.document) } };
    const result = core.apply(dom.window.document, procedure);
    assert.equal(result.accepted, false); assert.equal(result.reason, 'selector-search-budget-exhausted');
    assert.equal(result.attemptedCombinations, 64); assert(result.visitedStates <= 64 * 6 * 4);
    dom.window.close();
});
test('content delivery exposes predeclared alternative use without calling it fallback', async () => {
    const seed = make(seedHTML), procedure = core.compile(seed.window.document, rule('#old'));
    const instance = page('<main><div id=new class=reading><h1>New title</h1><p>New body</p></div></main>', undefined, [procedure]);
    try {
        const out = await instance.extract(); assert.equal(out.usedRule, true); assert.equal(out.noFallback, true);
        assert.equal(out.alternativeUsed, true); assert(out.chosenSelectors.length); assert(out.attemptedCombinations >= 1);
        assert.equal(out.pureModelSelection, false);
    } finally { instance.close(); seed.window.close(); }
});
test('fallback retains failed selector-search diagnostics without claiming accepted selections', async () => {
    const seed = make(seedHTML), procedure = core.compile(seed.window.document, rule('#old'));
    const html = '<main><div id=old><p>Incomplete first</p></div><div class=reading><p>Incomplete second</p></div><p>Required sibling</p></main>';
    const transfer = make(html), expected = core.apply(transfer.window.document, procedure);
    assert.equal(expected.accepted, false); assert.equal(expected.attemptedCombinations, 2);
    const instance = page(html, undefined, [procedure]);
    try {
        const out = await instance.extract(); assert.equal(out.noFallback, false); assert.equal(out.usedRule, false);
        assert.equal(out.attemptedCombinations, expected.attemptedCombinations);
        assert.equal(out.rejectedProcedureSearches[0].reason, 'role-preservation-failed');
        assert.deepEqual(Array.from(out.chosenSelectors), []); assert.equal(out.alternativeUsed, false);
    } finally { instance.close(); transfer.window.close(); seed.window.close(); }
});
test('descriptor separates semantic article, collection and discussion without content/id/count/image features', () => {
    const descriptor = html => { const dom = make(html); const value = core.descriptor(dom.window.document); dom.window.close(); return value; };
    const article = descriptor('<main><article><h1>One</h1><p>Article prose</p></article></main>');
    const articleChanged = descriptor('<div><div role=main id=changed><section><article id=another><h1>Different</h1><p>New prose</p><p>More prose</p><img src="x.png"><section role=comment><p>Optional comment</p></section></article></section></div></div>');
    assert.equal(article.archetype, 'article'); assert.deepEqual(article, articleChanged);
    const collection = count => descriptor('<main>' + Array.from({ length: count }, (_, i) => '<article><h2><a href="item">Entry' + i + '</a></h2><p>Entry body</p></article>').join('') + '</main>');
    assert.equal(collection(2).archetype, 'collection'); assert.deepEqual(collection(2), collection(7)); assert.notDeepEqual(article, collection(2));
    const discussion = count => descriptor('<main>' + '<div role=comment><p>Comment text</p></div>'.repeat(count) + '</main>');
    assert.equal(discussion(1).archetype, 'discussion'); assert.deepEqual(discussion(1), discussion(8)); assert.notDeepEqual(article, discussion(2));
    const document = descriptor('<main><p>Ordinary narrative</p></main>');
    assert.equal(document.archetype, 'document');
    assert.deepEqual(document, descriptor('<main><div><span>Unwrapped ordinary narrative</span></div><div role=comment><p>Optional feedback</p></div><aside itemtype="https://schema.org/ItemList"><a href="related">Optional related link</a></aside></main>'));
    assert.deepEqual(document, descriptor('<div role=main><section><p>Different prose</p><p>Second paragraph</p><ul><li>A list item</li></ul><img src="optional.png"></section><div role=comment><p>Optional feedback</p></div><article><p>Optional related entry</p></article></div>'));
    assert.deepEqual(article, descriptor('<main><article><p>Article prose</p><aside itemtype="https://schema.org/ItemList"><ul><li><a href="x">Optional related link</a></li></ul></aside></article></main>'));
    assert.equal(descriptor('<div><span>Unmarked prose</span></div>').archetype, 'unmarked');
});
test('heading wrappers and comment-contained articles do not split an otherwise preserving family', () => {
    const seed = make('<main><h1>Title</h1><article><p>Body</p></article></main>');
    const procedure = core.compile(seed.window.document, rule('main'));
    for (const html of [
        '<main><h1><span>New title</span></h1><article><p>New body</p></article></main>',
        '<main><h1>New title</h1><article><p>New body</p></article><section role=comment><article><p>Optional comment</p></article></section></main>'
    ]) {
        const transfer = make(html);
        assert.deepEqual(core.descriptor(transfer.window.document), procedure.preconditions.scope);
        assert.equal(core.apply(transfer.window.document, procedure).accepted, true);
        transfer.window.close();
    }
    seed.window.close();
});
test('old descriptor artifacts fail closed without rewriting the procedure', () => {
    const dom = make(seedHTML), procedure = core.compile(dom.window.document, rule('#old'));
    procedure.preconditions.scope.version = 2;
    assert.equal(core.apply(dom.window.document, procedure).reason, 'structural-scope-mismatch'); dom.window.close();
});
