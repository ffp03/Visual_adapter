const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { page, background, root, sourceFile } = require('./harness.cjs');
(async () => {
    const results = [];
    async function check(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (e) { results.push({ name, passed: false, error: e.message }); } }
    const html = '<!doctype html><html><head><title>Reference</title></head><body><nav>Navigation</nav><main><h1>Heading</h1><p>Retained content</p></main></body></html>';
    await check('missing rule displays local fallback; one failed mocked analyze request', async () => {
        const p = page(html); const out = await p.extract(); p.close();
        assert.equal(out.usedRule, false); assert.match(out.html, /Retained content/);
        const b = background({ fail: true }); const res = await b.analyze(out);
        assert.equal(res.success, false); assert.equal(b.calls.length, 1);
    });
    await check('stale selector stops cache reapplication without provider retry', async () => {
        const rule = { main: '#gone', name: 'stale' }; const p = page(html, undefined, [rule]);
        const out = await p.extract(); p.close(); assert.equal(out.usedRule, false); assert.match(out.html, /Retained content/);
        const b = background({ rule }); const res = await b.analyze(out);
        assert.equal(res.success, false); assert.equal(res.status, 'fallback'); assert.equal(b.calls.length, 0);
    });
    await check('invalid selector returns safe fallback', async () => {
        const p = page(html, undefined, [{ main: '[broken', name: 'invalid' }]); const out = await p.extract(); p.close();
        assert.equal(out.usedRule, false); assert.match(out.html, /Retained content/);
    });
    await check('cache failure resolves null; fallback remains and mocked analysis can be attempted', async () => {
        const p = page(html, undefined, [], { failCache: true }); const out = await p.extract(); p.close();
        assert.equal(out.usedRule, false); assert.equal(!!out.ruleFailure, false); assert.match(out.html, /Retained content/);
        const b = background({ failCache: true, fail: true }); const res = await b.analyze(out);
        assert.equal(res.success, false); assert.match(res.error, /offline/); assert.equal(b.calls.length, 1);
    });
    await check('matching shared rule uses production caller', async () => {
        const p = page(html, undefined, [{ main: 'main', name: 'shared' }]); const out = await p.extract(); p.close();
        assert.equal(out.usedRule, true); assert.match(out.html, /Retained content/); assert.doesNotMatch(out.html, /Navigation/);
    });
    await check('raw verification context is original DOM, not extracted fragment', async () => {
        const p = page(html); const out = await p.extract({ action: 'EXTRACT_CONTEXT', includeRawHTML: true }); p.close();
        assert.match(out.rawHTML || '', /<nav>Navigation<\/nav>/); assert.doesNotMatch(out.html, /Navigation/);
    });
    await check('oversized original body is not truncated into a misleading verification sample', async () => {
        const p = page(html + '<p>' + 'x'.repeat(12000) + '</p>');
        try {
            const normal = await p.extract(); assert.equal(normal.rawHTML, undefined);
            const verification = await p.extract({ action: 'EXTRACT_CONTEXT', includeRawHTML: true });
            assert.equal(verification.rawHTML, undefined);
            assert.equal(verification.verificationContextUnavailable, 'complete-body-exceeds-verifier-bound');
        } finally { p.close(); }
    });
    await check('a large head cannot replace the original article in verification context', async () => {
        const p = page('<html><head><script>' + 'x'.repeat(12000) + '</script></head><body><main><h1>Article</h1><p>Retained original article</p></main></body></html>');
        try {
            const out = await p.extract({ action: 'EXTRACT_CONTEXT', includeRawHTML: true });
            assert.match(out.rawHTML, /Retained original article/);
            assert.doesNotMatch(out.rawHTML, /<head>|<script>/);
            assert.ok(out.rawHTML.length <= 5000);
        } finally { p.close(); }
    });
    await check('new backend source matches verification trigger', async () => {
        const b = background(); const res = await b.analyze({ hostname: 'example.org', html });
        const panel = fs.readFileSync(sourceFile('extension/sidepanel.js'), 'utf8');
        assert.ok(panel.includes(`res.source === '${res.source}'`)); assert.equal(b.calls.length, 1);
    });
    console.log(JSON.stringify({ mode: 'local provider doubles; no quality inference', results }, null, 2));
    if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ results }, null, 2));
    if (results.some(r => !r.passed)) process.exitCode = 1;
})();
