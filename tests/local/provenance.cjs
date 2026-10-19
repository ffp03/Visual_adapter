const { isDeepStrictEqual } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function fingerprintInputs(manifestPath, fixturePath, pages, root) {
    const hash = createHash('sha256').update(fs.readFileSync(manifestPath)).update(fs.readFileSync(fixturePath));
    for (const row of [...pages].sort((a, b) => a.id.localeCompare(b.id))) {
        const input = path.resolve(root, row.html_file);
        if (!input.startsWith(path.resolve(root) + path.sep)) throw Error('Corpus input escapes project');
        hash.update(row.id).update('\0').update(fs.readFileSync(input));
    }
    return hash.digest('hex');
}

function assertCompatibleProvenance(saved, current) {
    if (!isDeepStrictEqual(saved, current)) {
        throw new Error('Saved benchmark provenance does not match current source, protocol or runtime. Preserve the old run and start a new result set.');
    }
}

module.exports = { assertCompatibleProvenance, fingerprintInputs };

if (require.main === module) {
    const assert = require('node:assert/strict');
    const sample = { source: 'source-a', protocol: 'protocol-a', node: 'runtime-a', inputs: 'input-a' };
    assert.doesNotThrow(() => assertCompatibleProvenance({ ...sample }, sample));
    for (const field of ['source', 'protocol', 'node', 'inputs']) {
        assert.throws(() => assertCompatibleProvenance({ ...sample, [field]: 'different' }, sample), /provenance/);
    }
    assert.throws(() => assertCompatibleProvenance(undefined, sample), /provenance/);
    const root = path.resolve(__dirname, '../..');
    const temp = fs.mkdtempSync(path.join(root, 'workspace/task023/provenance-test-'));
    const manifest = path.join(temp, 'manifest.json'), fixture = path.join(temp, 'fixture.json'), input = path.join(temp, 'page.html');
    fs.writeFileSync(manifest, '{}'); fs.writeFileSync(fixture, '{"main":"main"}'); fs.writeFileSync(input, '<main>first</main>');
    const pages = [{ id: 'one', html_file: path.relative(root, input) }];
    const before = fingerprintInputs(manifest, fixture, pages, root);
    fs.writeFileSync(input, '<main>other</main>');
    assert.notEqual(fingerprintInputs(manifest, fixture, pages, root), before);
    fs.writeFileSync(input, '<main>first</main>'); fs.writeFileSync(fixture, '{"main":"body"}');
    assert.notEqual(fingerprintInputs(manifest, fixture, pages, root), before);
    console.log(JSON.stringify({ provenance_regressions: 8, passed: 8 }));
}
