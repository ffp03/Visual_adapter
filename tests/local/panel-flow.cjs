// Exercise production sidepanel callback and verification payload, without browser/network services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { root, sourceFile } = require('./harness.cjs');
async function run(analysis, verificationOverride = {}, initialOverride = {}) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'extension/sidepanel.html'), 'utf8'), {
        url: 'https://extension.invalid', runScripts: 'outside-only', virtualConsole: new VirtualConsole()
    });
    const messages = [], timers = [], extracts = [];
    const rawHTML = '<html><body><nav>Original navigation</nav><main><p>Rule content</p></main></body></html>';
    const html = '<p>Rule content</p>';
    const pageContext = { hostname: 'example.org', url: 'https://example.org/article' };
    dom.window.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return 1; };
    dom.window.chrome = {
        storage: { sync: { get: async () => ({ fontSize: 20, theme: 'black-white' }), set() {} } },
        scripting: { executeScript: async () => {} },
        tabs: { query: (query, cb) => cb ? cb([{ id: 1 }]) : Promise.resolve([{ id: 1 }]),
            sendMessage: (id, request, cb) => { extracts.push(request); cb(request.includeRawHTML ? { ...pageContext, html, rawHTML, usedRule: true, ...verificationOverride } : { ...pageContext, html: '<p>Local fallback</p>', usedRule: false, ...initialOverride }); } },
        runtime: { onMessage: { addListener() {} }, sendMessage: (message, cb) => { messages.push(message); if (cb) cb(analysis); } }
    };
    dom.window.eval(fs.readFileSync(sourceFile('extension/sidepanel.js'), 'utf8'));
    for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
    return { dom, messages, timers, extracts, rawHTML, html };
}
(async () => {
    const results = [];
    async function test(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (e) { results.push({ name, passed: false, error: e.message }); } }
    await test('generated backend rule verifies original DOM against actual rule output', async () => {
        const r = await run({ success: true, source: 'backend', rule: { name: 'new', main: 'main' } });
        try {
            const verify = r.messages.find(m => m.action === 'TRIGGER_VERIFICATION');
            assert.ok(verify, 'verification message missing');
            assert.equal(verify.rawHTML, r.rawHTML); assert.equal(verify.extractedHTML, r.html);
            assert.doesNotMatch(verify.extractedHTML, /analysis-banner|Local fallback/);
            assert.equal(r.extracts.filter(e => e.includeRawHTML).length, 1);
        } finally { r.dom.window.close(); }
    });
    for (const changedPage of [
        { hostname: 'other.example', url: 'https://other.example/private' },
        { url: 'https://example.org/different-article' },
        { rawHTML: undefined, verificationContextUnavailable: 'complete-body-exceeds-verifier-bound' }
    ]) {
        await test('verification skips stale-page or unavailable original context: ' + JSON.stringify(changedPage), async () => {
            const r = await run({ success: true, source: 'backend', rule: { name: 'new', main: 'main' } }, changedPage);
            try { assert.equal(r.messages.filter(m => m.action === 'TRIGGER_VERIFICATION').length, 0); }
            finally { r.dom.window.close(); }
        });
    }
    for (const analysis of [{ success: false, status: 'fallback' }, { success: false, error: 'offline' }, undefined]) {
        await test(`fallback remains visible and schedules no refresh: ${JSON.stringify(analysis)}`, async () => {
            const r = await run(analysis);
            try {
                assert.match(r.dom.window.document.getElementById('reader-view').textContent, /Local fallback/);
                assert.equal(r.timers.length, 0); assert.equal(r.messages.filter(m => m.action === 'TRIGGER_VERIFICATION').length, 0);
            } finally { r.dom.window.close(); }
        });
    }
    await test('supplemented procedure is kept without analysis or refresh loop', async () => {
        const r = await run({ success: true, rule: { name: 'cached' } }, {}, { html: '<p>Preserved reading view</p>', usedRule: false, ruleApplied: true, procedureDelivered: true, supplementation: true, noFallback: false });
        try {
            assert.match(r.dom.window.document.getElementById('reader-view').textContent, /Preserved reading view/);
            assert.equal(r.messages.filter(message => message.action === 'ANALYZE_PAGE').length, 0);
            assert.equal(r.timers.length, 0);
            assert.equal(r.extracts.length, 1);
        } finally { r.dom.window.close(); }
    });
    await test('local provisional response keeps basic view without refresh or polling', async () => {
        const r = await run({ success: false, protocol: 2, status: 'pending', admission: 'provisional', reason: 'second-distinct-valid-example-required' });
        try {
            assert.equal(r.messages.filter(message => message.action === 'ANALYZE_PAGE').length, 1);
            assert.equal(r.timers.length, 0);
            assert.match(r.dom.window.document.getElementById('reader-view').textContent, /Local fallback/);
            assert.match(r.dom.window.document.getElementById('analysis-banner').textContent, /second compatible page/);
        } finally { r.dom.window.close(); }
    });
    await test('local lookup outage keeps basic view without analysis message', async () => {
        const r = await run(undefined, {}, { localProtocol: 2, lookupAvailable: false });
        try { assert.equal(r.messages.length, 0); assert.equal(r.timers.length, 0); assert.match(r.dom.window.document.getElementById('reader-view').textContent, /Local fallback/); } finally { r.dom.window.close(); }
    });
    await test('legacy server cached delivery sends no analysis and schedules no refresh', async () => {
        const r = await run(undefined, {}, { localProtocol: 1, usedRule: true, html: '<p>Legacy cached reading view</p>' });
        try { assert.equal(r.messages.length, 0); assert.equal(r.timers.length, 0); assert.match(r.dom.window.document.getElementById('reader-view').textContent, /Legacy cached reading view/); } finally { r.dom.window.close(); }
    });
    console.log(JSON.stringify({ results }, null, 2));
    if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ results }, null, 2));
    if (results.some(r => !r.passed)) process.exitCode = 1;
})();
