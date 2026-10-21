// One explicitly approved large development capture; no references/candidates.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { JSDOM } = require('jsdom');
const core = require('../../extension/procedure-core');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'workspace/task023/live-20261019/wiki-html-a/source.html'), 'utf8');
const started = performance.now();
const dom = new JSDOM(source, { url: 'https://example.test/article' });
const parsed = performance.now();
const inventory = core.inspect(dom.window.document);
const inspected = performance.now();
const output = core.fallback(dom.window.document);
const result = { developmentPage: 'wiki-html-a', bytes: Buffer.byteLength(source), parseMs: parsed - started,
    inspectMs: inspected - parsed, fallbackAndAssessMs: performance.now() - inspected,
    requiredRoles: inventory.roles.length, coverage: output.coverage,
    scope: 'local-DOM-only-development-capture-performance-no-reference-input', hardProcessTimeoutMs: 120000 };
fs.writeFileSync(path.join(root, 'workspace/task023/preservation-v2/wiki-performance.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, coverage: { required: output.coverage.required, retained: output.coverage.retained, accepted: output.coverage.accepted } }));
dom.window.close();
