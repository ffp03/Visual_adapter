const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { createLocalServer } = require('../../backend/local-ai.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');
const scratch = path.resolve(__dirname, '../../workspace/task023/preservation-v2/admission-tests');
fs.mkdirSync(scratch, { recursive: true });
const rule = { main: 'main', exclude: [], name: 'Retained fake candidate' };
const body = text => '<main><h1>' + text + '</h1><p>Reading information about ' + text + '</p></main>';
const example = (identity, html = body(identity)) => ({ protocol: 2, hostname: 'example.test', exampleKey: hash(identity), html, validationHTML: html, validationComplete: true });
async function open(t, { generate, maxCalls = 20 } = {}) {
    let calls = 0;
    const directory = fs.mkdtempSync(path.join(scratch, 'run-'));
    const server = createLocalServer({ directory, maxCalls, runner: { provider: 'fake-local', model: 'fixture', async generate(html) { calls++; return generate ? generate(html) : { rule }; } } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise(resolve => server.close(resolve)));
    const endpoint = 'http://127.0.0.1:' + server.address().port;
    const post = async (route, data) => { const response = await fetch(endpoint + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return { status: response.status, ...await response.json() }; };
    const list = async () => (await (await fetch(endpoint + '/rules/example.test?protocol=2')).json()).rules;
    return { post, list, calls: () => calls, directory, endpoint };
}
test('first complete example private; reload and same content at another identity do not admit; second distinct example admits with one runner call', async t => {
    const app = await open(t);
    const first = await app.post('/analyze', example('first'));
    assert.equal(first.status, 'pending'); assert.equal(first.examples, 1); assert.equal(app.calls(), 1); assert.equal((await app.list()).length, 0);
    assert.equal((await app.post('/analyze', example('first'))).status, 'pending');
    assert.equal((await app.post('/analyze', example('other-url', body('first')))).status, 'pending');
    const second = await app.post('/analyze', example('second'));
    assert.equal(second.status, 'admitted'); assert.equal(second.examples, 2); assert.equal(app.calls(), 1); assert.equal((await app.list()).length, 1);
    assert.equal((await app.post('/analyze', example('second'))).status, 'admitted'); assert.equal(app.calls(), 1);
    const legacy = await (await fetch(app.endpoint + '/rules/example.test')).json(); assert.equal(legacy.rule, null);
});
test('incomplete context never generates or admits; two structural families coexist on one host', async t => {
    const app = await open(t, { generate: async html => ({ rule: { ...rule, main: html.includes('<article') ? 'article' : 'main' } }) });
    assert.equal((await app.post('/analyze', { ...example('incomplete'), validationComplete: false })).status, 'pending'); assert.equal(app.calls(), 0);
    await app.post('/analyze', example('a')); await app.post('/analyze', example('b'));
    const article = text => '<article><h1>' + text + '</h1><p>Article reading ' + text + '</p></article>';
    await app.post('/analyze', example('c', article('c'))); await app.post('/analyze', example('d', article('d')));
    assert.equal(app.calls(), 2); assert.equal((await app.list()).length, 2);
    assert.notEqual((await app.list())[0].familyKey, (await app.list())[1].familyKey);
});
test('second selector failure retires admission attempt without automatic generation; explicit report resets family, never session cap', async t => {
    const app = await open(t, { maxCalls: 1, generate: async () => ({ rule: { ...rule, main: '.reading' } }) });
    await app.post('/analyze', example('a', '<main><div class=reading><p>First text</p></div></main>'));
    const failed = await app.post('/analyze', example('b', '<main><div class=other><p>Second text</p></div></main>'));
    assert.equal(failed.status, 'fallback'); assert.equal((await app.list()).length, 0);
    await app.post('/analyze', example('c', '<main><div class=reading><p>Third text</p></div></main>')); assert.equal(app.calls(), 1);
    await app.post('/report', { protocol: 2, hostname: 'example.test', familyKey: failed.familyKey });
    const exhausted = await app.post('/analyze', example('d', '<main><div class=reading><p>Fourth text</p></div></main>'));
    assert.equal(exhausted.status, 'fallback'); assert.equal(app.calls(), 1);
});
test('concurrent seed/reload/second example coalesce and count distinct evidence once', async t => {
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; }), ready = new Promise(resolve => { entered = resolve; });
    const app = await open(t, { generate: async () => { entered(); await gate; return { rule }; } });
    const seed = app.post('/analyze', example('first')); await ready;
    const reload = app.post('/analyze', example('first')), second = app.post('/analyze', example('second'));
    release(); await Promise.all([seed, reload, second]);
    assert.equal(app.calls(), 1); assert.equal((await app.list()).length, 1);
    const response = await app.post('/analyze', example('third')); assert.equal(response.examples, 2);
    await app.post('/report', { protocol: 2, hostname: 'example.test', familyKey: response.familyKey }); assert.equal((await app.list()).length, 0);
});
test('legacy and v2 requests share the global generation cap', async t => {
    const app = await open(t, { maxCalls: 1 }); await app.post('/analyze', example('first'));
    const legacy = await app.post('/analyze', { hostname: 'other.test', html: body('legacy') });
    assert.equal(legacy.status, 'fallback'); assert.equal(app.calls(), 1);
});

