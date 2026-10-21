// Evaluate the actual production scripts with local Chrome/provider doubles only.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const sourceFile = name => process.env.LOCAL_BASELINE === '1'
    ? path.join(root, 'workspace/task023/archive', path.basename(name)) : path.join(root, name);
const quiet = { log() {}, warn() {}, error() {} };
function page(html, url = 'https://example.org/page', rules = [], options = {}) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    // JSDOM does not implement innerText. This metadata shim does not affect extraction.
    Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
    const listeners = [];
    dom.window.chrome = { runtime: {
        sendMessage: async () => ({ rules: options.failCache ? [] : rules }),
        onMessage: { addListener: fn => listeners.push(fn) }
    } };
    dom.window.console = quiet;
    if (process.env.LOCAL_BASELINE !== '1') dom.window.eval(fs.readFileSync(path.join(root, 'extension/procedure-core.js'), 'utf8'));
    dom.window.eval(fs.readFileSync(sourceFile('extension/content.js'), 'utf8'));
    return {
        dom,
        extract: (request = { action: 'EXTRACT_CONTEXT' }) => new Promise(resolve => listeners[0](request, {}, resolve)),
        close: () => dom.window.close()
    };
}
function background({ rule = null, fail = false, failCache = false, generatedRule = { main: 'main', name: 'new' } } = {}) {
    const calls = [];
    const listeners = [];
    const context = vm.createContext({ console: quiet,
        // FirebaseService catches request errors and resolves null in production.
        FirebaseService: class { async getRule() { return failCache ? null : rule; } },
        createRuleService: () => ({ async getRule() { return failCache ? null : rule; } }),
        getBackendURL: () => 'https://local-double.invalid',
        chrome: { sidePanel: { setPanelBehavior: async () => {} }, tabs: { create() {} },
            runtime: { onInstalled: { addListener() {} }, onMessage: { addListener: fn => listeners.push(fn) }, sendMessage: async () => {} } },
        fetch: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); if (fail) throw Error('offline'); return { ok: true, json: async () => ({ success: true, rule: generatedRule }) }; },
        setInterval: () => 1, clearInterval() {}
    });
    const source = fs.readFileSync(sourceFile('extension/background.js'), 'utf8').replace(/^import .*;\r?\n/gm, '');
    vm.runInContext(source, context);
    return { calls, analyze: context => new Promise(resolve => listeners[0]({ action: 'ANALYZE_PAGE', context }, {}, resolve)) };
}
function scorer() {
    // Read the production function without importing backend/index.js (which starts services).
    // There is no duplicate scoring algorithm, and no config or provider code is evaluated.
    const source = fs.readFileSync(path.join(root, 'backend/index.js'), 'utf8');
    const start = source.indexOf('function validateExtractionDOM(');
    const end = source.indexOf('async function verifyRule(', start);
    if (start < 0 || end < 0) throw Error('Production scorer boundary changed');
    return vm.runInNewContext(source.slice(start, end) + '\nvalidateExtractionDOM', { require, log() {} });
}
module.exports = { page, background, scorer, root, sourceFile };
