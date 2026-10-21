const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');
const core = require('../../extension/procedure-core');
const frozenRoot = path.resolve(__dirname, '../../docs/evaluation/development-2026-10-21-ac');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const freezeBytes = fs.readFileSync(path.join(frozenRoot, 'freeze.json'));
assert.equal(digest(freezeBytes), '15cf666033ce4c89529dc6c3e872af396f4476993590f5ea08a0bd6f77a4e254', 'trusted development freeze bytes changed');
const frozenBytes = fs.readFileSync(path.join(frozenRoot, 'source-snapshot/extension_procedure-core.js'));
assert.equal(digest(frozenBytes), JSON.parse(freezeBytes).files['extension/procedure-core.js'], 'frozen core bytes differ from trusted freeze');
const frozenSource = frozenBytes.toString('utf8');
const sandbox = { module: { exports: {} }, URL }; vm.runInNewContext(frozenSource, sandbox);
const frozen = sandbox.module.exports;
const make = html => new JSDOM(html, { url: 'https://synthetic.invalid/original/' });
const plain = value => JSON.parse(JSON.stringify(value));
const rule = main => ({ main, exclude: [], name: 'Synthetic retained candidate' });
function compare(doc, procedure, inventory) {
    const old = frozen.apply(doc, procedure, inventory), current = core.apply(doc, procedure, inventory);
    assert.deepEqual(plain(current), plain(old)); return current;
}
function procedure(doc, regions, exclude = []) {
    return { schemaVersion: 2, regions, exclude, preconditions: { scope: frozen.descriptor(doc) } };
}
test('accepted rich reading content remains byte/coverage/result equivalent to frozen core', () => {
    const dom = make('<base href="https://synthetic.invalid/base/"><nav>Global</nav><main><h1>Heading</h1><nav><a href="#target">Contents</a></nav><pre><code>  first\n    second  third</code></pre><table><tr><td>Cell</td></tr></table><ul><li>Entry</li></ul><p id=target><a href="next">Reading link</a><img src="image.png" alt="Meaningful"></p></main>');
    try { const p = frozen.compile(dom.window.document, rule('main')); const out = compare(dom.window.document, p); assert.equal(out.accepted, true); assert(out.html.includes('https://synthetic.invalid/base/next')); }
    finally { dom.window.close(); }
});
test('all 64 rejecting combinations retain identical coverage, reason, order and budgets', () => {
    const dom = make('<main>' + Array.from({ length: 6 }, (_, r) => Array.from({ length: 4 }, (_, c) => '<section id="r'+r+'c'+c+'">' + '<p>Repeated reading block</p>'.repeat(4) + '</section>').join('')).join('') + '</main>');
    try {
        const regions = Array.from({ length: 6 }, (_, r) => ({ selector: '#r'+r+'c0', selectors: Array.from({ length: 4 }, (_, c) => '#r'+r+'c'+c) }));
        const out = compare(dom.window.document, procedure(dom.window.document, regions));
        assert.equal(out.accepted, false); assert.equal(out.attemptedCombinations, 64); assert.equal(out.reason, 'selector-search-budget-exhausted');
    } finally { dom.window.close(); }
});
test('reused fixed-region templates remain pristine through trial exclusions and source DOM stays untouched', () => {
    const dom = make('<main><section id=fixed><span class=prunable></span><p>Fixed reading</p></section><section id=empty></section><section id=correct><span class=prunable></span><p>Additional reading</p></section></main>');
    try {
        const doc = dom.window.document, before = doc.body.outerHTML;
        const p = procedure(doc, [{ selector: '#fixed' }, { selector: '#empty', selectors: ['#empty', '#correct'] }], ['.prunable']);
        const out = compare(doc, p); assert.equal(out.accepted, true); assert.equal(out.attemptedCombinations, 2);
        assert(!out.html.includes('prunable')); assert.equal(doc.body.outerHTML, before); assert.deepEqual(plain(core.apply(doc, p)), plain(out));
    } finally { dom.window.close(); }
});
test('reader signature hits never collapse repeated text multiplicity', () => {
    const dom = make('<main><section id=one><p>Identical reading</p></section><section id=two><p>Identical reading</p></section><section id=empty></section></main>');
    try {
        const doc = dom.window.document;
        const first = { selector: '#one', selectors: ['#one', '#empty'] };
        const missing = compare(doc, procedure(doc, [first])); assert.equal(missing.accepted, false); assert.equal(missing.coverage.missing.length, 2);
        const all = compare(doc, procedure(doc, [first, { selector: '#two' }])); assert.equal(all.accepted, true);
    } finally { dom.window.close(); }
});
test('identical HTML and SVG anchor serialization stays distinct by namespace and context', () => {
    const dom = make('<main id=reading><svg><a href="same">Repeated</a></svg><a href="same">Repeated</a></main><main id=empty></main>');
    try {
        const doc = dom.window.document, anchors = [...doc.querySelectorAll('a')];
        assert.equal(anchors[0].outerHTML, anchors[1].outerHTML); assert.notEqual(anchors[0].namespaceURI, anchors[1].namespaceURI);
        const region = { selector: '#reading', selectors: ['#reading', '#empty'] };
        assert.equal(compare(doc, procedure(doc, [region])).accepted, true);
        assert.equal(compare(doc, procedure(doc, [region], ['svg'])).accepted, false);
    } finally { dom.window.close(); }
});
test('exact code whitespace, destinations, fragments and separate-apply DOM/base changes remain checked', () => {
    const dom = make('<base href="https://synthetic.invalid/first/"><main id=reading><code><span>return</span><span class=space>  </span><span>value\n next</span></code><p id=target>Target <a href="#target">jump</a><a href="relative">relative</a></p></main><main id=empty></main>');
    try {
        const doc = dom.window.document, p = procedure(doc, [{ selector: '#reading', selectors: ['#reading', '#empty'] }]);
        assert.equal(compare(doc, p).accepted, true);
        const broken = structuredClone(p); broken.exclude = ['.space']; assert.equal(compare(doc, broken).accepted, false);
        doc.querySelector('base').href = 'https://synthetic.invalid/changed/'; doc.querySelector('code span').textContent = 'yield';
        doc.querySelector('main').insertAdjacentHTML('beforeend', '<p>New current reading</p>');
        const changed = compare(doc, p); assert.equal(changed.accepted, true); assert(changed.html.includes('https://synthetic.invalid/changed/relative')); assert(changed.html.includes('yield'));
    } finally { dom.window.close(); }
});
test('oversized entries fall through without weakening acceptance or repeated-apply checks', () => {
    const dom = make('<main id=reading><pre>' + 'x'.repeat(2000100) + '</pre></main><main id=empty></main>');
    try { const doc = dom.window.document, p = procedure(doc, [{ selector: '#reading', selectors: ['#reading', '#empty'] }]); assert.equal(compare(doc, p).accepted, true); doc.querySelector('pre').textContent += '\n changed'; assert.equal(compare(doc, p).accepted, true); }
    finally { dom.window.close(); }
});
test('more than 2048 distinct reader signatures safely evict while preserving all roles', () => {
    const dom = make('<main id=reading>' + Array.from({ length: 2055 }, (_, index) => '<p id="block'+index+'">Distinct reading block '+index+'</p>').join('') + '</main><main id=empty></main>');
    try {
        const doc = dom.window.document, inventory = frozen.inspect(doc);
        const p = { schemaVersion: 2, regions: [{ selector: '#reading', selectors: ['#reading', '#empty'] }], exclude: [], preconditions: { scope: inventory.descriptor } };
        const out = compare(doc, p, inventory); assert.equal(out.accepted, true); assert.equal(out.coverage.retained, 2055);
    } finally { dom.window.close(); }
});
