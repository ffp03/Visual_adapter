// Fixed 18-page development replay through the production local v2 route.
// The runner returns retained historical candidates; no generation/API is invoked.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { chromium } = require('C:/Users/final/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { createLocalServer } = require('../../backend/local-ai.cjs');
const { startBackground } = require('./procedure-browser-test.cjs');
const root = path.resolve(__dirname, '../..'), old = path.join(root, 'workspace/task023/live-20261019');
const audit = path.join(root, 'workspace/task023/development-metric-audit');
const output = path.join(root, 'workspace/task023/preservation-v2/admission-development-v10');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = read(path.join(audit, 'frozen-manifest.json'));
assert.equal(manifest.pages.length, 18); assert.equal(manifest.fixedSites, 9);
const generic = fs.readFileSync(path.join(root, 'tests/local/holdout.cjs'), 'utf8');
const marker = 'const result=await pg.evaluate(', start = generic.indexOf(marker) + marker.length;
const scoringSource = generic.slice(start, generic.indexOf('},refs);', start) + 1);
assert.equal(hash(scoringSource), manifest.scoringFunctionSha256);
const score = vm.runInNewContext('(' + scoringSource + ')');
const files = ['extension/procedure-core.js','extension/content.js','extension/background.js','extension/rule-service.js','extension/sidepanel.js','extension/manifest.json','backend/local-ai.cjs','backend/procedure-families.cjs','backend/deepseek-runner.cjs','backend/codex-runner.cjs'];
fs.mkdirSync(output, { recursive: true });
if (fs.existsSync(path.join(output, 'frozen-implementation.json'))) throw Error('Use a new output folder for another revision');
const frozen = { frozenAt: new Date().toISOString(), sourceBranch: 'codex/preservation-adaptation', protocol: 2, files: Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(root, file)))])), scorerSha256: hash(scoringSource), referenceManifestSha256: hash(fs.readFileSync(path.join(audit, 'frozen-manifest.json'))) };
fs.writeFileSync(path.join(output, 'frozen-implementation.json'), JSON.stringify(frozen, null, 2));
fs.mkdirSync(path.join(output, 'source-snapshot'), { recursive: true });
for (const file of files) fs.writeFileSync(path.join(output, 'source-snapshot', file.replaceAll('/', '_')), fs.readFileSync(path.join(root, file)));
const verify = () => { for (const [file, expected] of Object.entries(frozen.files)) assert.equal(hash(fs.readFileSync(path.join(root, file))), expected, 'Implementation drift: ' + file); };
(async () => {
    let current, invocations = [];
    const server = createLocalServer({ directory: path.join(output, 'private-replay-cache'), maxCalls: 20,
        runner: { provider: 'retained-real-candidate-replay', model: 'not-new-inference', async generate(input) {
            assert(current); assert(input.length <= 30000);
            invocations.push({ developmentPage: current.id, originalProviderRequestId: current.saved.requestId, analysisCharacters: input.length, newGeneration: false });
            return { rule: current.saved.rule, requestId: 'historical-replay:' + current.saved.requestId, usage: null };
        } } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const requests = [], endpoint = 'http://127.0.0.1:' + server.address().port;
    const background = await startBackground(endpoint, requests);
    const browser = await chromium.launch({ executablePath: 'C:/Users/final/AppData/Local/Chromium/Application/chrome.exe', headless: true });
    const results = [];
    try {
        for (const row of manifest.pages) {
            verify();
            const directory = path.join(old, row.id), raw = fs.readFileSync(path.join(directory, 'source.html'), 'utf8');
            assert.equal(hash(raw), row.sourceSha256);
            const referenceFile = path.join(audit, 'references', row.id + '.json'); assert.equal(hash(fs.readFileSync(referenceFile)), row.referenceSha256);
            const strict = read(referenceFile), legacy = read(path.join(directory, 'references.json'));
            current = { id: row.id, saved: read(path.join(directory, 'provider-rule.json')) };
            const page = await browser.newPage(), timer = setTimeout(() => page.close().catch(() => {}), 60000);
            try {
                await page.route('**/*', route => route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()
                    ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: raw.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '') }) : route.abort());
                await page.goto(row.finalUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.exposeFunction('__backgroundMessage', background);
                await page.evaluate(() => { window.__listeners = []; window.chrome.runtime = { sendMessage: request => window.__backgroundMessage(request), onMessage: { addListener: callback => window.__listeners.push(callback) } }; });
                for (const name of ['procedure-core.js', 'content.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'extension', name), 'utf8') });
                const initial = await page.evaluate(() => new Promise(resolve => window.__listeners[0]({ action: 'EXTRACT_CONTEXT' }, {}, resolve)));
                const before = invocations.length;
                const analysis = initial.procedureDelivered ? { success: true, status: 'already-delivered' } : await background({ action: 'ANALYZE_PAGE', context: initial });
                const measured = await page.evaluate(score, strict);
                const legacyOutcome = await page.evaluate(({ html, targets }) => {
                    const reader = document.createElement('div'); reader.innerHTML = html;
                    const norm = value => value.replace(/\s+/g, ' ').trim();
                    const outcomes = targets.map(target => ({ ...target, retained: [...reader.querySelectorAll(target.tag.toLowerCase())].some(node => (!target.elementId || node.id === target.elementId) && (/^H[1-6]$/.test(target.tag) ? norm(node.textContent).startsWith(target.text) : norm(node.textContent).includes(target.text))) }));
                    return { targets: outcomes, retained: outcomes.filter(target => target.retained).length, total: outcomes.length, complete: outcomes.every(target => target.retained) };
                }, { html: measured.out.html || '', targets: legacy.targets });
                const { html, analysisHTML, validationHTML, ...delivery } = measured.out;
                const result = { id: row.id, pair: row.pair, position: row.position, sourceSha256: row.sourceSha256, referenceSha256: row.referenceSha256,
                    sourceRevision: frozen, mode: 'real-isolated-Chromium-production-local-route-retained-candidate-replay-messaging-double',
                    initial: { usedRule: initial.usedRule, completeContext: initial.validationComplete, limitation: initial.validationLimitation, validationCharacters: initial.validationHTML?.length, ruleFailure: initial.ruleFailure },
                    admission: analysis, replayRunnerInvocations: invocations.length - before, newProviderAPIRequests: 0,
                    scorable: strict.scorable, strict: { ...measured, out: undefined, classification: !strict.scorable ? 'indeterminate' : measured.complete ? 'confirmed-success' : 'measured-failure', noFallbackPass: !!strict.scorable && measured.complete && !!delivery.noFallback },
                    legacy: legacyOutcome, delivery, engine: browser.version() };
                fs.writeFileSync(path.join(output, row.id + '.html'), html || '');
                fs.writeFileSync(path.join(output, row.id + '.json'), JSON.stringify(result, null, 2)); results.push(result);
                if (!delivery.ruleApplied) assert.equal(legacyOutcome.retained, legacyOutcome.total, 'Fallback lost existing anchors: ' + row.id);
                console.log(JSON.stringify({ id: row.id, admission: analysis.status, reason: analysis.reason || analysis.error, completeContext: initial.validationComplete, runnerInvocations: invocations.length - before, delivery: delivery.delivery, legacy: legacyOutcome.retained + '/' + legacyOutcome.total, strict: result.strict.classification }));
            } finally { clearTimeout(timer); await page.close().catch(() => {}); }
        }
        verify();
        const pairs = [...new Set(results.map(row => row.pair))].map(pair => results.filter(row => row.pair === pair));
        const summary = { fixedPages: 18, fixedSites: 9, measuredPages: results.length,
            admittedDeliveryPages: results.filter(row => row.delivery.procedureDelivered).length, fallbackDeliveryPages: results.filter(row => !row.delivery.ruleApplied).length,
            provisionalPages: results.filter(row => row.admission.status === 'pending').length, rejectedOrFailedPages: results.filter(row => row.admission.status === 'fallback').length,
            legacy: { totalAnchors: results.reduce((n, row) => n + row.legacy.total, 0), retainedAnchors: results.reduce((n, row) => n + row.legacy.retained, 0), completePages: results.filter(row => row.legacy.complete).length },
            strict: { confirmedSuccess: results.filter(row => row.strict.classification === 'confirmed-success').length, measuredFailure: results.filter(row => row.strict.classification === 'measured-failure').length, indeterminate: results.filter(row => !row.scorable).map(row => row.id), noFallbackPages: results.filter(row => row.strict.noFallbackPass).length,
                sites: { confirmedSuccess: pairs.filter(rows => rows.length === 2 && rows.every(row => row.strict.classification === 'confirmed-success')).length, measuredFailure: pairs.filter(rows => rows.every(row => row.scorable) && rows.some(row => row.strict.classification === 'measured-failure')).length, indeterminate: pairs.filter(rows => rows.some(row => !row.scorable)).length, noFallback: pairs.filter(rows => rows.length === 2 && rows.every(row => row.strict.noFallbackPass)).length } },
            replayRunnerInvocations: invocations, newGenerationCalls: 0, newProviderAPIRequests: 0, liveSiteRequests: 0,
            implementation: frozen, results, caveats: ['First-page provisional fallback is retained in these outcomes; seed pages are not retroactively relabeled after admission.', 'Complete context means bounded client-sanitized reading DOM, not whole webpage or trusted attestation.', 'Historical candidates are replayed; this is not new generation or unseen performance.'] };
        fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
        console.log(JSON.stringify({ ...summary, results: undefined, implementation: undefined, replayRunnerInvocations: invocations.length }));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
