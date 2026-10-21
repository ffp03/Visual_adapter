const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('./development-reference-union.cjs');
const ROOT = path.resolve(__dirname, '../..');
const OWNED = path.join(ROOT, 'workspace/task023/training-improvement/reference-union-v1');
fs.mkdirSync(OWNED, { recursive: true });
const run = fs.mkdtempSync(path.join(OWNED, 'test-run-'));
const checks = [];
function test(name, action) { action(); checks.push(name); }
const strict = { title: 'Fixture', targets: [{ tag: 'H1', id: 'title', text: 'Source title' }],
    links: [{ text: 'Required resource link', url: 'https://example.test/next', originalHref: 'next' }],
    images: [{ url: 'https://example.test/photo.png', alt: 'Required photograph' }], noise: ['External navigation text'],
    scorable: false, shell: false, paragraphs: 2, regionTag: 'MAIN', policy: 'Original policy unchanged' };
const legacy = { targets: [{ tag: 'H1', elementId: 'title', text: 'Source title' },
    { tag: 'P', elementId: 'one', text: 'First meaningful paragraph' },
    { tag: 'P', elementId: 'two', text: 'Second meaningful paragraph' },
    { tag: 'P', elementId: 'two', text: 'Second meaningful paragraph' }] };
const html = '<main><h1 id="title">Source title</h1><p id="one">First meaningful paragraph</p><p id="two">Second meaningful paragraph</p></main>';
let union;
test('strict inclusion, non-target checks unchanged, id mapping and dedup', () => {
    const before = JSON.stringify(strict);
    union = api.unionReference(strict, legacy, html, 'https://example.test/page');
    assert.equal(JSON.stringify(strict), before);
    assert.deepEqual(union.reference.targets[0], strict.targets[0]);
    for (const key of Object.keys(strict).filter(k => !['targets', 'scorable'].includes(k))) assert.deepEqual(union.reference[key], strict[key]);
    assert.equal(union.reference.targets.length, 3);
    assert.equal(union.reference.targets[1].id, 'one');
    assert.equal(union.reference.targets[2].id, 'two');
    assert.equal(union.added.length, 2);
    assert.equal(union.reference.scorable, true);
});
test('source tag/id/text predicate rejects mismatches', () => {
    assert.throws(() => api.unionReference(strict, { targets: [{ tag: 'P', elementId: 'wrong', text: 'First meaningful paragraph' }] }, html, 'https://example.test/'), /Source target missing/);
    assert.throws(() => api.unionReference(strict, { targets: [{ tag: 'DIV', text: 'First meaningful paragraph' }] }, html, 'https://example.test/'), /Source target missing/);
    assert.throws(() => api.unionReference(strict, { targets: [{ tag: 'P', text: 'Absent source prose' }] }, html, 'https://example.test/'), /Source target missing/);
});
test('source hash mismatch rejected', () => {
    api.assertSourceHash(html, api.sha(html));
    assert.throws(() => api.assertSourceHash(html + 'changed', api.sha(html)), /Source hash mismatch/);
});
test('short source targets remain required but do not manufacture eligibility', () => {
    const small = api.unionReference({ ...strict, targets: [] }, { targets: [{ tag: 'P', text: 'a' }, { tag: 'P', text: 'b' }, { tag: 'P', text: 'c' }] }, '<p>a</p><p>b</p><p>c</p>', 'https://example.test/');
    assert.equal(small.reference.targets.length, 3);
    assert.equal(small.reference.scorable, false);
    assert.equal(small.meaningfulTargets, 0);
});
const artifact = path.join(run, 'benchmark');
let manifest;
test('freeze all18 references with all119 legacy anchors and original checks', () => {
    manifest = api.createBenchmark({ outputDirectory: artifact });
    assert.equal(manifest.fixedPages, 18);
    assert.equal(manifest.fixedSites, 9);
    assert.equal(manifest.originalScorablePages, 15);
    assert.equal(manifest.supplementaryScorablePages, 18);
    assert.equal(manifest.legacyTargetsRepresented, 119);
    assert.equal(Object.keys(manifest.outputFiles).length, 19);
    for (const page of manifest.pages) {
        const parent = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace/task023/development-metric-audit/references', page.id + '.json')));
        const legacy = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace/task023/live-20261019', page.id, 'references.json')));
        const ref = JSON.parse(fs.readFileSync(path.join(artifact, 'references', page.id + '.json')));
        const identities = new Set(ref.targets.map(api.identity));
        assert.equal(identities.size, ref.targets.length);
        for (const target of parent.targets) assert(ref.targets.some(t => JSON.stringify(t) === JSON.stringify(target)));
        for (const target of legacy.targets) assert(identities.has(api.identity(api.mappedLegacy(target))));
        for (const key of Object.keys(parent).filter(k => !['targets', 'scorable'].includes(k))) assert.deepEqual(ref[key], parent[key]);
        assert.equal(ref.scorable, true);
        assert(page.meaningfulTargets >= 3);
    }
    assert.equal(api.sha(fs.readFileSync(path.join(artifact, 'strict-scorer.js'))), manifest.scorerSha256);
    api.verifyBenchmark({ outputDirectory: artifact });
});
test('overwrite rejected without modifying frozen manifest', () => {
    const before = fs.readFileSync(path.join(artifact, 'manifest.json'));
    assert.throws(() => api.createBenchmark({ outputDirectory: artifact }), /Refusing overwrite/);
    assert.deepEqual(fs.readFileSync(path.join(artifact, 'manifest.json')), before);
});
test('source/input drift and generated reference drift rejected', () => {
    const alternateRoot = path.join(run, 'drift-fixture');
    const first = Object.keys(manifest.inputs)[0], file = path.join(alternateRoot, first);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'Source/input drift fixture');
    assert.throws(() => api.verifyBenchmark({ root: alternateRoot, outputDirectory: artifact }), /Source\/input drift/);
    const refFile = path.join(artifact, 'references', manifest.pages[0].id + '.json');
    fs.copyFileSync(refFile, path.join(run, 'original-reference-before-intentional-drift.json'));
    fs.appendFileSync(refFile, '\n');
    assert.throws(() => api.verifyBenchmark({ outputDirectory: artifact }), /Union reference\/scorer drift/);
});
const report = { passed: checks.length, checks, testArtifacts: run, preservedIntentionalDriftFixture: true,
    counts: { pages: manifest.fixedPages, originalScorable: manifest.originalScorablePages, supplementaryScorable: manifest.supplementaryScorablePages,
        legacyTargets: manifest.legacyTargetsRepresented, totalUnionTargets: manifest.pages.reduce((n, p) => n + p.targets, 0), addedTargets: manifest.pages.reduce((n, p) => n + p.addedTargets, 0) } };
fs.writeFileSync(path.join(run, 'test-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
