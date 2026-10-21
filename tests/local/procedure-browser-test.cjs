// Actual production content/core + background/service, isolated Chromium,
// ephemeral API and explicitly fake runner. Chrome messaging is bridged/doubled.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { chromium } = require('C:/Users/final/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { createLocalServer } = require('../../backend/local-ai.cjs');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'workspace/task023/preservation-v2/browser-admission');
fs.mkdirSync(output, { recursive: true });
async function startBackground(endpoint, observed, { failLookup = false, legacyResponse } = {}) {
    const listeners = [];
    const context = vm.createContext({ URL, crypto: require('node:crypto').webcrypto, console: { log() {}, warn() {}, error() {} }, TextEncoder,
        BACKEND_CONFIG: { current: 'localDeepSeek' }, getBackendURL: () => endpoint,
        fetch: async (url, options) => { if (legacyResponse !== undefined && (!options || options.method === 'GET')) return new Response(JSON.stringify(legacyResponse), { status: 200 }); if (failLookup && (!options || options.method === 'GET')) return new Response('', { status: 503 }); if (options?.body) observed.push({ url, body: JSON.parse(options.body) }); return fetch(url, options); },
        chrome: { sidePanel: { setPanelBehavior: async () => {} }, tabs: { create() {} }, runtime: { onInstalled: { addListener() {} }, onMessage: { addListener: callback => listeners.push(callback) }, sendMessage: async () => {} } },
        setInterval: () => 1, clearInterval() {} });
    const source = name => fs.readFileSync(path.join(root, 'extension', name), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');
    vm.runInContext(source('rule-service.js'), context); vm.runInContext(source('background.js'), context);
    return request => new Promise(resolve => listeners[0](request, {}, resolve));
}
if (require.main === module) (async () => {
    let runnerCalls = 0;
    const observed = [];
    const server = createLocalServer({ directory: fs.mkdtempSync(path.join(output, 'api-')), maxCalls: 2,
        runner: { provider: 'fake-local', model: 'fixture', async generate(html) { runnerCalls++; return { rule: { main: html.includes('<article') ? 'article' : 'main', exclude: [], name: 'Fake fixture' } }; } } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const background = await startBackground('http://127.0.0.1:' + server.address().port, observed);
    const browser = await chromium.launch({ executablePath: 'C:/Users/final/AppData/Local/Chromium/Application/chrome.exe', headless: true });
    async function open(url, html, dispatch = background) {
        const page = await browser.newPage();
        await page.route('**/*', route => route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()
            ? route.fulfill({ status: 200, contentType: 'text/html', body: html }) : route.abort());
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.exposeFunction('__backgroundMessage', dispatch);
        await page.evaluate(() => { window.__listeners = []; window.chrome.runtime = { sendMessage: request => window.__backgroundMessage(request), onMessage: { addListener: callback => window.__listeners.push(callback) } }; });
        for (const name of ['procedure-core.js', 'content.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'extension', name), 'utf8') });
        return { page, extract: () => page.evaluate(() => new Promise(resolve => window.__listeners[0]({ action: 'EXTRACT_CONTEXT' }, {}, resolve))) };
    }
    const pages = [], evidence = [];
    try {
        const first = await open('http://example.test/read?id=1#first', '<main><h1>Alpha title</h1><p>First complete reading text.</p><form><input value=clientPrivateInput><textarea>clientPrivateTextarea</textarea></form></main>'); pages.push(first.page);
        const seed = await first.extract(); assert.equal(seed.validationComplete, true); assert(!seed.validationHTML.includes('clientPrivate')); assert(!seed.analysisHTML.includes('clientPrivate')); assert.equal(seed.usedRule, false);
        assert.equal(await first.page.evaluate(() => window.isSecureContext), false);
        assert.equal(await first.page.evaluate(() => typeof crypto.subtle), 'undefined');
        assert.equal(seed.exampleKey, undefined);
        const provisional = await background({ action: 'ANALYZE_PAGE', context: seed }); assert.equal(provisional.status, 'pending');
        assert.equal(observed.find(row => row.url.endsWith('/analyze')).body.exampleKey, createHash('sha256').update('http://example.test/read?id=1').digest('hex'));
        const reload = await background({ action: 'ANALYZE_PAGE', context: await first.extract() }); assert.equal(reload.status, 'pending'); assert.equal(runnerCalls, 1);
        const second = await open('http://example.test/read?id=2#second', '<main><h1>Beta title</h1><p>Second distinct complete reading text.</p></main>'); pages.push(second.page);
        const context = await second.extract(); assert.notEqual(context.url, seed.url);
        const admitted = await background({ action: 'ANALYZE_PAGE', context }); assert.equal(admitted.status, 'admitted'); assert.equal(runnerCalls, 1);
        const delivered = await second.extract(); assert.equal(delivered.procedureDelivered, true); assert.equal(delivered.usedRule, true); assert.equal(delivered.noFallback, true);
        let latePage, injected = false;
        const lateDispatch = async request => {
            const response = await background(request);
            if (request.action === 'GET_RULES' && !injected) { injected = true; await latePage.evaluate(() => { const section = document.createElement('section'); section.innerHTML = '<p>Newly added supporting reading text</p>'; document.body.appendChild(section); }); }
            return response;
        };
        const late = await open('https://example.test/read?id=late', '<main><h1>Late update</h1><p>Initial reading text.</p></main>', lateDispatch); latePage = late.page; pages.push(late.page);
        const lateContext = await late.extract(); assert.equal(lateContext.usedRule, false); assert.equal(lateContext.ruleFailure, true); assert(lateContext.html.includes('Newly added supporting reading text'));
        assert.equal((await background({ action: 'ANALYZE_PAGE', context: lateContext })).reason, 'matching-family-failed'); assert.equal(runnerCalls, 1);
        let fallbackPage;
        const fallbackDispatch = async request => { const response = await background(request); if (request.action === 'GET_RULES') await fallbackPage.evaluate(() => { const p = document.createElement('p'); p.textContent = 'New fallback prose during lookup'; document.body.appendChild(p); }); return response; };
        const liveFallback = await open('https://fallback.test/read', '<main><p>Existing fallback reading</p></main>', fallbackDispatch); fallbackPage = liveFallback.page; pages.push(liveFallback.page);
        const liveFallbackContext = await liveFallback.extract(); assert.equal(liveFallbackContext.usedRule, false); assert(liveFallbackContext.html.includes('New fallback prose during lookup'));
        const mismatch = await open('https://example.test/article?id=3', '<article><h1>New structural family</h1><p>Third reading text.</p></article>'); pages.push(mismatch.page);
        const mismatchContext = await mismatch.extract(); assert.equal(mismatchContext.ruleFailure, false);
        assert.equal((await background({ action: 'ANALYZE_PAGE', context: mismatchContext })).status, 'pending'); assert.equal(runnerCalls, 2);
        const large = await open('https://other.test/large', '<main><p>' + 'Substantial prose. '.repeat(10000) + '</p></main>'); pages.push(large.page);
        const incomplete = await large.extract(); assert.equal(incomplete.validationComplete, false);
        assert.equal((await background({ action: 'ANALYZE_PAGE', context: incomplete })).status, 'pending'); assert.equal(runnerCalls, 2);
        assert(!JSON.stringify(observed).includes('clientPrivate'));
        assert(observed.filter(row => row.url.endsWith('/analyze')).every(row => !('url' in row.body) && row.body.protocol === 2));
        const failedObserved = [];
        const failedBackground = await startBackground('http://127.0.0.1:' + server.address().port, failedObserved, { failLookup: true });
        const unavailable = await open('https://unavailable.test/read', '<main><h1>Still readable</h1><p>Basic view during cache outage</p></main>', failedBackground); pages.push(unavailable.page);
        const unavailableContext = await unavailable.extract(); assert.equal(unavailableContext.lookupAvailable, false); assert.equal(unavailableContext.validationHTML, undefined);
        assert.equal((await failedBackground({ action: 'ANALYZE_PAGE', context: unavailableContext })).reason, 'procedure-lookup-unavailable');
        assert.equal(failedObserved.length, 0); assert.equal(runnerCalls, 2);
        const legacyObserved = [];
        const legacyBackground = await startBackground('http://127.0.0.1:' + server.address().port, legacyObserved, { legacyResponse: { rule: { main: 'main', exclude: [], name: 'Existing legacy cache' } } });
        const legacyPage = await open('https://legacy.test/read', '<main><h1>Legacy title</h1><p>Existing cached reading</p></main>', legacyBackground); pages.push(legacyPage.page);
        const legacyContext = await legacyPage.extract(); assert.equal(legacyContext.localProtocol, 1); assert.equal(legacyContext.usedRule, true); assert.equal(legacyContext.delivery, 'legacy-rule'); assert.equal(legacyObserved.length, 0);
        const legacyEmpty = await startBackground('http://127.0.0.1:' + server.address().port, legacyObserved, { legacyResponse: { rule: null } });
        const legacyEmptyPage = await open('https://legacy.test/missing', '<main><p>Basic view without v2 server</p></main>', legacyEmpty); pages.push(legacyEmptyPage.page);
        const legacyEmptyContext = await legacyEmptyPage.extract();
        assert.equal((await legacyEmpty({ action: 'ANALYZE_PAGE', context: legacyEmptyContext })).reason, 'legacy-server-does-not-support-admission'); assert.equal(legacyObserved.length, 0);
        const beforeIPCFailure = observed.length;
        const ipcFailure = await open('http://ipc-failure.test/read', '<main><h1>Transport failure title</h1><p>Basic view survives IPC failure</p></main>', async () => { throw Error('Synthetic GET_RULES transport rejection'); }); pages.push(ipcFailure.page);
        const ipcContext = await ipcFailure.extract(); assert.equal(ipcContext.lookupAvailable, false); assert.equal(ipcContext.usedRule, false); assert(ipcContext.html.includes('Basic view survives IPC failure'));
        assert.equal((await background({ action: 'ANALYZE_PAGE', context: ipcContext })).reason, 'procedure-lookup-unavailable');
        assert.equal((await background({ action: 'ANALYZE_PAGE', context: { hostname: 'example.test', url: 'http://example.test/unconfirmed', html: '<main>Reading</main>' } })).reason, 'unconfirmed-procedure-lookup');
        assert.equal(observed.length, beforeIPCFailure); assert.equal(runnerCalls, 2);
        evidence.push({ ipcFailureAnalyzeRequests: observed.length - beforeIPCFailure, legacyServerCachedDelivery: legacyContext.delivery, legacyServerAnalyzeRequests: legacyObserved.length, cacheFailureAnalyzeRequests: failedObserved.length, seed: provisional, reload, second: admitted, delivery: delivered.delivery, differentFamilyRuleFailure: mismatchContext.ruleFailure,
            incomplete: incomplete.validationLimitation, fakeRunnerInvocations: runnerCalls, newProviderAPIRequests: 0,
            mode: 'real-isolated-Chromium-production-core-content-background-service-ephemeral-fake-runner-messaging-double' });
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
        console.log('Native production local-route integration: provisional/reload/distinct-query admission, delivered view, incompatible family and incomplete context passed.');
    } finally { for (const page of pages) await page.close().catch(() => {}); await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { startBackground };