test('unusable, unsupported essential media and unresolved relative validation context consume no runner call', async t => {
    const app = await open(t);
    for (const html of ['<main></main>', '<main><canvas></canvas></main>', '<main><p>Text <a href="relative">Next</a></p></main>'])
        assert.equal((await app.post('/analyze', example('invalid', html))).status, 'pending');
    assert.equal(app.calls(), 0);
});
test('provider failure stays blocked until explicit report; retry consumes remaining cap without resetting it', async t => {
    let attempts = 0;
    const app = await open(t, { maxCalls: 2, generate: async () => { if (++attempts === 1) throw Error('synthetic provider failure'); return { rule }; } });
    const failed = await app.post('/analyze', example('first'));
    assert.equal(failed.status, 'fallback');
    await app.post('/analyze', example('second')); assert.equal(app.calls(), 1);
    await app.post('/report', { protocol: 2, hostname: 'example.test' });
    assert.equal((await app.post('/analyze', example('first'))).status, 'pending'); assert.equal(app.calls(), 2);
    assert.equal((await app.post('/analyze', example('second'))).status, 'admitted');
    await app.post('/report', { protocol: 2, hostname: 'example.test' });
    await app.post('/analyze', example('third')); assert.equal(app.calls(), 2);
});

test('optional nested article content does not fork the coarse root family', async t => {
    const app = await open(t);
    await app.post('/analyze', example('a', '<main><p>First reading text</p></main>'));
    const result = await app.post('/analyze', example('b', '<main><p>Second reading text</p><article><p>Optional nested discussion</p></article></main>'));
    assert.equal(result.status, 'admitted'); assert.equal(app.calls(), 1);
});

test('report during generation retires queued seed/reload without automatic replacement generation', async t => {
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; }), ready = new Promise(resolve => { entered = resolve; });
    const app = await open(t, { maxCalls: 2, generate: async () => { entered(); await gate; return { rule }; } });
    const seed = app.post('/analyze', example('first')); await ready;
    const queued = app.post('/analyze', example('first'));
    await new Promise(resolve => setTimeout(resolve, 30));
    await app.post('/report', { protocol: 2, hostname: 'example.test' }); release();
    await Promise.all([seed, queued]);
    assert.equal(app.calls(), 1); assert.equal((await app.list()).length, 0);
});

test('eligible selector domain has server/client parity despite nav/footer duplicates', async t => {
    const { JSDOM } = require('jsdom');
    const core = require('../../extension/procedure-core');
    const app = await open(t, { generate: async () => ({ rule: { ...rule, main: '.reading' } }) });
    const fixture = text => '<nav><div class=reading>Navigation</div></nav><div class=reading><span>' + text + '</span></div><footer><div class=reading>Footer</div></footer>';
    await app.post('/analyze', example('a', fixture('First different text')));
    const admitted = await app.post('/analyze', example('b', fixture('Second different text')));
    assert.equal(admitted.status, 'admitted'); assert.equal(app.calls(), 1);
    const source = new JSDOM(fixture('Second different text'));
    assert.equal(core.apply(source.window.document, admitted.procedure).accepted, true); source.window.close();
});

