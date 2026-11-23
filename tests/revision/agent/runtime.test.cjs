'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createRuntimeAgent, RuntimeSession } = require('../../../backend/agent/runtime.cjs');
const { DeepSeekRunner } = require('../../../backend/agent/runners.cjs');
const { Ledger, hash } = require('../../../backend/agent/ledger.cjs');
const { runLoop } = require('../../../backend/agent/loop.cjs');
const { rule, prose, fake, ledger } = require('./helpers.cjs');

function setup(options = {}) {
    const root = path.resolve(__dirname, '../../../workspace/revision/dev-runs/tests/runtime-' + crypto.randomUUID());
    const agent = createRuntimeAgent({ root, ...options });
    return { root, agent };
}
function snapshot(seed) {
    return { url: 'https://example.test/articles/' + seed,
        sanitizedHtml: `<main class="reading"><h1>${seed} title</h1><p>${prose(seed)}</p><aside class="template"><p>${prose('Repeated newsletter')}</p></aside></main>` };
}
function add(agent, seed, tab = seed) {
    const page = snapshot(seed);
    return agent.registerRuntimeExample(agent.issueConsent(tab, page), 'example.test', page.sanitizedHtml);
}
function ids(agent) { return [add(agent, 'Alpha'), add(agent, 'Beta')]; }
function usage(root) {
    const directory = path.join(root, 'workspace/local-ai');
    return fs.readdirSync(directory, { withFileTypes: true }).filter(e => e.isDirectory()).flatMap(e => {
        const file = path.join(directory, e.name, 'usage.jsonl');
        return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse) : [];
    });
}
function evaluation(root, page) {
    const directory = path.join(root, 'workspace/revision/corpus'); fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ sites: [{ siteId: 'eval-01', host: 'example.test',
        pages: [{ pageId: 'eval-01-p1', url: page.url, finalUrl: page.url, sha256: hash(page.sanitizedHtml) }] }] }));
}

test('runtime evaluation-host refusal ignores one www both ways and keeps other subdomains distinct',()=>{
 for(const [declared,actual,blocked]of [['example.test','www.example.test',true],['www.example.test','example.test',true],['docs.example.test','docs.example.test',true],['docs.example.test','www.docs.example.test',true],['example.test','docs.example.test',false],['example.test','www.www.example.test',false]]){
  const {root,agent}=setup(),original=snapshot('Original'),page={url:'https://'+actual+'/different',sanitizedHtml:'<main><h1>Unrelated runtime article</h1><p>'+prose('Completely new content')+'</p></main>'};
  evaluation(root,original);const manifest=path.join(root,'workspace/revision/corpus/manifest.json'),data=JSON.parse(fs.readFileSync(manifest));data.sites[0].host=declared;data.sites[0].pages[0].url='https://'+declared+'/captured';data.sites[0].pages[0].finalUrl=data.sites[0].pages[0].url;fs.writeFileSync(manifest,JSON.stringify(data));
  const work=()=>agent.registerRuntimeExample(agent.issueConsent('tab',page),actual,page.sanitizedHtml);
  if(blocked)assert.throws(work,/runtime-evaluation-page-refused:host/);else assert.match(work(),/^runtime-/);
 }
});

test('runtime requires a backend-issued one-time token bound to the exact tab/page snapshot', () => {
    const { agent } = setup(), page = snapshot('Alpha');
    assert.throws(() => agent.registerRuntimeExample(null, 'example.test', page.sanitizedHtml), /consent-required/);
    assert.throws(() => agent.registerRuntimeExample('forged', 'example.test', page.sanitizedHtml), /consent-required/);
    const first = agent.issueConsent(17, page);
    assert.throws(() => agent.registerRuntimeExample(first, 'example.test', snapshot('Beta').sanitizedHtml), /page-mismatch/);
    assert.throws(() => agent.registerRuntimeExample(first, 'example.test', page.sanitizedHtml), /consent-required/);
    const wrongHost = agent.issueConsent(17, page);
    assert.throws(() => agent.registerRuntimeExample(wrongHost, 'other.test', page.sanitizedHtml), /page-mismatch/);
    const stale = agent.issueConsent(17, page), token = agent.issueConsent(17, snapshot('Beta'));
    assert.throws(() => agent.registerRuntimeExample(stale, 'example.test', page.sanitizedHtml), /consent-required/);
    const id = agent.registerRuntimeExample(token, 'example.test', snapshot('Beta').sanitizedHtml);
    assert.match(id, /^runtime-/);
    assert.throws(() => agent.registerRuntimeExample(token, 'example.test', snapshot('Beta').sanitizedHtml), /consent-required/);
});

