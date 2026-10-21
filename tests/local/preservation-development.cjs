// Offline development-only replay. Fixed scoring callback extracted as source;
// the holdout module/CLI is NEVER evaluated, and no heldout data is read.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createHash } = require('node:crypto');
const { chromium } = require('C:/Users/final/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const old = path.join(root, 'workspace/task023/live-20261019');
const audit = path.join(root, 'workspace/task023/development-metric-audit');
const destination = path.join(root, 'workspace/task023/preservation-v2/development-v2');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = read(path.join(audit, 'frozen-manifest.json'));
const generic = fs.readFileSync(path.join(root, 'tests/local/holdout.cjs'), 'utf8');
const marker = 'const result=await pg.evaluate(', start = generic.indexOf(marker) + marker.length;
const scoringSource = generic.slice(start, generic.indexOf('},refs);', start) + 1);
if (hash(scoringSource) !== manifest.scoringFunctionSha256) throw Error('Frozen scorer mismatch');
const score = vm.runInNewContext('(' + scoringSource + ')');
const core = fs.readFileSync(path.join(root, 'extension/procedure-core.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8');
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(destination, 'procedure-core.snapshot.js'), core);
fs.writeFileSync(path.join(destination, 'content.snapshot.js'), content);
(async () => {
    const browser = await chromium.launch({ executablePath: 'C:/Users/final/AppData/Local/Chromium/Application/chrome.exe', headless: true });
    const seeds = new Map(), results = [];
    try {
        for (const row of manifest.pages) {
            const directory = path.join(old, row.id), raw = fs.readFileSync(path.join(directory, 'source.html'), 'utf8');
            if (hash(raw) !== row.sourceSha256) throw Error('Source changed: ' + row.id);
            const candidate = read(path.join(directory, 'provider-rule.json')).rule;
            const strictFile = path.join(audit, 'references', row.id + '.json');
            if (hash(fs.readFileSync(strictFile)) !== row.referenceSha256) throw Error('Frozen reference changed');
            const strict = read(strictFile), legacy = read(path.join(directory, 'references.json'));
            const page = await browser.newPage();
            const timer = setTimeout(() => page.close().catch(() => {}), 45000);
            try {
                await page.route('**/*', route => route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()
                    ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: raw.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '') }) : route.abort());
                await page.goto(row.finalUrl, { timeout: 20000, waitUntil: 'domcontentloaded' });
                await page.addScriptTag({ content: core });
                const compilation = await page.evaluate(candidate => {
                    const start = performance.now();
                    try { return { procedure: PreservationCore.compile(document, candidate), milliseconds: performance.now() - start }; }
                    catch (error) { return { error: error.message, milliseconds: performance.now() - start }; }
                }, candidate);
                if (!seeds.has(row.pair)) seeds.set(row.pair, compilation.procedure || null);
                await page.evaluate(() => {
                    window.__rules = []; window.__listeners = [];
                    window.chrome.runtime = { sendMessage: async () => ({ rules: window.__rules }), onMessage: { addListener: callback => window.__listeners.push(callback) } };
                });
                await page.addScriptTag({ content });
                for (const [approach, procedure] of [['fallback', null], ['compiled-fresh', compilation.procedure], ['compiled-shared', seeds.get(row.pair)]]) {
                    await page.evaluate(procedure => { window.__rules = procedure ? [procedure] : []; }, procedure || null);
                    const measured = await page.evaluate(score, strict);
                    const legacyMeasured = await page.evaluate(({ html, targets }) => {
                        const reader = document.createElement('div'); reader.innerHTML = html;
                        const norm = value => value.replace(/\s+/g, ' ').trim();
                        const outcomes = targets.map(target => ({ ...target, retained: [...reader.querySelectorAll(target.tag.toLowerCase())].some(element =>
                            (!target.elementId || element.id === target.elementId) && (/^H[1-6]$/.test(target.tag) ? norm(element.textContent).startsWith(target.text) : norm(element.textContent).includes(target.text))) }));
                        return { targets: outcomes, retained: outcomes.filter(target => target.retained).length, total: outcomes.length,
                            complete: outcomes.length >= 3 && outcomes.every(target => target.retained) };
                    }, { html: measured.out.html || '', targets: legacy.targets });
                    const { html, analysisHTML, ...delivery } = measured.out;
                    const result = { ...measured, out: undefined, id: row.id, pair: row.pair, approach, scorable: strict.scorable,
                        classification: strict.scorable ? (measured.complete ? 'confirmed-success' : 'measured-failure') : 'indeterminate',
                        fixedScorerNoFallbackPass: measured.noFallbackPass,
                        noFallbackPass: !!strict.scorable && measured.complete && !!delivery.noFallback,
                        delivery, legacy: legacyMeasured, compilation, sourceSha256: row.sourceSha256,
                        referenceSha256: row.referenceSha256, implementationHashes: { core: hash(core), content: hash(content) }, scoringFunctionSha256: hash(scoringSource), engine: browser.version(),
                        provenance: 'development-only-retained-real-model-output-deterministic-compilation-zero-new-generation' };
                    fs.writeFileSync(path.join(destination, row.id + '-' + approach + '.html'), html || '');
                    fs.writeFileSync(path.join(destination, row.id + '-' + approach + '.json'), JSON.stringify(result, null, 2));
                    results.push(result);
                }
                console.log(JSON.stringify({ id: row.id, compileMs: Math.round(compilation.milliseconds), fresh: results.at(-2).delivery.delivery, strict: results.at(-2).classification, medianLocalMs: results.at(-2).medianLocalMs }));
            } finally { clearTimeout(timer); await page.close().catch(() => {}); }
        }
    } finally { await browser.close(); }
    const metrics = Object.fromEntries(['fallback', 'compiled-fresh', 'compiled-shared'].map(approach => {
        const rows = results.filter(row => row.approach === approach);
        return [approach, { fixedPages: 18, fixedSites: 9, measuredPages: rows.length,
            legacy: { anchors: rows.reduce((n, row) => n + row.legacy.total, 0), retained: rows.reduce((n, row) => n + row.legacy.retained, 0), completePages: rows.filter(row => row.legacy.complete).length },
            frozenStrict: { confirmedSuccess: rows.filter(row => row.classification === 'confirmed-success').length,
                measuredFailure: rows.filter(row => row.classification === 'measured-failure').length,
                indeterminate: rows.filter(row => row.classification === 'indeterminate').map(row => row.id),
                noFallbackPass: rows.filter(row => row.noFallbackPass).length },
            supplementedPages: rows.filter(row => row.delivery.supplementation).length,
            fallbackPages: rows.filter(row => row.delivery.delivery === 'fallback').length,
            maxMedianLocalMs: Math.max(...rows.map(row => row.medianLocalMs)) }];
    }));
    fs.writeFileSync(path.join(destination, 'summary.json'), JSON.stringify({ metrics, results, newGenerationCalls: 0, liveSiteCalls: 0, notes: ['Three strict unscorable pages remain indeterminate.', 'Exact frozen scorer noFallback result retained separately; reported noFallback requires accepted application of the fixed declared procedure; compile-time added regions are reported separately, runtime fallback remains excluded.', 'Not unseen performance or accessibility user-outcome evidence.'] }, null, 2));
    console.log(JSON.stringify(metrics));
})().catch(error => { console.error(error); process.exitCode = 1; });
