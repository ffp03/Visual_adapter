const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const digest = value => createHash('sha256').update(value).digest('hex');
const root = path.resolve(__dirname, '../..');
const scratch = path.join(root, 'workspace/task023/training-improvement/helper-tests-' + Date.now());
fs.mkdirSync(scratch, { recursive: true });
const readFile = fs.readFileSync;
let protectedReads = 0, api;
try {
    fs.readFileSync = (file, ...args) => {
        if (/frozen-manifest|holdout\.cjs/.test(String(file))) { protectedReads++; throw Error('Import performed replay input read'); }
        return readFile(file, ...args);
    };
    api = require('./training-development.cjs');
} finally { fs.readFileSync = readFile; }
const write = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
const json = (file, value) => write(file, JSON.stringify(value));
const pages = Array.from({ length: 18 }, (_, index) => ({ id: 'page-' + index, pair: 'pair-' + Math.floor(index / 2), sourceSha256: digest('source-' + index) }));
test('helper import performs no replay/data reads or browser launch; output tags are bounded', () => {
    assert.equal(protectedReads, 0);
    assert(api.outputDirectory('replay-v2').endsWith('replay-v2'));
    assert.throws(() => api.outputDirectory('../escape'));
});
test('provider and legacy references are checked against historical manifest, not adopted as new hashes', () => {
    const owner = path.join(scratch, 'historical');
    const files = {}, source = 'historical source';
    for (const [name, value] of [['source.html', source], ['provider-rule.json', 'historical provider'], ['references.json', 'historical legacy']]) {
        const relative = 'workspace/task023/live-20261019/one/' + name;
        write(path.join(owner, relative), value); files[relative.replaceAll('/', '\\')] = digest(value);
    }
    const strict = 'workspace/task023/development-metric-audit/references/one.json'; write(path.join(owner, strict), 'strict');
    const manifest = { files, pages: [{ id: 'one', sourceSha256: digest(source), referenceSha256: digest('strict') }] };
    assert(api.originalInputs(owner, manifest));
    const provider = path.join(owner, 'workspace/task023/live-20261019/one/provider-rule.json');
    write(provider, 'changed provider'); assert.throws(() => api.originalInputs(owner, manifest), /Input drift/); write(provider, 'historical provider');
    const legacy = path.join(owner, 'workspace/task023/live-20261019/one/references.json');
    write(legacy, 'changed legacy'); assert.throws(() => api.originalInputs(owner, manifest), /Input drift/);
});
test('additive input reconstructs verified individual rows and ignores unbound summary metadata', () => {
    const directory = path.join(scratch, 'artifacts'), hashes = {};
    for (const page of pages) for (const approach of ['fallback', 'compiled-fresh', 'compiled-shared']) {
        const name = page.id + '-' + approach;
        const bytes = JSON.stringify({ id: page.id, pair: page.pair, approach, delivery: { noFallback: false }, original: { classification: 'indeterminate' } });
        write(path.join(directory, name + '.json'), bytes); hashes[name + '.json'] = digest(bytes);
        write(path.join(directory, name + '.html'), '<p>Reading</p>'); hashes[name + '.html'] = digest('<p>Reading</p>');
    }
    json(path.join(directory, 'artifact-hashes.json'), hashes);
    json(path.join(directory, 'summary.json'), { rows: [{ delivery: { noFallback: true }, original: { classification: 'confirmed-success' } }] });
    const rows = api.verifiedRows(directory, pages);
    assert.equal(rows.length, 54); assert(rows.every(row => !row.delivery.noFallback && row.original.classification === 'indeterminate'));
    const target = path.join(directory, 'page-0-fallback.json');
    const changed = JSON.parse(fs.readFileSync(target)); changed.delivery.noFallback = true; json(target, changed);
    assert.throws(() => api.verifiedRows(directory, pages), /Input drift/);
});
test('union verification checks existing benchmark checksum and exact18 IDs/9pairs', () => {
    const directory = path.join(scratch, 'union'); fs.mkdirSync(directory);
    write(path.join(directory, 'strict-scorer.js'), 'synthetic scorer');
    const manifest = { pages, inputs: {}, outputFiles: { 'strict-scorer.js': digest('synthetic scorer') }, scorerSha256: digest('synthetic scorer'), parentManifestSha256: 'parent' };
    const freeze = value => { const bytes = JSON.stringify(value); write(path.join(directory, 'manifest.json'), bytes); write(path.join(directory, 'manifest.sha256'), digest(bytes)); };
    const verify = () => api.verifyUnionBenchmark({ ownerRoot: scratch, directory, originalManifest: { pages }, parentManifestSha256: 'parent', scorerSha256: digest('synthetic scorer') });
    freeze(manifest); assert.equal(verify().pages.length, 18);
    json(path.join(directory, 'manifest.json'), { ...manifest, pages: pages.slice(1) }); assert.throws(verify, /Union manifest drift/);
    freeze({ ...manifest, pages: pages.slice(1) }); assert.throws(verify, /exact18/);
    freeze({ ...manifest, pages: [...pages.slice(0, 17), pages[0]] }); assert.throws(verify, /exact18/);
    freeze({ ...manifest, pages: pages.map((page, index) => index === 0 ? { ...page, pair: 'unexpected' } : page) }); assert.throws(verify, /exact9/);
    freeze({ ...manifest, parentManifestSha256: 'other' }); assert.throws(verify, /binding mismatch/);
});