test('runtime stores sanitized examples locally; tokens expire on a backend restart but examples persist', async () => {
    const { root, agent } = setup(), page = snapshot('Alpha');
    page.sanitizedHtml += '<script>private-script</script><input value="private-value"><select><option selected>private-option</option></select>';
    const token = agent.issueConsent('tab-a', page), id = agent.registerRuntimeExample(token, 'example.test', page.sanitizedHtml);
    const store = path.join(root, 'workspace/local-ai/runtime-examples'), record = JSON.parse(fs.readFileSync(path.join(store, id + '.json')));
    assert.ok(!record.html.includes('private-')); assert.equal(record.sha256, hash(record.html));
    assert.ok(!JSON.stringify(record).includes(token));
    const unused = agent.issueConsent('tab-b', snapshot('Beta')), restarted = createRuntimeAgent({ root });
    assert.throws(() => restarted.registerRuntimeExample(unused, 'example.test', snapshot('Beta').sanitizedHtml), /consent-required/);
    const runner = fake([{ action: 'submit', rule: rule() }]);
    const out = await restarted.runRuntimeInduction('example.test', [id, add(restarted, 'Beta')], runner);
    assert.equal(out.accepted, true, JSON.stringify(out));
});

test('runtime source accepts only registered opaque ids and cannot resolve corpus paths or IDs', async () => {
    const { root, agent } = setup(), runner = fake([]), pair = ids(agent);
    for (const bad of ['eval-01-p1', 'dev-01-p1', '../corpus/eval/p1', path.join(root, 'workspace/revision/corpus/eval/p1.html')]) {
        await assert.rejects(agent.runRuntimeInduction('example.test', [pair[0], bad], runner), /registered-runtime-id/);
    }
    await assert.rejects(agent.runRuntimeInduction('example.test', [pair[0], 'runtime-' + crypto.randomUUID()], runner), e => e.name === 'BoundaryError' && e.message === 'runtime-source-unavailable');
    for (const url of ['file:///C:/Dev/Visual_adapter/workspace/revision/corpus/eval/page.html',
        'http://localhost/workspace/revision/corpus/eval/page.html', 'http://localhost/corpus/dev/page.html']) {
        assert.throws(() => agent.issueConsent(1, { ...snapshot('Alpha'), url }), /runtime-(web-page|corpus-source)/);
    }
    assert.throws(() => agent.issueConsent(1, { ...snapshot('Alpha'), file: 'corpus/eval/page.html' }), /snapshot-required/);
    await assert.rejects(agent.runRuntimeInduction('other.test', pair, runner), /host-mismatch/);
    await assert.rejects(agent.runRuntimeInduction('example.test', [pair[0], pair[0]], runner), /runtime-ids-required/);
    assert.equal(runner.calls.length, 0); assert.equal(agent.session.calls, 0);
});

test('runtime refuses evaluation URLs and exact capture bytes, including later manifest additions', async () => {
    const { root, agent } = setup(), page = snapshot('Alpha'); evaluation(root, page);
    assert.throws(() => agent.issueConsent(1, page), /evaluation-page-refused/);
    assert.throws(() => agent.issueConsent(1, { ...page, url: 'https://other.test/disguised' }), /evaluation-page-refused/);
    const registration = setup(), beta = snapshot('Beta'), token = registration.agent.issueConsent(2, beta); evaluation(registration.root, beta);
    assert.throws(() => registration.agent.registerRuntimeExample(token, 'example.test', beta.sanitizedHtml), /evaluation-page-refused/);
    const loading = setup(), pair = ids(loading.agent); evaluation(loading.root, snapshot('Alpha'));
    const runner = fake([]); await assert.rejects(loading.agent.runRuntimeInduction('example.test', pair, runner), /evaluation-page-refused/);
    assert.equal(runner.calls.length, 0);
});

