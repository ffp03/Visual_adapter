const { test, afterEach } = require('node:test'), assert = require('node:assert/strict');
const { doc, close, prose } = require('./helpers.cjs');
const { Views } = require('../../../backend/agent/outline.cjs');
const { catalog, alternatives } = require('../../../backend/agent/catalog.cjs');
const v3 = require('../../../extension/procedure-v3.js');
afterEach(close);
test('observed selector catalog is unique on every induction page and does not invent class combinations', () => {
    const ds = ['a', 'b'].map(s => doc(`<main id="content" class="layout__content"><h1>${s} title</h1><p>${prose(s)}</p></main>`));
    const view = new Views(ds), c = catalog(view, 0);
    assert.ok(c.some(x => x.selector === 'main[id="content"]' && x.anchorEligible));
    for (const x of c) { assert.deepEqual(x.counts, [1, 1]); assert.ok(ds.every(d => v3.matches(d, x.selector).length === 1)); }
    const suggested = alternatives(view, 0, 'main#content.reference-layout');
    assert.equal(suggested[0].selector, 'main[id="content"]'); assert.ok(suggested.length <= 3);
    assert.equal(v3.matches(ds[0], 'main#content.reference-layout').length, 0);
});
test('catalog cues obey redaction and the shared budget; unstable selectors are not offered', () => {
    const ds = ['a', 'b'].map(s => doc(`<main id="${s}" class="reading"><h1>Contact alice@example.org</h1><p>${prose(s)}</p><input value="private-value"></main>`));
    const view = new Views(ds), budget = { remaining: 5 }, c = catalog(view, 0, {}, budget);
    assert.ok(!c.some(x => x.selector.includes('id='))); assert.equal(budget.remaining, 0);
    assert.ok(!JSON.stringify(c).includes('alice@example.org')); assert.ok(!JSON.stringify(c).includes('private-value'));
    assert.ok(c.reduce((sum, x) => sum + x.cue.length, 0) <= 5);
});
