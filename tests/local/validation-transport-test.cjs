const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { gzipSync } = require('node:zlib');
const { randomBytes, createHash, webcrypto } = require('node:crypto');
const { once } = require('node:events');
const { decodeValidation, limits } = require('../../backend/validation-transport.cjs');
const root = path.resolve(__dirname, '../..');
const scratch = path.join(root, 'workspace/task023/archive/2026-10-21-compressed-validation/tests');
fs.mkdirSync(scratch, { recursive: true });
const packet = (html, bytes = gzipSync(Buffer.from(html))) => ({ validationComplete: true, validationTransport: { encoding: limits.encoding, data: bytes.toString('base64'), decodedBytes: Buffer.byteLength(html) } });
function background(endpoint, captures) {
    const listeners = [];
    const context = vm.createContext({ URL, TextEncoder, crypto: webcrypto, console: { log() {}, warn() {}, error() {} },
        createRuleService: () => ({ protocol: 2 }), getBackendURL: () => endpoint,
        chrome: { sidePanel: { setPanelBehavior: async () => {} }, tabs: { create() {} }, runtime: { onInstalled: { addListener() {} }, onMessage: { addListener: fn => listeners.push(fn) } } },
        fetch: async (url, options) => { captures.push(JSON.parse(options.body)); return fetch(url, options); } });
    vm.runInContext(fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8').replace(/^import .*;\r?\n/gm, ''), context);
    return data => new Promise(resolve => listeners[0]({ action: 'ANALYZE_PAGE', context: data }, {}, resolve));
}
function malformedCases() {
    const valid = packet('<body><main><p>Reading</p></main></body>');
    const clone = () => structuredClone(valid), cases = [];
    let value = clone(); value.validationTransport.data = '!'; cases.push(value);
    value = clone(); value.validationTransport.data = 'YR=='; cases.push(value);
    value = clone(); delete value.validationTransport.decodedBytes; cases.push(value);
    value = clone(); value.validationTransport.decodedBytes--; cases.push(value);
    value = clone(); const corrupt = Buffer.from(value.validationTransport.data, 'base64'); corrupt[corrupt.length - 8] ^= 1; value.validationTransport.data = corrupt.toString('base64'); cases.push(value);
    value = clone(); value.validationTransport.data = Buffer.from('not gzip').toString('base64'); cases.push(value);
    value = clone(); value.validationTransport.data = randomBytes(limits.compressedBytes + 1).toString('base64'); cases.push(value);
    value = clone(); value.validationTransport.decodedBytes = limits.decodedBytes + 1; cases.push(value);
    value = packet('x'.repeat(150000)); cases.push(value);
    value = clone(); value.validationHTML = '<body>Ambiguous</body>'; cases.push(value);
    value = clone(); value.validationHTML = null; cases.push(value);
    value = clone(); value.validationTransport.encoding = 'arbitrary'; cases.push(value);
    value = packet('x', gzipSync(Buffer.from([255]))); cases.push(value);
    const overflow = Buffer.concat([randomBytes(20000), Buffer.alloc(limits.decodedBytes - 19999, 120)]);
    value = packet('x', gzipSync(overflow)); value.validationTransport.decodedBytes = limits.decodedBytes; cases.push(value);
    return cases;
}
test('strict decoding preserves exact full context and retains legacy100k behavior', () => {
    const html = '<body class="source"><main><pre>  exact\n  code</pre><a href="https://example.test/path">Reading</a></main></body>';
    assert.equal(decodeValidation(packet(html)).html, html);
    assert.equal(decodeValidation(packet('\ufeff' + html)).html, '\ufeff' + html);
    assert.equal(decodeValidation({ validationComplete: true, validationHTML: html }).html, html);
    assert.equal(decodeValidation({ validationComplete: false }), null);
    assert.throws(() => decodeValidation({ validationComplete: true, validationHTML: 'x'.repeat(100001) }), /100k/);
    for (const value of malformedCases()) assert.throws(() => decodeValidation(value));
});
test('all malformed transports are rejected before any generation call', async t => {
    const { createLocalServer } = require('../../backend/local-ai.cjs');
    let calls = 0;
    const directory = fs.mkdtempSync(path.join(scratch, 'reject-'));
    const server = createLocalServer({ directory, runner: { provider: 'fake', model: 'transport', generate: async () => { calls++; throw Error('must not run'); } } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)));
    for (const value of malformedCases()) {
        const response = await fetch('http://127.0.0.1:' + server.address().port + '/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ protocol: 2, hostname: 'example.org', html: '<main>Analysis</main>', exampleKey: 'a'.repeat(64), ...value }) });
        assert.equal((await response.json()).success, false);
    }
    assert.equal(calls, 0);
});
test('native CompressionStream through actual content/background/server admits two large full contexts with one fake generation', { timeout: 90000 }, async t => {
    const { chromium } = require('C:/Users/final/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
    const { createLocalServer } = require('../../backend/local-ai.cjs');
    const modelInputs = [], requests = [];
    const directory = fs.mkdtempSync(path.join(scratch, 'native-'));
    const server = createLocalServer({ directory, runner: { provider: 'fake', model: 'transport', generate: async (html, evidence) => { modelInputs.push({ html, evidence }); return { rule: { main: 'main', exclude: [], name: 'Synthetic reading' } }; } } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)));
    const analyze = background('http://127.0.0.1:' + server.address().port, requests);
    const browser = await chromium.launch({ executablePath: 'C:/Users/final/AppData/Local/Chromium/Application/chrome.exe', headless: true });
    t.after(() => browser.close());
    const core = fs.readFileSync(path.join(root, 'extension/procedure-core.js'), 'utf8').replace('return { validationLimits,', 'return { __clean: clean, validationLimits,');
    let admitted;
    for (const identity of ['first', 'second']) {
        const page = await browser.newPage();
        try {
            const text = randomBytes(92000).toString('base64');
            const html = '<body class=source><h1>Outside ' + identity + '</h1><main id=reading><pre>  exact  code\n' + text + '</pre><math aria-label="Readable expression"><mi mathvariant="bold">x</mi><mo>=</mo><mn>2</mn></math><p id=target>Reading <a href="#target">Jump</a><a href="relative">Link</a><img src="image.png" alt="Meaningful"></p><div class=collision></div><input value="FORM_SECRET"><textarea>PRIVATE_VALUE</textarea></main><aside><div class=collision></div></aside></body>';
            await page.route('**/*', route => route.request().isNavigationRequest() && route.request().frame() === page.mainFrame() ? route.fulfill({ status: 200, contentType: 'text/html', body: html }) : route.abort());
            await page.goto('https://example.org/path/' + identity, { waitUntil: 'domcontentloaded', timeout: 12000 });
            await page.addScriptTag({ content: core });
            await page.evaluate(() => { window.__listeners = []; window.chrome = { runtime: { sendMessage: async () => ({ protocol: 2, lookupAvailable: true, rules: [] }), onMessage: { addListener: fn => window.__listeners.push(fn) } } }; });
            await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8') });
            const result = await page.evaluate(async () => ({ context: await new Promise(resolve => window.__listeners[0]({ action: 'EXTRACT_CONTEXT' }, {}, resolve)), expected: PreservationCore.__clean(document.body, document, true).outerHTML }));
            const context = result.context; assert.equal(context.validationComplete, true); assert(context.validationTransport); assert.equal(context.validationHTML, undefined);
            assert.equal(decodeValidation(context).html, result.expected); assert(result.expected.length > 100000); assert(!result.expected.includes('FORM_SECRET')); assert(!result.expected.includes('PRIVATE_VALUE'));
            assert(result.expected.includes('mathvariant="bold"'));
            const response = await analyze(context); assert.equal(response.status, identity === 'first' ? 'pending' : 'admitted'); if (response.rule) admitted = response.rule;
            assert.equal(modelInputs.length, 1); assert(modelInputs[0].html.length <= 12000); assert(!modelInputs[0].html.includes(text));
            if (admitted) {
                const applied = await page.evaluate(procedure => ({ result: PreservationCore.apply(document, procedure), collisions: PreservationCore.matches(document, '.collision').length }), admitted);
                assert.equal(applied.result.accepted, true); assert.equal(applied.collisions, 2); assert(applied.result.html.includes('https://example.org/path/relative')); assert(applied.result.html.includes('  exact  code\n'));
            }
            if (identity === 'second') {
                const unicode = await page.evaluate(async () => {
                    const bytes = new Uint8Array(90000);
                    for (let offset = 0; offset < bytes.length; offset += 65536) crypto.getRandomValues(bytes.subarray(offset, offset + 65536));
                    document.querySelector('pre').textContent = [...bytes].map(value => String.fromCharCode(0x4e00 + value % 64)).join('');
                    return { context: await new Promise(resolve => window.__listeners[0]({ action: 'EXTRACT_CONTEXT' }, {}, resolve)), expected: PreservationCore.__clean(document.body, document, true).outerHTML };
                });
                assert(unicode.expected.length < 100000); assert(Buffer.byteLength(unicode.expected) > 262144);
                assert.equal(unicode.context.validationComplete, true); assert(unicode.context.validationTransport); assert.equal(unicode.context.validationHTML, undefined);
                assert.equal(decodeValidation(unicode.context).html, unicode.expected);
                assert.equal((await analyze(unicode.context)).status, 'admitted'); assert.equal(modelInputs.length, 1);
                const unavailable = await page.evaluate(async () => { window.__compressionStream = window.CompressionStream; window.CompressionStream = undefined; return PreservationCore.prepareValidationContext(document); });
                assert.equal(unavailable.validationComplete, false); assert.equal(unavailable.validationLimitation, 'complete-context-compression-unavailable');
                const small = await page.evaluate(async () => { document.querySelector('pre').textContent = 'Small complete reading document'; return PreservationCore.prepareValidationContext(document); });
                assert.equal(small.validationComplete, true); assert(small.validationHTML); assert.equal(small.validationTransport, undefined);
                const clientLimits = await page.evaluate(async () => {
                    window.CompressionStream = window.__compressionStream;
                    const code = document.querySelector('pre'), results = [];
                    code.textContent = 'x'.repeat(1048577); results.push(await PreservationCore.prepareValidationContext(document));
                    code.textContent = 'x'.repeat(130000); results.push(await PreservationCore.prepareValidationContext(document));
                    const bytes = new Uint8Array(210000); for (let offset = 0; offset < bytes.length; offset += 65536) crypto.getRandomValues(bytes.subarray(offset, offset + 65536));
                    code.textContent = [...bytes].map(value => String.fromCharCode(33 + value % 90)).join(''); results.push(await PreservationCore.prepareValidationContext(document));
                    return results.map(value => ({ complete: value.validationComplete, reason: value.validationLimitation, hasHTML: !!value.validationHTML, hasTransport: !!value.validationTransport }));
                });
                assert.deepEqual(clientLimits.map(value => value.reason), ['complete-sanitized-body-exceeds-decoded-byte-bound', 'complete-context-exceeds-expansion-ratio', 'complete-context-exceeds-compressed-byte-bound']);
                assert(clientLimits.every(value => !value.complete && !value.hasHTML && !value.hasTransport));
            }
        } finally { await page.close(); }
    }
    assert.equal(requests.length, 3); for (const request of requests) { assert.equal(request.validationHTML, undefined); assert(request.validationTransport); assert(Buffer.byteLength(JSON.stringify(request)) <= 262144); }
    const listed = await (await fetch('http://127.0.0.1:' + server.address().port + '/rules/example.org?protocol=2')).json(); assert.equal(listed.rules.length, 1);
});