function corpusCapture(root, split, id, html, url) {
    const corpus = path.join(root, 'workspace/revision/corpus'), siteId = split + '-01';
    const folder = path.join(corpus, split, siteId, id); fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'rendered-dom.html'), html);
    const manifest = path.join(corpus, split + '-manifest.json');
    const data = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8'))
        : { split, sites: [{ siteId, host: new URL(url).hostname, pages: [] }] };
    data.sites[0].pages.push({ pageId: id, url, finalUrl: url, sha256: hash(html) });
    fs.writeFileSync(manifest, JSON.stringify(data));
    return { file: path.join(folder, 'rendered-dom.html'), manifest };
}
function sanitizedCapture(html, url) {
    const { JSDOM } = require('jsdom'), v3 = require('../../../extension/procedure-v3.js');
    const dom = new JSDOM(html, { url });
    try { return v3.clean(dom.window.document.body, dom.window.document, true).outerHTML; }
    finally { dom.window.close(); }
}

test('review 2: sanitized evaluation captures and ?view=reader aliases refuse every evaluation host before transport', () => {
    const { root, agent } = setup(), runner = fake([]);
    for (const [i, name] of ['Alpha', 'Beta'].entries()) {
        const page = snapshot(name), raw = '<!doctype html><html><head><title>Captured title</title><script>ignored()</script></head><body>'
            + page.sanitizedHtml + '<footer>Site footer and navigation</footer></body></html>';
        corpusCapture(root, 'eval', 'eval-01-p' + (i + 1), raw, page.url);
        const sanitizedHtml = sanitizedCapture(raw, page.url);
        assert.notEqual(hash(sanitizedHtml), hash(raw));
        assert.throws(() => agent.issueConsent(i, { url: page.url + '?view=reader', sanitizedHtml }), /evaluation-page-refused:host/);
    }
    assert.throws(() => agent.issueConsent(3, { url: 'https://example.test/unlisted-new-page?view=reader', sanitizedHtml: '<p>Entirely different content</p>' }), /evaluation-page-refused:host/);
    assert.equal(runner.calls.length, 0); assert.equal(agent.session.calls, 0);
    assert.deepEqual(fs.readdirSync(path.join(root, 'workspace/local-ai/runtime-examples')), []);
    assert.deepEqual(usage(root), []);
});

test('review 2: shared normalized-text fingerprints refuse sanitized corpus content moved to an unrelated host', () => {
    const { root, agent } = setup(), { extractText } = require('../eval/text.cjs');
    for (const split of ['eval', 'dev']) {
        const raw = '<!doctype html><html><head><title>Not body text</title></head><body><main class="reading"><h1>' + split
            + ' Fullwidth Ａ title</h1><p>First body paragraph.</p><p>Second body paragraph.</p></main><footer>Template footer removed in runtime.</footer></body></html>';
        const originalURL = 'https://corpus-' + split + '.test/article';
        corpusCapture(root, split, split + '-01-p1', raw, originalURL);
        const clean = sanitizedCapture(raw, originalURL);
        const reformatted = clean.replace('Ｆ', 'F').replace('Ａ', 'A').replace('First body', 'First\n  body').replace(/class="reading"/, 'id="renamed"');
        assert.notEqual(hash(reformatted), hash(raw)); assert.equal(hash(extractText(reformatted)), hash(extractText(clean)));
        assert.throws(() => agent.issueConsent(split, { url: 'https://unrelated.test/' + split + '?view=reader', sanitizedHtml: reformatted }), /runtime-corpus-text-refused/);
    }
    // Positive control: a genuine unrelated page remains eligible.
    assert.ok(agent.issueConsent('allowed', { url: 'https://unrelated.test/own-page', sanitizedHtml: '<main><h1>Independent runtime page</h1><p>Different reading content stays local.</p></main>' }));
    const cacheFile = path.join(root, 'workspace/local-ai/runtime-corpus-fingerprints.json'), cached = fs.readFileSync(cacheFile, 'utf8');
    assert.ok(!cached.includes('First body paragraph')); // Hashes, never corpus text.
    const restarted = createRuntimeAgent({ root });
    assert.throws(() => restarted.issueConsent('copied', { url: 'https://another-unrelated.test/?view=reader', sanitizedHtml: '<main><h1>dev Fullwidth A title</h1><p>First body paragraph.</p><p>Second body paragraph.</p></main>' }), /runtime-corpus-text-refused/);
    assert.equal(fs.readFileSync(cacheFile, 'utf8'), cached);
    assert.equal(agent.session.calls, 0); assert.deepEqual(usage(root), []);
});

