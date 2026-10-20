const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createLocalServer, cleanHTML, validateRule, hostname } = require('../../backend/local-ai.cjs');
const { DeepSeekRunner, sharedKey } = require('../../backend/deepseek-runner.cjs');
const { CodexRunner, childEnvironment } = require('../../backend/codex-runner.cjs');
const root = path.resolve(__dirname, '../..');
const scratch = fs.mkdtempSync(path.join(root, 'workspace/codex-luna-tests-'));
const html = '<main><h1>Story</h1><p>Useful content</p></main><nav>Navigation</nav>';
const rule = { main: 'main', exclude: ['nav'], name: 'Story' };
const fake = { async generate() { return { rule, threadId: 'test-only', usage: { input_tokens: 30, output_tokens: 15 } }; } };
async function listen(t, options = {}) {
    const server = createLocalServer({ runner: fake, directory: fs.mkdtempSync(path.join(scratch, 'cache-')), ...options });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise(resolve => server.close(resolve)));
    const url = 'http://127.0.0.1:' + server.address().port;
    const request = async (route, data, headers = {}) => {
        const response = await fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
        return { status: response.status, body: await response.json() };
    };
    return { server, url, request };
}
test('one generation is reused across pages and a server restart', async t => {
    let count = 0;
    const directory = fs.mkdtempSync(path.join(scratch, 'reuse-'));
    const runner = { async generate(input) { count++; assert.match(input, /Useful content/); return fake.generate(); } };
    const first = await listen(t, { runner, directory });
    assert.equal((await first.request('/analyze', { hostname: 'example.org', html })).body.source, 'generated');
    assert.equal((await first.request('/analyze', { hostname: 'example.org', html: '<main>Second page</main>' })).body.source, 'local-cache');
    const second = await listen(t, { runner, directory });
    assert.equal((await second.request('/analyze', { hostname: 'example.org', html })).body.source, 'local-cache');
    assert.equal(count, 1);
    const ledger = fs.readFileSync(path.join(directory, 'usage.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(ledger.map(x => x.event), ['started', 'completed']);
    assert.equal(ledger[1].usage.output_tokens, 15);
    assert.doesNotMatch(JSON.stringify(ledger), /Useful content|example.org/);
});
test('concurrent requests share one generation; other hosts receive bounded backpressure', async t => {
    let finish, count = 0;
    const started = new Promise(resolve => { finish = resolve; });
    let ready;
    const entered = new Promise(resolve => { ready = resolve; });
    const app = await listen(t, { runner: { async generate() { count++; ready(); await started; return fake.generate(); } } });
    const first = app.request('/analyze', { hostname: 'example.org', html }); await entered;
    const same = app.request('/analyze', { hostname: 'example.org', html });
    assert.equal((await app.request('/analyze', { hostname: 'other.org', html })).status, 429);
    finish(); assert.equal((await first).status, 200); assert.equal((await same).status, 200); assert.equal(count, 1);
});
test('failures consume the attempt cap, remain uncached, and are recorded', async t => {
    const directory = fs.mkdtempSync(path.join(scratch, 'failed-'));
    const app = await listen(t, { directory, maxCalls: 1, runner: { async generate() { throw Error('unavailable'); } } });
    assert.equal((await app.request('/analyze', { hostname: 'example.org', html })).body.status, 'fallback');
    assert.equal((await app.request('/analyze', { hostname: 'example.org', html })).status, 429);
    assert.equal((await (await fetch(app.url + '/rules/example.org')).json()).rule, null);
    assert.match(fs.readFileSync(path.join(directory, 'usage.jsonl'), 'utf8'), /"event":"failed"/);
});
test('browser origins, hostname, type and size are checked before inference', async t => {
    let calls = 0;
    const app = await listen(t, { runner: { async generate() { calls++; return fake.generate(); } } });
    const data = { hostname: 'example.org', html };
    assert.equal((await app.request('/analyze', data, { Origin: 'https://untrusted.example' })).status, 403);
    const spoofStatus = await new Promise((resolve, reject) => {
        const request = http.request(app.url + '/analyze', { method: 'POST', headers: { Host: 'untrusted.example:7861', 'Content-Type': 'application/json' } },
            response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
        request.on('error', reject); request.end(JSON.stringify(data));
    });
    assert.equal(spoofStatus, 403);
    assert.equal((await app.request('/analyze', data, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await app.request('/analyze', { ...data, hostname: '../escape' })).body.status, 'fallback');
    assert.equal((await app.request('/analyze', { ...data, html: 'x'.repeat(270000) })).status, 413);
    assert.equal(calls, 0);
});
test('verification is local only; reporting archives a rule rather than deleting it', async t => {
    let calls = 0;
    const directory = fs.mkdtempSync(path.join(scratch, 'verify-'));
    const app = await listen(t, { directory, runner: { async generate() { calls++; return fake.generate(); } } });
    await app.request('/analyze', { hostname: 'example.org', html });
    const response = await app.request('/verify', { hostname: 'example.org', rawHTML: html, rule });
    assert.equal(response.body.verification.status, 'local-only'); assert.equal(calls, 1);
    await app.request('/report', { hostname: 'example.org' });
    assert.equal(fs.readdirSync(path.join(directory, 'archive')).length, 1);
    assert.equal((await (await fetch(app.url + '/rules/example.org')).json()).rule, null);
});
test('preprocessing removes active content and form values; invalid rules are rejected', () => {
    const cleaned = cleanHTML('<main onclick="alert(1)"><h1>Story</h1><p>Useful</p><script>bad</script><input value="private-value"><textarea>private-value</textarea></main>');
    assert.doesNotMatch(cleaned, /onclick|<script|private-value/);
    assert.throws(() => validateRule({ ...rule, main: 'h1' }, cleaned));
    assert.throws(() => validateRule({ ...rule, main: '[invalid' }, cleaned));
    assert.throws(() => validateRule({ ...rule, exclude: ['*'] }, cleaned));
    assert.throws(() => hostname('example.org/path'));
});
test('local extension rule service sends no traffic to Firebase or the hosted backend', async () => {
    const urls = [];
    let source = fs.readFileSync(path.join(root, 'extension/rule-service.js'), 'utf8');
    source = source.replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');
    const context = vm.createContext({ BACKEND_CONFIG: { current: 'localDeepSeek' }, getBackendURL: () => 'http://127.0.0.1:7861',
        FirebaseService: class { constructor() { throw Error('Hosted service must not be constructed'); } },
        fetch: async url => { urls.push(url); return { ok: true, json: async () => ({ rule }) }; } });
    vm.runInContext(source, context);
    const service = context.createRuleService();
    assert.equal((await service.getRule('example.org')).main, 'main'); await service.reportRule('example.org');
    assert.ok(urls.every(x => x.startsWith('http://127.0.0.1:7861/')));
});
test('DeepSeek request pins current model, disables thinking, and requests bounded JSON', async () => {
    let calls = 0;
    const runner = new DeepSeekRunner({ apiKey: 'dummy-test-key', fetchRequest: async (url, options) => {
        calls++; assert.equal(url, 'https://api.deepseek.com/chat/completions');
        assert.equal(options.headers.Authorization, 'Bearer dummy-test-key');
        const request = JSON.parse(options.body);
        assert.equal(request.model, 'deepseek-flash'); assert.equal(request.thinking.type, 'disabled');
        assert.equal(request.reasoning_effort, 'none'); assert.equal(request.max_tokens, 1024);
        assert.equal(request.response_format.type, 'json_object'); assert.equal(request.tools, undefined);
        return new Response(JSON.stringify({ id: 'fake-api-request', model: 'deepseek-flash',
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(rule) } }],
            usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 } }));
    } });
    const result = await runner.generate(html); assert.equal(result.rule.main, 'main');
    assert.equal(result.requestId, 'fake-api-request'); assert.equal(result.usage.total_tokens, 60); assert.equal(calls, 1);
});
test('hosted mode preserves anonymous Firebase GET and report-push contracts without SDK imports', async () => {
    const requests = [];
    let source = fs.readFileSync(path.join(root, 'extension/rule-service.js'), 'utf8');
    assert.doesNotMatch(source, /import\s*\(/);
    source = source.replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');
    const context = vm.createContext({ BACKEND_CONFIG: { current: 'production', firebaseDatabaseURL: 'https://firebase-double.invalid' },
        getBackendURL: () => 'https://backend-double.invalid',
        fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => rule }; } });
    vm.runInContext(source, context);
    const service = context.createRuleService();
    assert.equal((await service.getRule('www.example.org')).main, 'main');
    await service.reportRule('www.example.org');
    assert.equal(requests[0].url, 'https://firebase-double.invalid/rules/www_example_org.json');
    assert.equal(requests[1].url, 'https://firebase-double.invalid/reports/www_example_org.json');
    assert.equal(requests[1].options.method, 'POST');
    assert.equal(JSON.parse(requests[1].options.body).hostname, 'www.example.org');
});
test('DeepSeek authentication errors stop without exposing provider content or retrying', async () => {
    let calls = 0;
    const runner = new DeepSeekRunner({ apiKey: 'dummy-test-key', fetchRequest: async () => {
        calls++; return new Response('sensitive-provider-diagnostic', { status: 401 });
    } });
    await assert.rejects(runner.generate(html), error => /HTTP 401/.test(error.message) && !/sensitive/.test(error.message));
    assert.equal(calls, 1);
});
test('DeepSeek incomplete outputs retain usage and are not cached', async t => {
    const runner = new DeepSeekRunner({ apiKey: 'dummy-test-key', fetchRequest: async () => new Response(JSON.stringify({ id: 'cutoff',
        choices: [{ finish_reason: 'length', message: { content: '{' } }], usage: { total_tokens: 99 } })) });
    const directory = fs.mkdtempSync(path.join(scratch, 'cutoff-'));
    const app = await listen(t, { runner, directory });
    assert.equal((await app.request('/analyze', { hostname: 'example.org', html })).body.status, 'fallback');
    assert.equal((await (await fetch(app.url + '/rules/example.org')).json()).rule, null);
    const ledger = fs.readFileSync(path.join(directory, 'usage.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(ledger[1].usage.total_tokens, 99); assert.equal(ledger[1].providerRequestId, 'cutoff');
});
test('DeepSeek timeout aborts a request with no retry', async () => {
    let calls = 0;
    const runner = new DeepSeekRunner({ apiKey: 'dummy-test-key', timeoutMs: 20, fetchRequest: (url, options) => {
        calls++; return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted'))));
    } });
    await assert.rejects(runner.generate(html), /timed out/); assert.equal(calls, 1); assert.equal(runner.controllers.size, 0);
});
test('shared secret loader reads only the requested key and supports quoted values', () => {
    const file = path.join(scratch, 'shared-test.env');
    fs.writeFileSync(file, 'UNRELATED_SECRET=unrelated\nexport DEEPSEEK_API_KEY="dummy-test-key" # comment\n');
    assert.equal(sharedKey({ file, environment: {} }), 'dummy-test-key');
    assert.equal(sharedKey({ file, environment: { DEEPSEEK_API_KEY: 'environment-override' } }), 'environment-override');
});
test('caches from another model are regenerated and archived rather than mislabeled', async t => {
    const directory = fs.mkdtempSync(path.join(scratch, 'model-'));
    const first = await listen(t, { directory, runner: { ...fake, provider: 'test', model: 'first' } });
    await first.request('/analyze', { hostname: 'example.org', html });
    let count = 0;
    const next = await listen(t, { directory, runner: { provider: 'test', model: 'second', async generate() { count++; return fake.generate(); } } });
    assert.equal((await next.request('/analyze', { hostname: 'example.org', html })).body.model, 'second');
    assert.equal(count, 1); assert.equal(fs.readdirSync(path.join(directory, 'archive')).length, 1);
});
test('Codex arguments pin Luna and medium effort, JSON schema and ChatGPT auth', async () => {
    const script = path.join(scratch, 'fake-codex.cjs');
    fs.writeFileSync(script, `const events = [{type:'thread.started',thread_id:'fake-thread'},{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(${JSON.stringify({ ...rule, name: 'Café' })})}},{type:'turn.completed',usage:{input_tokens:10,output_tokens:5}}]; process.stdin.resume(); process.stdin.on('end',()=>{const data=Buffer.from(events.map(JSON.stringify).join('\\n')+'\\n'); for(let i=0;i<data.length;i++)process.stdout.write(data.subarray(i,i+1));});`);
    let actualArgs;
    const runner = new CodexRunner({ executable: process.execPath, spawnProcess: (exe, args, options) => {
        actualArgs = args; assert.equal(options.shell, false); return spawn(exe, [script, ...args], options);
    } });
    const out = await runner.generate(html); assert.equal(out.rule.name, 'Café'); assert.equal(out.threadId, 'fake-thread');
    assert.ok(actualArgs.includes('gpt-6-luna')); assert.ok(actualArgs.includes('model_reasoning_effort="medium"'));
    assert.ok(actualArgs.includes('forced_login_method="chatgpt"')); assert.ok(actualArgs.includes('--output-schema'));
    assert.ok(actualArgs.includes('features.shell_tool=false')); assert.ok(actualArgs.includes('--ephemeral'));
    assert.deepEqual(childEnvironment({ PATH: 'safe', OPENAI_API_KEY: 'dummy', GEMINI_API_KEY: 'dummy', FIREBASE_SECRET: 'dummy' }), { PATH: 'safe' });
});
test('Codex timeout terminates the child without a retry', async () => {
    const script = path.join(scratch, 'hanging-codex.cjs'); fs.writeFileSync(script, 'process.stdin.resume();setInterval(()=>{},1000);');
    let count = 0;
    const runner = new CodexRunner({ executable: process.execPath, timeoutMs: 1000,
        spawnProcess: (exe, args, options) => { count++; return spawn(exe, [script], options); } });
    await assert.rejects(runner.generate(html), /timed out/); assert.equal(count, 1); assert.equal(runner.children.size, 0);
});
