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
    await check('a product summary rule cannot discard the substantive description', async () => {
        const description = 'A complete product description with useful details. '.repeat(8);
        const p = page(`<article class="product"><div class="summary"><h1>Product</h1><p>Price</p></div><section><p>${description}</p></section></article>`, undefined, [{ main: '.summary', exclude: [], name: 'narrow' }]);
        try {
            const out = await p.extract(); assert.equal(out.usedRule, false); assert.equal(out.ruleRejected, 'substantive-content-loss');
            assert.ok(out.html.includes(description)); assert.match(out.analysisHTML, /^<article class="product">/);
        } finally { p.close(); }
    });
    await check('long reading output remains complete while model context is bounded', async () => {
        const p = page('<main id="long-article"><h1>Long article</h1><p>' + 'Useful text. '.repeat(10000) + '</p><p>ENDING CONTENT MUST REMAIN</p></main>');
        try {
            const out = await p.extract(); assert.ok(out.html.length > 50000); assert.match(out.html, /ENDING CONTENT MUST REMAIN/);
            assert.ok(out.analysisHTML.length <= 60000); assert.match(out.analysisHTML, /^<main id="long-article">/);
        } finally { p.close(); }
    });
    await check('site branding outside a generic body does not reject a complete content rule', async () => {
        const text = 'A useful content paragraph that should stay visible to the reader. '.repeat(4);
        const p = page(`<body><header><h1>Site Brand</h1></header><div class="cards"><p>${text}</p></div></body>`, undefined, [{ main: '.cards', exclude: [], name: 'cards' }]);
        try { const out = await p.extract(); assert.equal(out.usedRule, true); assert.ok(out.html.includes(text)); assert.equal(out.analysisHTML, undefined); }
        finally { p.close(); }
    });
    await check('a summary-only rule cannot silently discard substantive code and table content', async () => {
        const p = page('<main><section class="summary"><h1>Reference</h1><p>' + 'Introduction text. '.repeat(8)
            + '</p></section><pre>' + 'const example = 1;\n'.repeat(20) + '</pre><table><tr><td>' + 'Important table data. '.repeat(20)
            + '</td></tr></table></main>', undefined, [{ main: '.summary', exclude: [], name: 'narrow' }]);
        try { const out = await p.extract(); assert.equal(out.usedRule, false); assert.match(out.html, /Important table data/); assert.match(out.html, /const example/); }
        finally { p.close(); }
    });
    await check('table rules retain the table wrapper and cell structure in the reading view', async () => {
        const p = page('<body><table id="data"><tr><th>Header</th></tr><tr><td>' + 'Useful table data. '.repeat(8) + '</td></tr></table></body>', undefined, [{ main: '#data', exclude: [], name: 'Table' }]);
        try { const out = await p.extract(); const reader = p.dom.window.document.createElement('div'); reader.innerHTML = out.html;
            assert.equal(out.usedRule, true); assert.equal(reader.querySelectorAll('table').length, 1); assert.equal(reader.querySelectorAll('tr').length, 2);
        } finally { p.close(); }
    });
    await check('navigation articles cannot replace main content and source DOM is preserved', async () => {
        const p = page('<html><head><style>body { color: blue; }</style></head><body><nav><article>Navigation teaser</article></nav><main id="actual"><h1>Main story</h1><p>Useful article body</p></main></body></html>');
        try { const out = await p.extract(); assert.match(out.html, /Useful article body/); assert.doesNotMatch(out.html, /Navigation teaser/);
            assert.ok(p.dom.window.document.querySelector('nav article')); assert.ok(p.dom.window.document.querySelector('head style'));
        } finally { p.close(); }
    });
    await check('cached rules also remove scripts and navigation clutter', async () => {
        const p = page('<main><h1>Article</h1><p>Useful body</p><script>internalPayload()</script><nav>Unwanted navigation</nav></main>', undefined, [{ main: 'main', exclude: [], name: 'Article' }]);
        try { const out = await p.extract(); assert.equal(out.usedRule, true); assert.match(out.html, /Useful body/); assert.doesNotMatch(out.html, /internalPayload|Unwanted navigation/); }
        finally { p.close(); }
    });
    await check('links and images retain the source website URLs after transfer to the extension', async () => {
        const p = page('<main><h1>Story</h1><a href="../other">More</a><a href="#details">Details</a><img src="/cover.jpg" srcset="small.jpg 1x, large.jpg 2x"></main>', 'https://example.org/news/story', [{ main: 'main', exclude: [], name: 'Story' }]);
        try { const out = await p.extract(); const reader = p.dom.window.document.createElement('div'); reader.innerHTML = out.html;
            assert.equal(reader.querySelector('a').getAttribute('href'), 'https://example.org/other');
            assert.equal(reader.querySelectorAll('a')[1].getAttribute('href'), '#details');
            assert.equal(reader.querySelector('img').getAttribute('src'), 'https://example.org/cover.jpg');
            assert.match(reader.querySelector('img').getAttribute('srcset'), /https:\/\/example.org\/news\/small.jpg/);
            assert.equal(p.dom.window.document.querySelector('a').getAttribute('href'), '../other');
        } finally { p.close(); }
    });
    console.log(JSON.stringify({ mode: 'local provider doubles; no quality inference', results }, null, 2));
    if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ results }, null, 2));
    if (results.some(r => !r.passed)) process.exitCode = 1;
})();