test('oversized full sanitized body never generates, admits or publishes a pruned context', async t => {
    const { JSDOM } = require('jsdom'), core = require('../../extension/procedure-core');
    const app = await open(t);
    for (const identity of ['oversize-first', 'oversize-second']) {
        const source = new JSDOM('<body><div>' + 'Outside unwrapped text. '.repeat(6000) + '</div><main><p>' + identity + ' reading text</p></main></body>');
        const context = core.validationContext(source.window.document);
        assert.equal(context.validationComplete, false); assert.equal(context.validationHTML, undefined);
        assert.equal(context.validationLimitation, 'complete-sanitized-body-exceeds-100k');
        const payload = { ...example(identity), ...context }; delete payload.validationHTML;
        assert.equal((await app.post('/analyze', payload)).status, 'pending'); source.window.close();
    }
    assert.equal(app.calls(), 0); assert.equal((await app.list()).length, 0);
});
test('small complete sanitized bodies admit stable ancestors that also apply on live wrappers', async t => {
    const { JSDOM } = require('jsdom'), core = require('../../extension/procedure-core');
    const app = await open(t);
    const sources = ['First', 'Second'].map((text, index) => new JSDOM('<body><div>Outside unwrapped text.</div><section>' + (index ? '<aside>Inserted wrapper sibling</aside>' : '') + '<div><h1>' + text + ' title</h1><main><p>' + text + ' reading text</p></main></div></section></body>'));
    let result;
    for (let index = 0; index < sources.length; index++) {
        const context = core.validationContext(sources[index].window.document);
        assert.equal(context.validationComplete, true); assert(context.validationHTML.includes('Outside unwrapped text.'));
        result = await app.post('/analyze', { ...example('stable-' + index), ...context });
    }
    assert.equal(result.status, 'admitted'); assert.equal(app.calls(), 1);
    assert(result.procedure.regions.every(region => !region.fragileSelector));
    assert(result.procedure.adjustments.some(adjustment => adjustment.kind === 'stable-common-ancestor-expansion'));
    for (const source of sources) { assert.equal(core.apply(source.window.document, result.procedure).accepted, true); source.window.close(); }
});
test('complete sanitized body retains outside-reading class duplicates and never publishes false uniqueness', async t => {
    const { JSDOM } = require('jsdom'), core = require('../../extension/procedure-core');
    const app = await open(t, { generate: async () => ({ rule: { ...rule, main: '.reading' } }) });
    const source = new JSDOM('<body><div class=reading>Outside unwrapped duplicate</div><section><main><div class=reading><p>Actual reading block</p></div></main></section></body>');
    const context = core.validationContext(source.window.document);
    assert.equal(context.validationComplete, true); assert(context.validationHTML.includes('Outside unwrapped duplicate'));
    const supplied = new JSDOM(context.validationHTML); assert.equal(core.matches(supplied.window.document, '.reading').length, 2);
    assert.equal((await app.post('/analyze', { ...example('outside-duplicate'), ...context })).status, 'fallback');
    assert.equal(app.calls(), 1); assert.equal((await app.list()).length, 0);
    source.window.close(); supplied.window.close();
});
test('two actual reading matches remain ambiguous and are never published', async t => {
    const app = await open(t, { generate: async () => ({ rule: { ...rule, main: '.reading' } }) });
    const html = '<main><div class=reading><p>Reading one</p></div><div class=reading><p>Reading two</p></div></main>';
    assert.equal((await app.post('/analyze', example('ambiguous', html))).status, 'fallback');
    assert.equal((await app.list()).length, 0); assert.equal(app.calls(), 1);
});
