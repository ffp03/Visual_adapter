'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createLocalServer } = require('../../../backend/local-ai.cjs');
const { LayoutFakeRunner } = require('../../../backend/layout-fake-runner.cjs');
const { limits } = require('../../../backend/runtime-disclosure.cjs');
const root = path.resolve(__dirname, '../../../');
const digest = s => crypto.createHash('sha256').update(s).digest('hex');
function page(seed, extra = '') {
    return { tab: 19, hostname: 'example.test', url: 'https://example.test/articles/' + seed,
        sanitizedHtml: `<body><nav>Repeated site navigation</nav><main class="reading"><h1>${seed} story</h1><p>${seed} substantive unique content about accessible reading with enough words to preserve the entire article and meet the gate. This paragraph explains useful details for the reader.</p>${extra}</main><footer>Repeated footer</footer></body>` };
}
async function setup(t, options = {}) {
    const directory = path.join(root, 'workspace/local-ai/wp-d1-tests', crypto.randomUUID());
    const runner = options.runner || new LayoutFakeRunner();
    const server = createLocalServer({ runner, directory, runtimeRoot: directory, maxCalls: options.maxCalls || 20 });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const base = 'http://127.0.0.1:' + server.address().port;
    async function post(route, data, expected = 200) {
        const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const result = await response.json(); assert.equal(response.status, expected, JSON.stringify(result)); return result;
    }
    const get = async route => (await fetch(base + route)).json();
    async function consent(p) { const d = await post('/disclose', p); return post('/generate', { ...p, token: d.token, payloadHash: d.payloadHash }); }
    async function waiting(p, job) {
        const end = Date.now() + 30000;
        while (Date.now() < end) {
            const out = await post('/generation/status', { ...p, job });
            if (['admitted', 'failed'].includes(out.status)) return out;
            await new Promise(resolve => setTimeout(resolve, 40));
        }
        throw Error('Timed out preparing local evidence');
    }
    const exampleDirectory = path.join(directory, 'workspace/local-ai/runtime-examples');
    return { directory, runner, server, post, get, consent, waiting, exampleDirectory };
}
test('one induction consent: exact first disclosure before click, admission, full receipts and report', async t => {
    const s = await setup(t), a = page('Alpha'), b = page('Beta');
    const first = await s.post('/disclose', a);
    assert.equal(first.characters, 0); assert.equal(first.maximumTotalCharacters, 0); assert.equal(s.runner.calls.length, 0);
    assert.equal(fs.readdirSync(s.exampleDirectory).length, 0);
    await s.post('/generate', { ...a, token: 'forged' }, 403);
    const pending = await s.post('/generate', { ...a, token: first.token });
    assert.equal(pending.status, 'pending'); assert.equal(pending.examples, 1); assert.equal(s.runner.calls.length, 0);
    await s.post('/generate', { ...a, token: first.token }, 403);
    assert.equal((await s.consent(a)).status, 'pending');
    const preview = await s.post('/disclose', b);
    assert.ok(preview.characters > 0);
    assert.equal(preview.maxTurns, limits().maxTurns);
    assert.equal(preview.observationCharacters, limits().observationCharacters);
    assert.equal(preview.maximumTotalCharacters, preview.maxTurns * preview.perRequestCharacters);
    assert.equal(fs.readdirSync(s.exampleDirectory).length, 1, 'Second example is not stored during preflight');
    assert.equal(s.runner.calls.length, 0, 'Preflight never calls provider');
    const start = await s.post('/generate', { ...b, token: preview.token, payloadHash: preview.payloadHash });
    const admitted = await s.waiting(b, start.job);
    assert.equal(admitted.status, 'admitted', JSON.stringify(admitted));
    assert.equal(s.runner.calls.length, 1);
    const payload = JSON.stringify(s.runner.calls[0]);
    assert.equal(preview.characters, payload.length); assert.equal(preview.payloadHash, digest(payload));
    assert.ok(JSON.parse(payload).messages[1].content.includes(preview.sample));
    const history = await s.post('/generation/history', { hostname: b.hostname });
    assert.equal(history.payloadCount, 1);
    assert.equal(history.receipts[0].payload, payload);
    assert.equal(history.receipts[0].characters, payload.length);
    assert.equal(history.receipts[0].payloadHash, digest(payload));
    assert.equal(history.receipts[0].sample, preview.sample);
    const usage = fs.readFileSync(path.join(s.directory, 'workspace/local-ai/scripted-layout-fixture/usage.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(usage[0].inputSha256, preview.payloadHash);
    assert.equal((await s.get('/rules/example.test?protocol=3')).rules[0].schemaVersion, 3);
    await s.post('/report', { hostname: b.hostname, protocol: 3 });
    assert.equal((await s.get('/rules/example.test?protocol=3')).rules.length, 0);
    await s.post('/analyze', { hostname: b.hostname, html: b.sanitizedHtml }, 403);
    await s.post('/generation/send', { hostname: b.hostname }, 403);
    assert.equal(s.runner.calls.length, 1);
});
test('one click runs all six adaptive turns within the disclosed total; every payload is viewable', async t => {
    const runner = new LayoutFakeRunner({ actions: Array.from({ length: 5 }, () => ({ action: 'query', selector: 'main.reading' })) });
    const s = await setup(t, { runner }), a = page('Alpha'), b = page('Beta');
    await s.consent(a); const d = await s.post('/disclose', b);
    const start = await s.post('/generate', { ...b, token: d.token, payloadHash: d.payloadHash });
    const final = await s.waiting(b, start.job);
    assert.equal(final.status, 'admitted', JSON.stringify(final)); assert.equal(runner.calls.length, 6);
    const history = await s.post('/generation/history', { hostname: b.hostname });
    assert.equal(history.payloadCount, 6);
    assert.ok(history.receipts.reduce((n, r) => n + r.characters, 0) <= d.maximumTotalCharacters);
    history.receipts.forEach((receipt, i) => {
        const payload = JSON.stringify(runner.calls[i]);
        assert.equal(receipt.payload, payload); assert.equal(receipt.characters, payload.length);
        assert.equal(receipt.payloadHash, digest(payload)); assert.ok(payload.length <= d.perRequestCharacters);
    });
});
test('changed snapshots, stale tabs, different families, redaction and stale payload hashes refuse', async t => {
    const s = await setup(t), a = page('Alpha'), b = page('Beta');
    const d = await s.post('/disclose', a);
    await s.post('/generate', { ...b, token: d.token }, 403); assert.equal(s.runner.calls.length, 0);
    const old = await s.post('/disclose', a); await s.post('/disclose', b);
    await s.post('/generate', { ...a, token: old.token }, 403);
    const redacted = await s.post('/disclose', page('Private', '<p>Contact jane@example.org or phone 5551234567 now.</p><input value="SECRET_VALUE"><script>SECRET_SCRIPT</script>'));
    assert.ok(!redacted.sample.includes('jane@example.org')); assert.ok(!redacted.sample.includes('SECRET_'));
    await s.consent(a);
    assert.equal((await s.consent({ ...b, sanitizedHtml: b.sanitizedHtml.replace('main', 'article').replace('</main>', '</article>') })).examples, 1);
    const second = await s.post('/disclose', b);
    await s.post('/generate', { ...b, token: second.token, payloadHash: 'wrong' }, 403);
    assert.equal(s.runner.calls.length, 0);
    const clearToken = await s.post('/disclose', b); await s.post('/pending/clear', {});
    await s.post('/generate', { ...b, token: clearToken.token, payloadHash: clearToken.payloadHash }, 403);
});
test('clear deletes raw pending examples, old archived raw copies and baseline cache copies', async t => {
    const s = await setup(t, { runner: new LayoutFakeRunner({ fail: true }) }), a = page('Alpha'), b = page('Beta');
    await s.consent(a); const start = await s.consent(b);
    assert.equal((await s.waiting(b, start.job)).status, 'failed');
    const ids = fs.readdirSync(s.exampleDirectory);
    assert.equal(ids.length, 2);
    const archive = path.join(s.directory, 'layouts-v3/archive');
    fs.copyFileSync(path.join(s.exampleDirectory, ids[0]), path.join(archive, ids[0] + '.previous-version'));
    const cache = path.join(s.directory, 'workspace/local-ai/runtime-baselines');
    assert.ok(fs.readdirSync(cache).length > 0);
    await s.post('/pending/clear', {});
    for (const id of ids) assert.equal(fs.existsSync(path.join(s.exampleDirectory, id)), false);
    assert.equal(fs.existsSync(path.join(archive, ids[0] + '.previous-version')), false);
    assert.equal(fs.readdirSync(archive).length, 0, 'Pending example metadata is deleted rather than archived');
    assert.equal(fs.readdirSync(cache).length, 0);
    assert.equal((await s.consent(page('Gamma'))).examples, 1);
    assert.equal((await s.post('/generation/history', { hostname: b.hostname })).payloadCount, 1, 'Audit receipts remain viewable');
});
test('provider failures, gate rejection and shared session cap retain fallback without automatic retry', async t => {
    for (const runner of [new LayoutFakeRunner({ fail: true }), new LayoutFakeRunner({ actions: [{ action: 'submit', rule: {} }] }),
        new LayoutFakeRunner({ actions: [{ action: 'query', selector: 'main' }] })]) {
        const s = await setup(t, { runner, maxCalls: 1 }), a = page('Alpha'), b = page('Beta');
        await s.consent(a); const start = await s.consent(b);
        assert.equal((await s.waiting(b, start.job)).status, 'failed');
        assert.equal((await s.get('/rules/example.test?protocol=3')).rules.length, 0);
        assert.equal((await s.consent(b)).status, 'fallback'); assert.equal(runner.calls.length, 1);
        assert.equal((await s.get('/health')).calls, 1);
    }
});
test('oversized complete observations fail closed before an undisclosed request is sent', async t => {
    const runner = new LayoutFakeRunner({ actions: [{ action: 'query', selector: 'p' }] });
    const s = await setup(t, { runner });
    const extra = '<p class="' + 'x'.repeat(limits().observationCharacters + 1000) + '">An additional substantial paragraph with useful reading material and a long structural class token.</p>';
    await s.consent(page('Alpha', extra));
    const p = page('Beta', extra), d = await s.post('/disclose', p);
    const start = await s.post('/generate', { ...p, token: d.token, payloadHash: d.payloadHash });
    const final = await s.waiting(p, start.job);
    assert.equal(final.status, 'failed');
    assert.match(final.reason, /induction-observation-cap-exceeded/); assert.equal(runner.calls.length, 1);
    assert.equal(final.payloadCount, 1);
});
test('clearing a preparing induction waits for local workers and prevents late admission or cache recreation', async t => {
    const s = await setup(t), a = page('Alpha'), b = page('Beta');
    await s.consent(a); const start = await s.consent(b);
    assert.equal(start.status, 'preparing');
    await s.post('/pending/clear', {});
    assert.equal(fs.readdirSync(s.exampleDirectory).length, 0);
    const cache = path.join(s.directory, 'workspace/local-ai/runtime-baselines');
    assert.equal(fs.readdirSync(cache).length, 0);
    assert.equal(s.runner.calls.length, 0);
    assert.equal((await s.get('/rules/example.test?protocol=3')).rules.length, 0);
    const final = await s.post('/generation/status', { ...b, job: start.job });
    assert.equal(final.status, 'failed');
});
test('first-payload framing drift is refused before any provider transport', async t => {
    const runner = new LayoutFakeRunner();
    let revision = 0;
    runner.payload = messages => ({ model: runner.model, messages, revision: ++revision });
    const s = await setup(t, { runner }), a = page('Alpha'), b = page('Beta');
    await s.consent(a); const d = await s.post('/disclose', b);
    const start = await s.post('/generate', { ...b, token: d.token, payloadHash: d.payloadHash });
    const final = await s.waiting(b, start.job);
    assert.equal(final.status, 'failed'); assert.match(final.reason, /first-payload-disclosure-changed/);
    assert.equal(runner.calls.length, 0); assert.equal(final.payloadCount, 0);
});
test('Review-2: report during preparation then clear awaits failed-state workers; no files reappear', async t => {
    const s = await setup(t), a = page('Alpha'), b = page('Beta');
    await s.consent(a); const start = await s.consent(b);
    assert.equal(start.status, 'preparing');
    await s.post('/report', { hostname: b.hostname, protocol: 3 });
    const reported = await s.post('/generation/status', { ...b, job: start.job });
    assert.equal(reported.status, 'failed', 'Reported UI state does not mean workers have stopped');
    await s.post('/pending/clear', {});
    const cache = path.join(s.directory, 'workspace/local-ai/runtime-baselines');
    const assertDeleted = () => {
        assert.equal(fs.readdirSync(s.exampleDirectory).length, 0);
        assert.equal(fs.readdirSync(cache).length, 0);
        assert.equal(fs.readdirSync(path.join(s.directory, 'layouts-v3')).filter(n => n.endsWith('.json')).length, 0);
        assert.equal(fs.readdirSync(path.join(s.directory, 'runtime-payloads')).length, 0);
        assert.equal(fs.readdirSync(path.join(s.directory, 'runtime-history')).length, 0);
    };
    assertDeleted();
    await new Promise(resolve => setTimeout(resolve, 5000));
    assertDeleted(); assert.equal(s.runner.calls.length, 0);
    assert.equal((await s.get('/rules/example.test?protocol=3')).rules.length, 0);
});
