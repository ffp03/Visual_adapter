// GET-only resubstitution on the SAME 18 development pages after admission.
// No example upload, no runner call, no new site request; frozen source required.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { chromium } = require('C:/Users/final/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { createLocalServer } = require('../../backend/local-ai.cjs');
const { startBackground } = require('./procedure-browser-test.cjs');
const root = path.resolve(__dirname, '../..'), old = path.join(root, 'workspace/task023/live-20261019');
const audit = path.join(root, 'workspace/task023/development-metric-audit');
const cold = path.join(root, 'workspace/task023/preservation-v2/admission-development-v10');
const output = path.join(cold, 'warm-get-only');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const frozen = read(path.join(cold, 'frozen-implementation.json')), manifest = read(path.join(audit, 'frozen-manifest.json'));
const verify = () => { for (const [file, expected] of Object.entries(frozen.files)) assert.equal(hash(fs.readFileSync(path.join(root, file))), expected, 'Source drift: ' + file); };
verify(); assert.equal(manifest.pages.length, 18);
const generic = fs.readFileSync(path.join(root, 'tests/local/holdout.cjs'), 'utf8');
const marker = 'const result=await pg.evaluate(', start = generic.indexOf(marker) + marker.length;
const scoringSource = generic.slice(start, generic.indexOf('},refs);', start) + 1); assert.equal(hash(scoringSource), frozen.scorerSha256);
const score = vm.runInNewContext('(' + scoringSource + ')');
fs.mkdirSync(output, { recursive: true });
if (fs.existsSync(path.join(output, 'summary.json'))) throw Error('Warm report already exists; preserve this result');
(async () => {
    let runnerInvocations = 0;
    const requests = [], server = createLocalServer({ directory: path.join(cold, 'private-replay-cache'), maxCalls: 1,
        runner: { provider: 'retained-real-candidate-replay', model: 'not-new-inference', async generate() { runnerInvocations++; throw Error('Warm replay must never invoke runner'); } } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const background = await startBackground('http://127.0.0.1:' + server.address().port, requests);
    const browser = await chromium.launch({ executablePath: 'C:/Users/final/AppData/Local/Chromium/Application/chrome.exe', headless: true });
    const results = [];
    try {
        for (const row of manifest.pages) {
            verify();
            const raw = fs.readFileSync(path.join(old, row.id, 'source.html'), 'utf8'); assert.equal(hash(raw), row.sourceSha256);
            const strictFile = path.join(audit, 'references', row.id + '.json'); assert.equal(hash(fs.readFileSync(strictFile)), row.referenceSha256);
            const strict = read(strictFile), legacy = read(path.join(old, row.id, 'references.json'));
            const page = await browser.newPage(), timer = setTimeout(() => page.close().catch(() => {}), 60000);
            try {
                await page.route('**/*', route => route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()
                    ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: raw.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '') }) : route.abort());
                await page.goto(row.finalUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.exposeFunction('__backgroundMessage', background);
                await page.evaluate(() => { window.__listeners = []; window.chrome.runtime = { sendMessage: request => window.__backgroundMessage(request), onMessage: { addListener: callback => window.__listeners.push(callback) } }; });
                for (const name of ['procedure-core.js', 'content.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'extension', name), 'utf8') });
                const measured = await page.evaluate(score, strict);
                const legacyOutcome = await page.evaluate(({ html, targets }) => {
                    const reader = document.createElement('div'); reader.innerHTML = html;
                    const norm = value => value.replace(/\s+/g, ' ').trim();
                    const outcomes = targets.map(target => ({ ...target, retained: [...reader.querySelectorAll(target.tag.toLowerCase())].some(node => (!target.elementId || node.id === target.elementId) && (/^H[1-6]$/.test(target.tag) ? norm(node.textContent).startsWith(target.text) : norm(node.textContent).includes(target.text))) }));
                    return { targets: outcomes, retained: outcomes.filter(target => target.retained).length, total: outcomes.length, complete: outcomes.every(target => target.retained) };
                }, { html: measured.out.html || '', targets: legacy.targets });
                const { html, analysisHTML, validationHTML, ...delivery } = measured.out;
                const result = { id: row.id, pair: row.pair, position: row.position, scorable: strict.scorable, sourceRevision: frozen,
                    strict: { ...measured, out: undefined, classification: !strict.scorable ? 'indeterminate' : measured.complete ? 'confirmed-success' : 'measured-failure', noFallbackPass: !!strict.scorable && measured.complete && !!delivery.noFallback }, legacy: legacyOutcome, delivery,
                    mode: 'warm-GET-only-development-resubstitution-same-admission-pages-not-unseen-performance', engine: browser.version() };
                fs.writeFileSync(path.join(output, row.id + '.html'), html || ''); fs.writeFileSync(path.join(output, row.id + '.json'), JSON.stringify(result, null, 2)); results.push(result);
                assert.equal(legacyOutcome.retained, legacyOutcome.total, 'Warm reading output lost legacy anchors: ' + row.id);
                console.log(JSON.stringify({ id: row.id, delivery: delivery.delivery, legacy: legacyOutcome.retained + '/' + legacyOutcome.total, strict: result.strict.classification }));
            } finally { clearTimeout(timer); await page.close().catch(() => {}); }
        }
        assert.equal(requests.length, 0, 'Unexpected POST during GET-only replay'); assert.equal(runnerInvocations, 0); verify();
        const pairs = [...new Set(results.map(row => row.pair))].map(pair => results.filter(row => row.pair === pair));
        const summary = { fixedPages: 18, fixedSites: 9, measuredPages: results.length,
            admittedDeliveryPages: results.filter(row => row.delivery.procedureDelivered).length, admittedBothPagesSites: pairs.filter(rows => rows.length === 2 && rows.every(row => row.delivery.procedureDelivered)).length,
            fallbackDeliveryPages: results.filter(row => !row.delivery.ruleApplied).length,
            legacy: { anchors: results.reduce((n, row) => n + row.legacy.total, 0), retained: results.reduce((n, row) => n + row.legacy.retained, 0), completePages: results.filter(row => row.legacy.complete).length },
            strict: { confirmedSuccess: results.filter(row => row.strict.classification === 'confirmed-success').length, measuredFailure: results.filter(row => row.strict.classification === 'measured-failure').length,
                indeterminate: results.filter(row => !row.scorable).map(row => row.id), noFallbackPages: results.filter(row => row.strict.noFallbackPass).length,
                sites: { confirmedSuccess: pairs.filter(rows => rows.length === 2 && rows.every(row => row.strict.classification === 'confirmed-success')).length, measuredFailure: pairs.filter(rows => rows.every(row => row.scorable) && rows.some(row => row.strict.classification === 'measured-failure')).length, indeterminate: pairs.filter(rows => rows.some(row => !row.scorable)).length, noFallback: pairs.filter(rows => rows.length === 2 && rows.every(row => row.strict.noFallbackPass)).length } },
            exampleUploads: 0, runnerInvocations, newProviderAPIRequests: 0, liveSiteRequests: 0, sourceRevision: frozen, results,
            caveat: 'Both pages participated in admission attempts. Warm results are development resubstitution, never unseen performance.' };
        fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2)); console.log(JSON.stringify({ ...summary, results: undefined, sourceRevision: undefined }));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