test('review 2: corpus fingerprints cover archived/unmanifested captures and invalidate when source bytes change', () => {
    const { root, agent } = setup(), directory = path.join(root, 'workspace/revision/corpus/archive/replaced');
    fs.mkdirSync(directory, { recursive: true }); const file = path.join(directory, 'rendered-dom.html');
    const page = text => ({ url: 'https://unrelated.test/?view=reader', sanitizedHtml: '<p>' + text + '</p>' });
    fs.writeFileSync(file, '<html><body><p>Earlier archived corpus text</p></body></html>');
    assert.throws(() => agent.issueConsent(1, page('Earlier archived corpus text')), /runtime-corpus-text-refused/);
    fs.writeFileSync(file, '<html><body><p>A replacement capture has new corpus text and length</p></body></html>');
    assert.throws(() => agent.issueConsent(1, page('A replacement capture has new corpus text and length')), /runtime-corpus-text-refused/);
});

test('review 2: fingerprint preprocessing preserves shared-extractor text and runtime-sanitized text', () => {
    const { root, agent } = setup(), { extractText } = require('../eval/text.cjs');
    const raw = '<!doctype html><html><head><title>Ignored head</title><style>p{display:none}</style><script>ignored()</script></head><body>'
        + '<nav>Global navigation</nav><main role="main" style="display:none;border:var(--x)"><h1>Ａ text title</h1>'
        + '<p style="white-space:pre">Reading text<br>with a line boundary.</p><nav>In-content navigation</nav>'
        + '<form><label>Visible label</label><input value="hidden-value"><textarea>Textarea content</textarea>'
        + '<select><option selected>Option content</option></select><button value="value">Button label</button></form>'
        + '<noscript><p>Ignored noscript text</p></noscript><template><p>Ignored template text</p></template>'
        + '<svg><text>SVG visible text</text><animateMotion>Animation fallback text</animateMotion></svg></main><footer>Footer text</footer></body></html>';
    const url = 'https://corpus-dev.test/article'; corpusCapture(root, 'dev', 'dev-01-p1', raw, url);
    for (const text of [extractText(raw), extractText(sanitizedCapture(raw, url))]) {
        const sanitizedHtml = '<p>' + text.replaceAll('&', '&amp;').replaceAll('<', '&lt;') + '</p>';
        assert.equal(extractText(sanitizedHtml), text);
        assert.throws(() => agent.issueConsent('prefilter', { url: 'https://unrelated.test/?view=reader', sanitizedHtml }), /runtime-corpus-text-refused/);
    }
});

test('review 2: newly added corpus text also blocks already registered runtime ids before the next model turn', async () => {
    const { root, agent } = setup(), pair = ids(agent), runner = fake([{ action: 'query', selector: 'main' }, { action: 'submit', rule: rule() }]);
    const generate = runner.generate.bind(runner);
    runner.generate = async (...args) => {
        const result = await generate(...args);
        corpusCapture(root, 'dev', 'dev-01-p1', '<html><head><title>Capture wrapper</title></head><body>' + snapshot('Alpha').sanitizedHtml + '</body></html>', 'https://corpus-dev.test/article');
        return result;
    };
    const out = await agent.runRuntimeInduction('example.test', pair, runner);
    assert.equal(out.reason, 'boundary'); assert.equal(out.turns, 1); assert.equal(runner.calls.length, 1);
    assert.equal(agent.session.calls, 1); assert.equal(out.error, 'runtime-corpus-text-refused');
});

test('runtime uses the interactive ledger and guarded HTTP transport without touching study ledger caps', async () => {
    const { root, agent } = setup(), pair = ids(agent), studyDirectory = path.join(root, 'workspace/revision');
    fs.mkdirSync(studyDirectory, { recursive: true });
    const studyFile = path.join(studyDirectory, 'ledger.jsonl'), historical = 'sentinel study ledger must not be read or modified\n';
    fs.writeFileSync(studyFile, historical);
    let transports = 0;
    const runner = new DeepSeekRunner({ apiKey: 'fixture-only', ledger: { run() { throw Error('study-ledger-was-used'); } },
        fetchRequest: async (url, options) => {
            transports++; const payload = JSON.parse(options.body);
            assert.ok(!JSON.stringify(payload).includes('<main')); assert.equal(payload.thinking.type, 'disabled');
            return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ action: 'submit', rule: rule() }) } }],
                usage: { prompt_tokens: 100, completion_tokens: 20 } }), { status: 200 });
        } });
    const out = await agent.runRuntimeInduction('example.test', pair, runner);
    assert.equal(out.accepted, true, JSON.stringify(out)); assert.equal(transports, 1); assert.equal(agent.session.calls, 1);
    assert.equal(fs.readFileSync(studyFile, 'utf8'), historical); assert.ok(!fs.existsSync(path.join(studyDirectory, 'payloads')));
    const records = usage(root); assert.deepEqual(records.map(r => r.event), ['started', 'completed', 'assessment']);
    assert.ok(records.every(r => r.policy === 'runtime')); assert.equal(records[1].tokens.prompt, 100);
});

