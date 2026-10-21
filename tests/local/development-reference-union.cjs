// Additive engineering development annotations. Never reads extraction outputs.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_OUTPUT = path.join(ROOT, 'workspace/task023/training-improvement/reference-union-v1/benchmark');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const norm = value => (value || '').replace(/\s+/g, ' ').trim();
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hashFile = file => sha(fs.readFileSync(file));
const identity = target => JSON.stringify([target.tag, target.id || null, target.text]);
const sourceIndexes = new WeakMap();
function mappedLegacy(target) {
    return { ...target, id: target.elementId || null };
}
function sourceDOM(html, url) {
    return new JSDOM(html.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ''),
        { url, virtualConsole: new VirtualConsole() });
}
function sourceMatches(doc, target) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(target.tag || '') || typeof target.text !== 'string' || !target.text)
        throw Error('Invalid source target');
    let index = sourceIndexes.get(doc);
    if (!index) { index = new Map(); sourceIndexes.set(doc, index); }
    if (!index.has(target.tag)) index.set(target.tag, [...doc.getElementsByTagName(target.tag)].map(element => ({ element, text: norm(element.textContent) })));
    return index.get(target.tag).filter(({ element, text }) => (!target.id || element.id === target.id) && text.includes(target.text)).map(({ element }) => element);
}
function assertSourceHash(html, expected) {
    if (sha(html) !== expected) throw Error('Source hash mismatch');
}
function unionReference(strict, legacy, html, url) {
    const targets = [...strict.targets];
    const seen = new Set(targets.map(identity));
    const added = [];
    for (const raw of legacy.targets) {
        const target = mappedLegacy(raw), key = identity(target);
        if (!seen.has(key)) { targets.push(target); added.push(target); seen.add(key); }
    }
    const dom = sourceDOM(html, url);
    let meaningful = 0;
    try {
        for (const target of targets) {
            const matches = sourceMatches(dom.window.document, target);
            if (!matches.length) throw Error('Source target missing: ' + identity(target));
            // Uniform predeclared eligibility policy; short targets remain mandatory.
            if ((norm(target.text).length >= 10 || (/^H[1-6]$/.test(target.tag) && norm(target.text))) &&
                matches.some(element => !element.closest('nav,footer,[role="navigation"]'))) meaningful++;
        }
    } finally { dom.window.close(); }
    return { reference: { ...strict, targets, scorable: targets.length >= 3 && meaningful >= 3 },
        added, meaningfulTargets: meaningful, sourceVerifiedTargets: targets.length };
}
function scorerSource(root = ROOT) {
    const generic = fs.readFileSync(path.join(root, 'tests/local/holdout.cjs'), 'utf8');
    const marker = 'const result=await pg.evaluate(', start = generic.indexOf(marker) + marker.length;
    const end = generic.indexOf('},refs);', start);
    if (start < marker.length || end < start) throw Error('Fixed scorer extraction markers missing');
    const source = generic.slice(start, end + 1);
    vm.runInNewContext('(' + source + ')'); // Syntax check only, no browser or outputs.
    return source;
}
function createBenchmark({ root = ROOT, outputDirectory = DEFAULT_OUTPUT } = {}) {
    if (fs.existsSync(outputDirectory)) throw Error('Refusing overwrite: ' + outputDirectory);
    const parentDirectory = path.join(root, 'workspace/task023/development-metric-audit');
    const development = path.join(root, 'workspace/task023/live-20261019');
    const parentFile = path.join(parentDirectory, 'frozen-manifest.json'), parent = read(parentFile);
    const parentSha = hashFile(parentFile);
    if (parentSha !== fs.readFileSync(path.join(parentDirectory, 'frozen-manifest.sha256'), 'utf8').trim()) throw Error('Parent manifest hash mismatch');
    if (parent.pages.length !== 18) throw Error('Expected fixed18 development pages');
    const scorer = scorerSource(root);
    if (sha(scorer) !== parent.scoringFunctionSha256) throw Error('Original frozen scorer drift');
    const inputs = { [path.relative(root, parentFile)]: parentSha };
    const pages = [];
    let legacyCount = 0;
    // Validate and construct every reference before writing any generated artifact.
    for (const row of parent.pages) {
        const folder = path.join(development, row.id), sourceFile = path.join(folder, 'source.html');
        const parentRefFile = path.join(parentDirectory, 'references', row.id + '.json'), legacyFile = path.join(folder, 'references.json');
        const html = fs.readFileSync(sourceFile, 'utf8'), strict = read(parentRefFile), legacy = read(legacyFile);
        assertSourceHash(html, row.sourceSha256);
        if (hashFile(parentRefFile) !== row.referenceSha256) throw Error('Parent reference mismatch: ' + row.id);
        const legacyExpected = parent.files[path.relative(root, legacyFile)];
        if (!legacyExpected || hashFile(legacyFile) !== legacyExpected) throw Error('Legacy reference mismatch: ' + row.id);
        if (legacy.captureSha256 !== row.sourceSha256) throw Error('Legacy/source binding mismatch: ' + row.id);
        for (const file of [sourceFile, parentRefFile, legacyFile]) inputs[path.relative(root, file)] = hashFile(file);
        const union = unionReference(strict, legacy, html, row.finalUrl || row.url);
        if (!union.reference.scorable) throw Error('Fewer than3 meaningful source-verified targets: ' + row.id);
        legacyCount += legacy.targets.length;
        pages.push({ id: row.id, pair: row.pair, position: row.position, url: row.finalUrl || row.url,
            sourceSha256: row.sourceSha256, parentReferenceSha256: row.referenceSha256,
            originalScorable: strict.scorable, originalTargets: strict.targets.length,
            legacyTargets: legacy.targets.length, addedTargets: union.added.length,
            targets: union.reference.targets.length, meaningfulTargets: union.meaningfulTargets,
            reference: union.reference });
    }
    if (legacyCount !== 119) throw Error('Expected original119 legacy targets');
    for (const name of ['tests/local/holdout.cjs', 'tests/local/development-reference-union.cjs']) inputs[name] = hashFile(path.join(root, name));
    fs.mkdirSync(path.dirname(outputDirectory), { recursive: true });
    fs.mkdirSync(outputDirectory); // Exclusive directory creation; concurrent runs cannot replace it.
    fs.mkdirSync(path.join(outputDirectory, 'references'));
    const write = (file, bytes) => fs.writeFileSync(path.join(outputDirectory, file), bytes, { flag: 'wx' });
    write('strict-scorer.js', scorer);
    const outputFiles = { 'strict-scorer.js': sha(scorer) };
    for (const page of pages) {
        const name = 'references/' + page.id + '.json', bytes = JSON.stringify(page.reference, null, 2);
        write(name, bytes); outputFiles[name] = sha(bytes);
        delete page.reference;
    }
    const manifest = { schemaVersion: 1, frozenAt: new Date().toISOString(), kind: 'additive-development-reference-union',
        fixedPages: 18, fixedSites: 9, legacyTargetsRepresented: legacyCount,
        originalScorablePages: parent.pages.filter(p => p.scorable).length, supplementaryScorablePages: pages.length,
        parentManifestSha256: parentSha, scorerSha256: sha(scorer), inputs, outputFiles, pages,
        policy: { operation: 'Strict target union all mapped legacy targets; identity=tag/id/text. All original strict link/image/noise arrays and other fields preserved. Only targets/scorable can differ.',
            sourceVerification: 'Same tag and optional id, normalized source element text includes exact target text; all union targets verified.',
            meaningfulEligibility: 'At least3 distinct source-verified targets with >=10 normalized characters or nonempty heading, matching outside nav/footer/role=navigation. Shorter targets remain mandatory.',
            scoreSemantics: 'Exact original frozen strict browser scorer, unchanged. Original benchmark remains separate.',
            provenance: 'Engineering development annotation union using historical source-selected legacy anchors. Not blinded evaluation, independent human gold, accessibility gold, or unseen generalization evidence.' } };
    const bytes = JSON.stringify(manifest, null, 2); write('manifest.json', bytes); write('manifest.sha256', sha(bytes));
    verifyBenchmark({ root, outputDirectory });
    return manifest;
}
function verifyBenchmark({ root = ROOT, outputDirectory = DEFAULT_OUTPUT } = {}) {
    const manifest = read(path.join(outputDirectory, 'manifest.json'));
    if (hashFile(path.join(outputDirectory, 'manifest.json')) !== fs.readFileSync(path.join(outputDirectory, 'manifest.sha256'), 'utf8').trim()) throw Error('Union manifest drift');
    for (const [file, hash] of Object.entries(manifest.inputs)) if (hashFile(path.join(root, file)) !== hash) throw Error('Source/input drift: ' + file);
    for (const [file, hash] of Object.entries(manifest.outputFiles)) if (hashFile(path.join(outputDirectory, file)) !== hash) throw Error('Union reference/scorer drift: ' + file);
    if (manifest.scorerSha256 !== manifest.outputFiles['strict-scorer.js']) throw Error('Scorer binding mismatch');
    return manifest;
}
module.exports = { unionReference, mappedLegacy, sourceMatches, assertSourceHash, scorerSource, createBenchmark, verifyBenchmark, DEFAULT_OUTPUT, identity, sha };
if (require.main === module) {
    const operation = process.argv[2];
    try {
        const m = operation === 'freeze' ? createBenchmark() : operation === 'verify' ? verifyBenchmark() : (() => { throw Error('Choose freeze or verify'); })();
        console.log(JSON.stringify({ operation, pages: m.fixedPages, scorable: m.supplementaryScorablePages, legacyTargets: m.legacyTargetsRepresented,
            totalTargets: m.pages.reduce((n, p) => n + p.targets, 0), addedTargets: m.pages.reduce((n, p) => n + p.addedTargets, 0), outputDirectory: DEFAULT_OUTPUT }));
    } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
