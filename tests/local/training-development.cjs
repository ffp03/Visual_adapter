// Development-only deterministic replay; no model/API/site requests. Union mode
// scores these SAME saved artifacts and deliberately discards timing fields.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createHash } = require('node:crypto');
const browserClient = () => require('C:/Users/final/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright').chromium;
const root = path.resolve(__dirname, '../..'), old = path.join(root, 'workspace/task023/live-20261019');
const audit = path.join(root, 'workspace/task023/development-metric-audit');
const unionRoot = path.join(root, 'workspace/task023/training-improvement/reference-union-v1/benchmark');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const approaches = ['fallback', 'compiled-fresh', 'compiled-shared'];
const production = ['extension/procedure-core.js','extension/content.js','extension/background.js','extension/rule-service.js','extension/sidepanel.js','extension/manifest.json','backend/local-ai.cjs','backend/procedure-families.cjs','backend/deepseek-runner.cjs','backend/codex-runner.cjs'];
function loadOriginal() {
    const file = path.join(audit, 'frozen-manifest.json'), bytes = fs.readFileSync(file);
    if (hash(bytes) !== fs.readFileSync(path.join(audit, 'frozen-manifest.sha256'), 'utf8').trim()) throw Error('Original manifest drift');
    const manifest = JSON.parse(bytes);
    assertPageSet(manifest.pages, manifest.pages);
    const generic = fs.readFileSync(path.join(root, 'tests/local/holdout.cjs'), 'utf8');
    const marker = 'const result=await pg.evaluate(', start = generic.indexOf(marker) + marker.length;
    const scoreSource = generic.slice(start, generic.indexOf('},refs);', start) + 1);
    if (hash(scoreSource) !== manifest.scoringFunctionSha256) throw Error('Frozen scorer mismatch');
    return { manifest, scoreSource, score: vm.runInNewContext('(' + scoreSource + ')'), manifestSha256: hash(bytes) };
}
function outputDirectory(tag = 'replay-v2') {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(tag)) throw Error('Invalid immutable output tag');
    return path.join(root, 'workspace/task023/training-improvement', tag);
}
function assertPageSet(pages, expected) {
    if (!Array.isArray(pages) || pages.length !== 18 || new Set(pages.map(page => page.id)).size !== 18) throw Error('Expected exact18 unique development IDs');
    const pairs = new Map();
    for (const page of pages) pairs.set(page.pair, (pairs.get(page.pair) || 0) + 1);
    if (pairs.size !== 9 || [...pairs.values()].some(count => count !== 2)) throw Error('Expected exact9 two-page pairs');
    const byId = new Map(expected.map(page => [page.id, page]));
    for (const page of pages) {
        const original = byId.get(page.id);
        if (!original || original.pair !== page.pair || (page.sourceSha256 && original.sourceSha256 && page.sourceSha256 !== original.sourceSha256)) throw Error('Development page identity/pair drift');
    }
}
function originalInputs(ownerRoot, manifest) {
    const frozen = Object.fromEntries(Object.entries(manifest.files).map(([name, expected]) => [name.replaceAll('\\', '/'), expected]));
    const inputs = {};
    for (const page of manifest.pages) {
        for (const name of ['source.html', 'provider-rule.json', 'references.json']) {
            const relative = 'workspace/task023/live-20261019/' + page.id + '/' + name;
            const expected = frozen[relative];
            if (!expected) throw Error('Missing historical input hash: ' + relative);
            if (name === 'source.html' && expected !== page.sourceSha256) throw Error('Source manifest binding mismatch');
            inputs[relative] = expected;
        }
        inputs['workspace/task023/development-metric-audit/references/' + page.id + '.json'] = page.referenceSha256;
    }
    verifyFiles(ownerRoot, inputs);
    return inputs;
}
function verifiedRows(directory, pages) {
    const files = read(path.join(directory, 'artifact-hashes.json'));
    verifyFiles(directory, files);
    const rows = [];
    for (const page of pages) for (const approach of approaches) {
        const name = page.id + '-' + approach;
        if (!files[name + '.json'] || !files[name + '.html']) throw Error('Missing bound reading artifact: ' + name);
        const row = read(path.join(directory, name + '.json'));
        if (row.id !== page.id || row.pair !== page.pair || row.approach !== approach) throw Error('Bound row identity mismatch');
        rows.push(row);
    }
    return rows;
}
function verifyUnionBenchmark({ ownerRoot = root, directory = unionRoot, originalManifest, parentManifestSha256, scorerSha256 }) {
    const manifest = require('./development-reference-union.cjs').verifyBenchmark({ root: ownerRoot, outputDirectory: directory });
    assertPageSet(manifest.pages, originalManifest.pages);
    if (manifest.parentManifestSha256 !== parentManifestSha256 || manifest.scorerSha256 !== scorerSha256) throw Error('Additive parent/scorer binding mismatch');
    return manifest;
}
function verifyFiles(base, files) {
    for (const [name, expected] of Object.entries(files)) {
        const target = path.resolve(base, name);
        if (!target.startsWith(path.resolve(base) + path.sep)) throw Error('Input path escapes owner');
        if (hash(fs.readFileSync(target)) !== expected) throw Error('Input drift: ' + name);
    }
}
function metrics(rows, endpoint) {
    return Object.fromEntries(approaches.map(approach => {
        const selected = rows.filter(row => row.approach === approach), pairs = [...new Set(selected.map(row => row.pair))].map(pair => selected.filter(row => row.pair === pair));
        const pass = row => row[endpoint]?.classification === 'confirmed-success';
        return [approach, { fixedPages: 18, fixedSites: 9, measuredPages: selected.length,
            confirmedSuccess: selected.filter(pass).length, measuredFailure: selected.filter(row => row[endpoint]?.classification === 'measured-failure').length,
            indeterminate: selected.filter(row => row[endpoint]?.classification === 'indeterminate').map(row => row.id),
            noFallbackPages: selected.filter(row => pass(row) && row.delivery.noFallback).length,
            confirmedSites: pairs.filter(pair => pair.length === 2 && pair.every(pass)).length,
            noFallbackSites: pairs.filter(pair => pair.length === 2 && pair.every(row => pass(row) && row.delivery.noFallback)).length,
            legacyAnchors: selected.reduce((n, row) => n + (row.legacy?.total || 0), 0), legacyRetained: selected.reduce((n, row) => n + (row.legacy?.retained || 0), 0),
            targets: selected.reduce((n, row) => n + (row[endpoint]?.total || 0), 0), retained: selected.reduce((n, row) => n + (row[endpoint]?.retained || 0), 0),
            fallbackPages: selected.filter(row => !row.delivery.ruleApplied).length }];
    }));
}
async function replay({ tag = 'replay-v2' } = {}) {
    const output = outputDirectory(tag), { manifest, scoreSource, score } = loadOriginal();
    if (fs.existsSync(output)) throw Error('Immutable output already exists; choose a new authorized tag');
    const files = Object.fromEntries(production.map(name => [name, hash(fs.readFileSync(path.join(root, name)))]));
    const inputs = originalInputs(root, manifest);
    const freeze = { frozenAt: new Date().toISOString(), files, inputs, scorerSha256: hash(scoreSource), originalManifestSha256: hash(fs.readFileSync(path.join(audit, 'frozen-manifest.json'))), mode: 'retained-real-candidate-development-replay-zero-new-generation' };
    fs.mkdirSync(output); save(path.join(output, 'freeze.json'), freeze);
    fs.mkdirSync(path.join(output, 'source-snapshot'));
    for (const file of production) fs.copyFileSync(path.join(root, file), path.join(output, 'source-snapshot', file.replaceAll('/', '_')));
    fs.writeFileSync(path.join(output, 'strict-scorer.js'), scoreSource);
    const core = fs.readFileSync(path.join(root, 'extension/procedure-core.js'), 'utf8'), content = fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8');
    const browser = await browserClient().launch({ executablePath: 'C:/Users/final/AppData/Local/Chromium/Application/chrome.exe', headless: true });
    const rows = [], samples = [], seeds = new Map();
    try {
        for (const entry of manifest.pages) {
            verifyFiles(root, files); verifyFiles(root, inputs);
            const raw = fs.readFileSync(path.join(old, entry.id, 'source.html'), 'utf8');
            if (hash(raw) !== entry.sourceSha256) throw Error('Source changed');
            const candidate = read(path.join(old, entry.id, 'provider-rule.json')).rule;
            const references = read(path.join(audit, 'references', entry.id + '.json')), legacy = read(path.join(old, entry.id, 'references.json'));
            const page = await browser.newPage(), timer = setTimeout(() => page.close().catch(() => {}), 90000);
            try {
                await page.route('**/*', route => route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()
                    ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: raw.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '') }) : route.abort());
                await page.goto(entry.finalUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                const sizes = await page.evaluate(raw => ({ originalBodyCharacters: new DOMParser().parseFromString(raw, 'text/html').body.outerHTML.length,
                    replayBodyCharacters: document.body.outerHTML.length }), raw);
                await page.addScriptTag({ content: core });
                const compilation = await page.evaluate(candidate => { try { return { procedure: PreservationCore.compile(document, candidate) }; } catch (error) { return { error: error.message }; } }, candidate);
                if (!seeds.has(entry.pair)) seeds.set(entry.pair, { id: entry.id, ...compilation });
                await page.evaluate(() => { window.__rules = []; window.__listeners = []; window.chrome.runtime = { sendMessage: async () => ({ rules: window.__rules }), onMessage: { addListener: listener => window.__listeners.push(listener) } }; });
                await page.addScriptTag({ content });
                const sample = await page.evaluate(async () => {
                    const began = performance.now(), direct = analysisSample(document), sampleMilliseconds = performance.now() - began;
                    const response = await new Promise(resolve => window.__listeners[0]({ action: 'EXTRACT_CONTEXT' }, {}, resolve));
                    return { analysisHTML: response.analysisHTML, analysisContext: response.analysisContext,
                        directContext: direct.context, sampleMilliseconds, sameAsDirectProductionSample: response.analysisHTML === direct.html };
                });
                if (!sample.analysisHTML || sample.analysisHTML.length > 12000 || !sample.sameAsDirectProductionSample) throw Error('Actual analysis sample missing, over budget or inconsistent');
                fs.writeFileSync(path.join(output, entry.id + '-analysis.html'), sample.analysisHTML);
                const profile = { id: entry.id, ...sizes, actualAnalysisCharacters: sample.analysisHTML.length, sampleMilliseconds: sample.sampleMilliseconds,
                    context: sample.analysisContext, directContext: sample.directContext, sameAsDirectProductionSample: true };
                samples.push(profile); save(path.join(output, entry.id + '-sampling.json'), profile);
                for (const [approach, procedure] of [['fallback', null], ['compiled-fresh', compilation.procedure], ['compiled-shared', seeds.get(entry.pair).procedure]]) {
                    await page.evaluate(rule => { window.__rules = rule ? [rule] : []; }, procedure || null);
                    const measured = await page.evaluate(score, references);
                    const legacyOutcome = await page.evaluate(({ html, targets }) => {
                        const reader = document.createElement('div'); reader.innerHTML = html; const norm = text => text.replace(/\s+/g, ' ').trim();
                        const results = targets.map(target => ({ ...target, retained: [...reader.querySelectorAll(target.tag.toLowerCase())].some(node => (!target.elementId || node.id === target.elementId)
                            && (/^H[1-6]$/.test(target.tag) ? norm(node.textContent).startsWith(target.text) : norm(node.textContent).includes(target.text))) }));
                        return { total: results.length, retained: results.filter(target => target.retained).length, targets: results };
                    }, { html: measured.out.html || '', targets: legacy.targets });
                    const { html, analysisHTML, ...delivery } = measured.out;
                    const result = { id: entry.id, pair: entry.pair, approach, sourceSha256: entry.sourceSha256, originalReferenceSha256: entry.referenceSha256,
                        originalScorable: entry.scorable, original: { ...measured, out: undefined, classification: !references.scorable ? 'indeterminate' : measured.complete ? 'confirmed-success' : 'measured-failure' },
                        delivery, legacy: legacyOutcome, compilation: approach === 'compiled-shared' ? seeds.get(entry.pair) : compilation,
                        sharedSeedId: seeds.get(entry.pair).id, procedureSha256: procedure ? hash(JSON.stringify(procedure)) : null,
                        provenance: 'retained-candidate deterministic compilation; shared seed procedure unchanged on transfer; no new generation', engine: browser.version() };
                    fs.writeFileSync(path.join(output, entry.id + '-' + approach + '.html'), html || ''); save(path.join(output, entry.id + '-' + approach + '.json'), result); rows.push(result);
                }
                console.log(JSON.stringify({ id: entry.id, sample: profile.actualAnalysisCharacters, unrepresented: profile.context?.unrepresentedRoles,
                    original: rows.slice(-3).map(row => ({ approach: row.approach, classification: row.original.classification, usedRule: row.delivery.usedRule })) }));
            } finally { clearTimeout(timer); await page.close().catch(() => {}); }
        }
        verifyFiles(root, files); verifyFiles(root, inputs);
    } finally { await browser.close(); }
    const artifacts = Object.fromEntries(fs.readdirSync(output).filter(name => name.endsWith('.html') || (name.endsWith('.json') && name !== 'freeze.json')).map(name => [name, hash(fs.readFileSync(path.join(output, name)))]));
    save(path.join(output, 'artifact-hashes.json'), artifacts);
    save(path.join(output, 'summary.json'), { original: metrics(rows, 'original'), rows, samples, unionStatus: 'not-yet-rescored; requires completed additive freeze', newGenerationCalls: 0, liveSiteCalls: 0 });
}
async function unionScore({ tag = 'replay-v2' } = {}) {
    const output = outputDirectory(tag), originalContext = loadOriginal();
    const { scoreSource, score } = originalContext;
    const unionManifestFile = path.join(unionRoot, 'manifest.json');
    if (!fs.existsSync(unionManifestFile)) throw Error('Additive freeze not available');
    const manifest = verifyUnionBenchmark({ originalManifest: originalContext.manifest, parentManifestSha256: originalContext.manifestSha256, scorerSha256: hash(scoreSource) });
    const originalRows = verifiedRows(output, originalContext.manifest.pages);
    const source = fs.readFileSync(path.join(unionRoot, 'strict-scorer.js'), 'utf8');
    if (hash(source) !== manifest.scorerSha256 || manifest.scorerSha256 !== hash(scoreSource)) throw Error('Additive scorer differs from original');
    if (fs.existsSync(path.join(output, 'additive-summary.json'))) throw Error('Additive score already exists');
    const browser = await browserClient().launch({ executablePath: 'C:/Users/final/AppData/Local/Chromium/Application/chrome.exe', headless: true });
    const rows = [];
    try {
        const page = await browser.newPage(); await page.route('**/*', route => route.abort());
        for (const entry of manifest.pages) {
            const references = read(path.join(unionRoot, 'references', entry.id + '.json'));
            for (const approach of approaches) {
                const saved = originalRows.find(row => row.id === entry.id && row.approach === approach);
                const html = fs.readFileSync(path.join(output, entry.id + '-' + approach + '.html'), 'utf8');
                await page.evaluate(out => { window.__listeners = [(request, sender, respond) => respond(out)]; }, { ...saved.delivery, html });
                const measured = await page.evaluate(score, references); delete measured.out; delete measured.localMs; delete measured.medianLocalMs;
                const row = { ...saved, original: saved.original, union: { ...measured, classification: references.scorable === false ? 'indeterminate' : measured.complete ? 'confirmed-success' : 'measured-failure' },
                    unionOriginalScorable: entry.originalScorable, unionMeaningfulTargets: entry.meaningfulTargets, measurement: 'same saved reading output; no extraction/timing claim' };
                rows.push(row); save(path.join(output, entry.id + '-' + approach + '-additive.json'), row.union);
            }
        }
        await page.close();
    } finally { await browser.close(); }
    verifyUnionBenchmark({ originalManifest: originalContext.manifest, parentManifestSha256: originalContext.manifestSha256, scorerSha256: hash(scoreSource) });
    save(path.join(output, 'additive-summary.json'), { metrics: metrics(rows, 'union'), rows, additiveManifestSha256: hash(fs.readFileSync(unionManifestFile)), scorerSha256: hash(source), noTimingClaims: true, newGenerationCalls: 0, liveSiteCalls: 0 });
}
module.exports = { originalInputs, verifiedRows, assertPageSet, verifyUnionBenchmark, outputDirectory };
if (require.main === module) {
    const tag = process.argv.find(value => value.startsWith('--tag='))?.slice(6) || 'replay-v2';
    (process.argv[2] === 'union' ? unionScore({ tag }) : replay({ tag })).catch(error => { console.error(error); process.exitCode = 1; });
}