test('every runtime turn counts against LOCAL_AI_MAX_CALLS; refusals and provider failures settle correctly', async () => {
    const { root, agent } = setup({ session: new RuntimeSession({ maxCalls: 1 }) }), pair = ids(agent);
    const runner = fake([{ action: 'query', selector: 'main' }, { action: 'submit', rule: rule() }]);
    const out = await agent.runRuntimeInduction('example.test', pair, runner);
    assert.equal(out.reason, 'budget'); assert.equal(out.error, 'runtime-session-limit'); assert.equal(out.turns, 1);
    assert.equal(runner.calls.length, 1); assert.equal(agent.session.calls, 1); assert.equal(agent.session.active, 0);
    assert.equal(usage(root).filter(e => e.event === 'started').length, 1);
    const failed = setup({ session: new RuntimeSession({ maxCalls: 1 }) }), bad = fake([Error('synthetic offline failure')]);
    const failure = await failed.agent.runRuntimeInduction('example.test', ids(failed.agent), bad);
    assert.equal(failure.reason, 'provider-error'); assert.equal(failure.turns, 1); assert.equal(failed.agent.session.active, 0);
    assert.deepEqual(usage(failed.root).map(r => r.event), ['started', 'failed']);
});

test('runtime session adapters share the existing backend generation counter and reject concurrent transports', async () => {
    const session = new RuntimeSession({ maxCalls: 2 }), a = setup({ session }), pair = ids(a.agent);
    session.acquire(); // Represents an existing backend generation in progress.
    const runner = fake([{ action: 'submit', rule: rule() }]);
    const busy = await a.agent.runRuntimeInduction('example.test', pair, runner);
    assert.equal(busy.error, 'runtime-generation-busy'); assert.equal(runner.calls.length, 0); assert.equal(session.calls, 1);
    session.release();
    assert.equal((await a.agent.runRuntimeInduction('example.test', pair, runner)).accepted, true);
    const exhausted = await a.agent.runRuntimeInduction('example.test', pair, fake([]));
    assert.equal(exhausted.error, 'runtime-session-limit'); assert.equal(session.calls, 2);
    assert.throws(() => new RuntimeSession({ maxCalls: 21 }), /maxCalls/);
});

test('an existing backend HTTP-429 adapter refuses without a phantom request or usage entry', async () => {
    let reservations = 0, releases = 0;
    const { root, agent } = setup({ session: {
        acquire() { reservations++; throw Object.assign(Error('Existing backend allowance exhausted'), { status: 429 }); },
        release() { releases++; }
    } });
    const runner = fake([]), out = await agent.runRuntimeInduction('example.test', ids(agent), runner);
    assert.equal(out.reason, 'budget'); assert.equal(out.turns, 0); assert.equal(runner.calls.length, 0);
    assert.equal(reservations, 1); assert.equal(releases, 0); assert.deepEqual(usage(root), []);
});

test('runtime record path fields cannot redirect the source and byte tampering refuses before transport', async () => {
    const { root, agent } = setup(), pair = ids(agent), file = path.join(root, 'workspace/local-ai/runtime-examples', pair[0] + '.json');
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    record.file = path.join(root, 'workspace/revision/corpus/eval/private.html'); record.sourceFile = record.file;
    fs.writeFileSync(file, JSON.stringify(record));
    const good = fake([{ action: 'submit', rule: rule() }]);
    assert.equal((await agent.runRuntimeInduction('example.test', pair, good)).accepted, true);
    record.html += '<p>tampered</p>'; fs.writeFileSync(file, JSON.stringify(record));
    const runner = fake([]);
    await assert.rejects(agent.runRuntimeInduction('example.test', pair, runner), /invalid-runtime-record/);
    assert.equal(runner.calls.length, 0);
});

