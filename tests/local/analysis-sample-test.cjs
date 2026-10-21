const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const { page } = require('./harness.cjs');

test('balanced sample includes late structures within budget and leaves reading output complete', async () => {
    const rows = Array.from({ length: 240 }, (_, i) => '<p class=prose>Paragraph ' + i + ' ' + 'Substantive material. '.repeat(35) + '</p>').join('');
    const source = '<body><nav>Global links</nav><main id=reading><h1>Primary title</h1>' + rows +
        '<section id=late><h2>Late important section</h2><table class=measurements><tr><th>Metric</th><th>Value</th></tr><tr><td>Late sample</td><td>42</td></tr></table>' +
        '<pre class=example><code>return final_result;</code></pre><figure><img class=plot src="https://private.test/plot?secret=uri" alt="Late plot"><figcaption>Late caption</figcaption></figure>' +
        '<section role=comment><p>Late discussion with useful information.</p></section></section></main></body>';
    const p = page(source), doc = p.dom.window.document;
    try {
        const before = doc.body.outerHTML;
        const sample = p.dom.window.analysisSample(doc);
        assert(sample.html.length <= 12000);
        assert.equal(sample.context.complete, false);
        assert.equal(sample.context.unrepresentedRoles.length, 0);
        const sampled = new JSDOM(sample.html).window.document;
        for (const selector of ['main#reading', '#late h2', '#late table.measurements td', '#late pre.example', '#late img.plot', '#late figcaption', '[role=comment]'])
            assert(sampled.querySelector(selector), selector);
        assert(sample.html.includes('Paragraph 0') && sample.html.includes('Paragraph 120') && sample.html.includes('Paragraph 239'));
        assert(!sample.html.includes('https://private.test') && !sample.html.includes('secret=uri'));
        assert.equal(doc.body.outerHTML, before);
        const output = await p.extract();
        assert(output.html.includes('Paragraph 239') && output.html.includes('Substantive material. '.repeat(20)));
        assert(output.html.includes('https://private.test/plot?secret=uri'));
        assert.equal(output.analysisContext.kind, 'balanced-structural-sample');
        assert(output.analysisHTML.length <= 12000);
        assert(sample.html.length < before.length / 5);
    } finally { p.close(); }
});

test('sampling omits form values even inside selected text blocks, scripts and destinations', () => {
    const p = page('<main><h1>Public title</h1><p>Public cue <textarea>PRIVATE_TEXTAREA</textarea><input value="PRIVATE_INPUT"><script>PRIVATE_SCRIPT</script></p>' +
        '<p>Second public paragraph <a href="https://secret.test/private-path">Public link</a></p></main>');
    try {
        const sample = p.dom.window.analysisSample(p.dom.window.document);
        assert(!/PRIVATE_|secret\.test|private-path|<textarea|<input|<script/.test(sample.html));
        assert(sample.html.includes('Public title') && sample.html.includes('Public cue'));
        assert.equal(sample.context.requiresFullSourceValidation, true);
    } finally { p.close(); }
});

test('small budget reports omitted roles without slicing serialized HTML or inventing IDs', () => {
    const p = page('<main id="' + 'a'.repeat(170) + '"><h1>Title</h1>' + Array.from({ length: 80 }, (_, i) => '<section class=container><p>Content ' + i + ' with a useful short cue.</p></section>').join('') + '</main>');
    try {
        const sample = p.dom.window.analysisSample(p.dom.window.document, 2000);
        assert(sample.html.length <= 2000 && sample.html.endsWith('</body>'));
        const parsed = new JSDOM(sample.html).window.document;
        assert(parsed.querySelector('h1'));
        assert.equal(parsed.querySelector('main').hasAttribute('id'), false);
        assert(sample.context.selectedElements < sample.context.sourceElements);
        assert.equal(sample.context.complete, false);
    } finally { p.close(); }
});
