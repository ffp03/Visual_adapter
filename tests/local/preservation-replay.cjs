// Explicit development allowlist. Retained real candidates; zero new generation.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { JSDOM } = require('jsdom');
const core = require('../../extension/procedure-core');
const { page } = require('./harness.cjs');
const root = path.resolve(__dirname, '../..');
const allowed = ['books-product-a','books-product-b','github-readme-a','github-readme-b','gov-info-a','gov-info-b','hn-discussion-a','hn-discussion-b','mdn-form-b','mdn-table-a','python-news-a','python-news-b','quotes-js-a','quotes-js-b','w3c-article-a','w3c-article-b','wiki-html-a','wiki-xhtml-b'];
const names = process.argv.slice(2);
if (!names.length || names.some(name => !allowed.includes(name))) throw Error('Explicit development page arguments required');
const output = path.join(root, 'workspace/task023/preservation-v2/replay');
fs.mkdirSync(output, { recursive: true });
(async () => {
    const rows = [];
    for (const name of names) {
        const directory = path.join(root, 'workspace/task023/live-20261019', name);
        const source = fs.readFileSync(path.join(directory, 'source.html'), 'utf8');
        const candidate = JSON.parse(fs.readFileSync(path.join(directory, 'provider-rule.json'), 'utf8')).rule;
        const capture = JSON.parse(fs.readFileSync(path.join(directory, 'capture.json'), 'utf8'));
        const dom = new JSDOM(source, { url: capture.finalUrl || capture.url });
        const started = performance.now();
        let procedure, compileError;
        try { procedure = core.compile(dom.window.document, candidate); } catch (error) { compileError = error.message; }
        const compileMs = performance.now() - started;
        const instance = page(source, capture.finalUrl || capture.url, procedure ? [procedure] : [candidate]);
        const response = await instance.extract();
        const row = { name, provenance: 'retained-real-model-output-deterministic-compilation-no-new-generation', candidate, procedure, compileError, compileMs,
            htmlLength: response.html?.length, delivery: response.delivery, usedRule: response.usedRule, noFallback: response.noFallback,
            supplementation: response.supplementation, modelSelectionSuperseded: response.modelSelectionSuperseded,
            coverage: response.coverage, ruleRejectionDetail: response.ruleRejectionDetail, assessmentReferencesUsed: false };
        fs.writeFileSync(path.join(output, name + '.html'), response.html || '');
        fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify(row, null, 2));
        rows.push(row); instance.close(); dom.window.close();
        console.log(JSON.stringify({ name, compileMs: Math.round(compileMs), delivery: row.delivery, noFallback: row.noFallback, required: row.coverage?.required, retained: row.coverage?.retained, compileError }));
    }
    fs.writeFileSync(path.join(output, 'summary-' + names.join('_') + '.json'), JSON.stringify(rows, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