test('development guard remains manifest-only and rejects runtime/evaluation even with a consented id', async () => {
    const { agent } = setup(), pair = ids(agent), l = ledger(), runner = fake([], { provider: 'deepseek' });
    for (const policy of ['runtime', 'eval']) {
        await assert.rejects(Ledger.prototype.run.call(l, runner, [], { policy, pageIds: pair }), /evaluation-freeze-required/);
    }
    await assert.rejects(Ledger.prototype.run.call(l, runner, [], { policy: 'dev', pageIds: pair }), /not-in-development-manifest/);
    await assert.rejects(runLoop({ policy: 'runtime', pageIds: ['fixture-p1', 'fixture-p2'], runner, ledger: l }), /runtime-guard-required/);
    const normal = fake(['{}'], { provider: 'deepseek' });
    await Ledger.prototype.run.call(l, normal, [], { policy: 'dev', pageIds: ['fixture-p1'] });
    assert.equal(l.totals().devRequests, 1); assert.equal(runner.calls.length, 0);
});

test('runtime induction uses the evaluated (freeze v6) prompt and the output-only check', async () => {
    const procedure = require('../../../backend/agent/runtime-procedure.cjs');
    const freeze = path.resolve(__dirname, '../../../workspace/revision/freeze/evaluation-freeze.json');
    assert.equal(procedure.runtimePromptMatches(), true);
    assert.equal(procedure.RUNTIME_CHECK, 'output');
    if (fs.existsSync(freeze)) {
        const data = JSON.parse(fs.readFileSync(freeze, 'utf8'));
        assert.equal(procedure.EVALUATED_PROMPT_SHA256, data.promptSha256); assert.equal(data.settings.check, 'output');
    }
    // A title-only rule is valid and produces output but fails G3/G5: the gate check refuses it,
    // the evaluated output-only check admits it (G2-G6 become advisory).
    const titleOnly = rule({ regions: [{ role: 'body', selector: 'h1', multiple: false, required: true }] });
    const { agent } = setup(), runner = fake([{ action: 'submit', rule: titleOnly }]);
    const out = await agent.runRuntimeInduction('example.test', ids(agent), runner);
    assert.equal(out.accepted, true, JSON.stringify(out.reasons));
    assert.equal(runner.calls[0][0].content, procedure.RUNTIME_PROMPT);
    assert.equal(out.promptHash, procedure.EVALUATED_PROMPT_SHA256);
});

test('runtime disclosure previews exactly the first payload the runtime induction sends', async () => {
    const procedure = require('../../../backend/agent/runtime-procedure.cjs');
    const { firstDisclosure, payloadFor } = require('../../../backend/runtime-disclosure.cjs');
    const { JSDOM } = require('jsdom');
    const { agent } = setup(), runner = fake([{ action: 'submit', rule: rule() }]);
    await agent.runRuntimeInduction('example.test', ids(agent), runner);
    const sent = JSON.stringify(payloadFor(runner, runner.calls[0]));
    const doms = ['Alpha', 'Beta'].map(seed => new JSDOM(snapshot(seed).sanitizedHtml, { url: snapshot(seed).url }));
    try {
        const disclosure = firstDisclosure(doms.map(d => d.window.document), runner);
        assert.equal(runner.calls[0][0].content, procedure.RUNTIME_PROMPT);
        assert.equal(disclosure.payloadHash, crypto.createHash('sha256').update(sent).digest('hex'));
        assert.ok(sent.length <= disclosure.perRequestCharacters);
    } finally { doms.forEach(d => d.window.close()); }
});

test('extension applies stored v3 rules with the evaluated output-only check', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../extension/content.js'), 'utf8');
    assert.match(source, /ProcedureV3\.useTime\(document, rule, undefined, \{ check: 'output' \}\)/);
    const v3 = require('../../../extension/procedure-v3.js'), { JSDOM } = require('jsdom');
    const dom = new JSDOM(`<main class="reading"><h1>Held out title</h1><p>${prose('Held out body')}</p></main>`, { url: 'https://example.test/x' });
    try {
        const titleOnly = rule({ regions: [{ role: 'body', selector: 'h1', multiple: false, required: true }] });
        assert.equal(v3.useTime(dom.window.document, titleOnly, undefined, { check: 'output' }).accepted, true);
        assert.equal(v3.useTime(dom.window.document, titleOnly).accepted, false);
        const wrongAnchor = rule({ applicability: { hostname: 'example.test', anchors: [{ selector: 'main.other', min: 1, max: 1 }] } });
        assert.equal(v3.useTime(dom.window.document, wrongAnchor, undefined, { check: 'output' }).accepted, false);
    } finally { dom.window.close(); }
});
