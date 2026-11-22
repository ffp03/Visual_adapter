'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const v3 = require('../../extension/procedure-v3.js');
const { ROOT, sameHostname } = require('./pages.cjs');
const { hash, tokens, cost, pricesAt, BoundaryError, BudgetError } = require('./ledger.cjs');
const { dispatch } = require('./transport.cjs');
const { extractText } = require('../../tests/revision/eval/text.cjs');
const { createDOM } = require('../../tests/revision/eval/dom.cjs');
// backend/ and the harness may resolve different jsdom installations. Options
// passed to the shared DOM factory must come from that factory's installation.
const textRequire = require('node:module').createRequire(require.resolve('../../tests/revision/eval/dom.cjs'));
const { VirtualConsole: TextVirtualConsole } = textRequire('jsdom');
const textParse5 = textRequire('parse5');
const guards = new WeakSet();
const ID = /^runtime-[0-9a-f-]{36}$/;
const MAX_HTML = 1048576;

function refused(reason) { throw Object.assign(new BoundaryError(reason), { status: 403 }); }
function hostName(host) {
    if (typeof host !== 'string' || !/^[a-z0-9.-]{1,253}$/i.test(host)) refused('runtime-host-required');
    const normalized = new URL('https://' + host).hostname;
    if (normalized !== host.toLowerCase() || normalized.includes('..')) refused('runtime-host-required');
    return normalized;
}
function webURL(value) {
    let u; try { u = new URL(value); } catch { refused('runtime-web-page-required'); }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) refused('runtime-web-page-required');
    // Corpus files and local corpus-serving URLs are never runtime sources.
    if (/(?:^|\/)workspace\/revision\/corpus(?:\/|$)|(?:^|\/)corpus\/(?:eval|dev)(?:\/|$)/i.test(decodeURIComponent(u.pathname))) refused('runtime-corpus-source-refused');
    u.hash = ''; return u.href;
}
function htmlValue(html) {
    if (typeof html !== 'string' || !html.trim() || Buffer.byteLength(html) > MAX_HTML) refused('runtime-html-bound');
    return html;
}
function contained(root, file) {
    let relative;
    try { relative = path.relative(fs.realpathSync(root), fs.realpathSync(file)); }
    catch { refused('runtime-source-unavailable'); }
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) refused('runtime-source-outside-store');
}
function fixedDirectory(directory) {
    fs.mkdirSync(directory, { recursive: true });
    if (path.relative(path.resolve(directory), fs.realpathSync(directory)) !== '') refused('runtime-linked-directory-refused');
}

// The same extractor defines both sides of this boundary. Keep the original
// text fingerprint and its runtime-sanitized projection: callers supply BODY
// snapshots after NOISE/form stripping, rather than complete capture bytes.
function textFingerprints(html, url) {
    // The extractor excludes these subtrees and never reads CSS; the sanitizer
    // removes the same subtrees and does not consult inline styles. Strip them
    // after HTML parsing, before jsdom constructs costly CSSOM/lifecycle state.
    const parsed = textParse5.parse(html, { scriptingEnabled: false });
    const ignored = new Set(['script', 'style', 'template', 'noscript']);
    const strip = node => {
        if (node.attrs) node.attrs = node.attrs.filter(a => a.name !== 'style');
        if (node.childNodes) {
            node.childNodes = node.childNodes.filter(n => !ignored.has(n.tagName));
            node.childNodes.forEach(strip);
        }
    };
    strip(parsed);
    const dom = createDOM(textParse5.serialize(parsed), { url, virtualConsole: new TextVirtualConsole() });
    try {
        const doc = dom.window.document;
        return [hash(extractText(doc)), hash(extractText(v3.clean(doc.body, doc, true)))];
    } finally { dom.window.close(); }
}
const sourceVersion = file => {
    const s = fs.statSync(file); return [s.size, s.mtimeMs, s.ctimeMs, s.ino].join(':');
};
const fingerprintVersion = () => hash([__filename, require.resolve('../../tests/revision/eval/text.cjs'),
    require.resolve('../../tests/revision/eval/dom.cjs'), require.resolve('../../extension/procedure-v3.js'),
    require.resolve('../../extension/procedure-core.js')].map(f => fs.readFileSync(f, 'utf8')).join('\n'));

// This local worker yields after each closed DOM so jsdom's queued lifecycle
// tasks release it. Synchronously constructing hundreds of DOMs in the backend
// would retain them until its request handler returned.
async function buildFingerprints({ corpus, sources }) {
    const entries = [];
    for (const { file, version } of sources) {
        contained(corpus, file);
        if (sourceVersion(file) !== version) refused('runtime-corpus-source-changed');
        const fingerprints = textFingerprints(fs.readFileSync(file, 'utf8'), 'https://corpus.invalid/');
        if (sourceVersion(file) !== version) refused('runtime-corpus-source-changed');
        entries.push([file, { version, fingerprints }]);
        await new Promise(resolve => setImmediate(resolve));
    }
    return entries;
}

class RuntimeRegistry {
    constructor({ root = ROOT } = {}) {
        this.root = path.resolve(root);
        this.directory = path.join(this.root, 'workspace/local-ai/runtime-examples');
        this.localDirectory = path.join(this.root, 'workspace/local-ai');
        this.consents = new Map(); this.tabs = new Map();
        this.corpusFingerprints = new Map();
        this.fingerprintCacheLoaded = false;
        fixedDirectory(this.localDirectory); fixedDirectory(this.directory);
        // Reject a redirected example-store directory before writing anything.
        contained(this.localDirectory, this.directory);
    }
    refuseEvaluation(url, html) {
        const sourceHash = hash(html);
        const corpus = path.join(this.root, 'workspace/revision/corpus');
        const sources = new Set(), evaluationHosts = new Set(), captureHashes = new Set();
        for (const name of ['manifest.json', 'dev-manifest.json', 'eval-manifest.json']) {
            const file = path.join(corpus, name);
            if (!fs.existsSync(file)) continue;
            const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
            const sites = manifest.sites || [];
            const isEvaluation = p => name === 'eval-manifest.json' || p.split === 'eval' || /^eval(?:-|$)/.test(p.siteId || p.pageId || p.id || '');
            for (const site of sites) if (isEvaluation({ ...site, split: site.split || manifest.split }) && site.host) evaluationHosts.add(hostName(site.host));
            const pages = sites.flatMap(s => (s.pages || []).map(p => ({ ...p, host: p.host || s.host, siteId: p.siteId || s.siteId, split: p.split || s.split || manifest.split })));
            pages.push(...(manifest.pages || []).map(p => ({ ...p, split: p.split || manifest.split })));
            for (const p of pages) {
                const urls = [p.url, p.finalUrl].filter(Boolean).map(webURL);
                if (isEvaluation(p)) {
                    if (p.host || p.site) evaluationHosts.add(hostName(p.host || p.site));
                    urls.forEach(u => evaluationHosts.add(new URL(u).hostname));
                    [p.sha256, p.sourceSha256].filter(Boolean).forEach(h => captureHashes.add(h));
                }
                // Manifest paths are trusted metadata, never runtime arguments.
                const raw = p.sourceFile || p.htmlPath || p.capturePath || p.file || p.domPath;
                if (raw) {
                    const fromRoot = path.resolve(this.root, raw), fromManifest = path.resolve(corpus, raw);
                    sources.add(path.isAbsolute(raw) ? raw : fs.existsSync(fromRoot) ? fromRoot : fromManifest);
                }
            }
        }
        if ([...evaluationHosts].some(host => sameHostname(host,new URL(url).hostname))) refused('runtime-evaluation-page-refused:host');
        if (captureHashes.has(sourceHash)) refused('runtime-evaluation-page-refused:capture-hash');
        // Include archived/replaced captures and pages not yet indexed by a
        // manifest. Never follow corpus symlinks out to another data store.
        const walk = directory => {
            for (const e of fs.readdirSync(directory, { withFileTypes: true })) {
                const file = path.join(directory, e.name);
                if (e.isDirectory()) walk(file);
                else if (e.isFile() && /\.html?$/i.test(e.name)) sources.add(file);
            }
        };
        if (fs.existsSync(corpus)) walk(corpus);
        const algorithm = fingerprintVersion(), cacheFile = path.join(this.localDirectory, 'runtime-corpus-fingerprints.json');
        if (!this.fingerprintCacheLoaded) {
            if (fs.existsSync(cacheFile)) {
                contained(this.localDirectory, cacheFile);
                const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
                if (cached.algorithm === algorithm && Array.isArray(cached.entries)) this.corpusFingerprints = new Map(cached.entries);
            }
            this.fingerprintCacheLoaded = true;
        }
        const pending = [];
        for (const file of sources) {
            contained(corpus, file);
            const version = sourceVersion(file), cached = this.corpusFingerprints.get(file);
            if (!cached || cached.version !== version || !Array.isArray(cached.fingerprints)
                || !cached.fingerprints.length || cached.fingerprints.some(f => !/^[a-f0-9]{64}$/.test(f))) pending.push({ file, version });
        }
        if (pending.length) {
            const entries = [];
            // Restart periodically as well as yielding between DOMs. This
            // bounds engine/selector caches on a whole-corpus cold build.
            for (let offset = 0; offset < pending.length; offset += 32) {
                const child = spawnSync(process.execPath, ['--max-old-space-size=1024', __filename, '--corpus-fingerprints'], {
                    input: JSON.stringify({ corpus, sources: pending.slice(offset, offset + 32) }), encoding: 'utf8', windowsHide: true,
                    timeout: 300000, maxBuffer: 4194304
                });
                if (child.status !== 0 || child.error) refused('runtime-corpus-fingerprint-build-failed');
                entries.push(...JSON.parse(child.stdout));
            }
            if (!Array.isArray(entries) || entries.length !== pending.length || entries.some(([file, value], i) =>
                file !== pending[i].file || value.version !== pending[i].version || sourceVersion(file) !== value.version
                || !Array.isArray(value.fingerprints) || value.fingerprints.length !== 2 || value.fingerprints.some(f => !/^[a-f0-9]{64}$/.test(f)))) refused('runtime-corpus-fingerprint-build-invalid');
            entries.forEach(([file, value]) => this.corpusFingerprints.set(file, value));
            fixedDirectory(this.localDirectory);
            const temporary = cacheFile + '.' + randomUUID() + '.tmp';
            fs.writeFileSync(temporary, JSON.stringify({ algorithm, entries: [...this.corpusFingerprints] }), { flag: 'wx', mode: 0o600 });
            if (fs.existsSync(cacheFile)) {
                contained(this.localDirectory, cacheFile);
                const archive = path.join(this.localDirectory, 'runtime-boundary-cache/archive'); fixedDirectory(archive);
                fs.renameSync(cacheFile, path.join(archive, randomUUID() + '.json'));
            }
            fs.renameSync(temporary, cacheFile);
        }
        const fingerprints = new Set();
        for (const file of sources) {
            contained(corpus, file);
            const cached = this.corpusFingerprints.get(file);
            if (!cached || cached.version !== sourceVersion(file)) refused('runtime-corpus-source-changed');
            cached.fingerprints.forEach(f => fingerprints.add(f));
        }
        if (fingerprints.size && textFingerprints(html, url).some(f => fingerprints.has(f))) refused('runtime-corpus-text-refused');
    }
    issueConsent(tab, page) {
        if (!((Number.isSafeInteger(tab) && tab >= 0) || (typeof tab === 'string' && tab.length > 0 && tab.length <= 200))) refused('runtime-tab-required');
        if (!page || typeof page !== 'object' || Array.isArray(page) || Object.keys(page).some(k => !['url', 'sanitizedHtml'].includes(k))) refused('runtime-page-snapshot-required');
        const url = webURL(page.url), html = htmlValue(page.sanitizedHtml);
        this.refuseEvaluation(url, html);
        const previous = this.tabs.get(tab); if (previous) this.consents.delete(previous);
        const token = randomBytes(32).toString('base64url');
        this.consents.set(token, { tab, url, host: new URL(url).hostname, sourceHash: hash(html) });
        this.tabs.set(tab, token); return token;
    }
    registerRuntimeExample(token, host, sanitizedHtml) {
        const consent = typeof token === 'string' && this.consents.get(token);
        if (!consent) refused('runtime-consent-required-or-used');
        // An attempted use consumes the token, including a mismatched snapshot.
        this.consents.delete(token); this.tabs.delete(consent.tab);
        host = hostName(host); const input = htmlValue(sanitizedHtml);
        if (host !== consent.host || hash(input) !== consent.sourceHash) refused('runtime-consent-page-mismatch');
        this.refuseEvaluation(consent.url, input);
        const dom = new JSDOM(input, { url: consent.url, virtualConsole: new VirtualConsole() });
        let html;
        try { html = v3.clean(dom.window.document.body, dom.window.document, true).outerHTML; }
        finally { dom.window.close(); }
        htmlValue(html); this.refuseEvaluation(consent.url, html);
        const id = 'runtime-' + randomUUID(), record = { schemaVersion: 1, id, site: host, url: consent.url,
            html, sha256: hash(html), consentSourceHash: consent.sourceHash, consentTab: consent.tab, consentedAt: new Date().toISOString() };
        fixedDirectory(this.localDirectory); fixedDirectory(this.directory);
        contained(this.localDirectory, this.directory);
        fs.writeFileSync(path.join(this.directory, id + '.json'), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
        return id;
    }
    resolve(id, policy = 'runtime') {
        if (policy !== 'runtime' || typeof id !== 'string' || !ID.test(id)) refused('registered-runtime-id-required');
        const file = path.join(this.directory, id + '.json');
        fixedDirectory(this.localDirectory); fixedDirectory(this.directory);
        contained(this.localDirectory, this.directory); contained(this.directory, file);
        const r = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (r.schemaVersion !== 1 || r.id !== id || hash(htmlValue(r.html)) !== r.sha256 || hostName(r.site) !== new URL(webURL(r.url)).hostname || !r.consentedAt || !r.consentSourceHash) refused('invalid-runtime-record');
        this.refuseEvaluation(r.url, r.html);
        return Object.freeze({ id, site: r.site, url: r.url, html: r.html, sha256: r.sha256, file });
    }
    records(ids, policy = 'runtime') {
        if (policy !== 'runtime' || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) refused('registered-runtime-ids-required');
        return ids.map(id => this.resolve(id, policy));
    }
    load(id, policy = 'runtime') {
        const record = this.resolve(id, policy), dom = new JSDOM(record.html, { url: record.url, virtualConsole: new VirtualConsole() });
        dom.runtimePage = record; return dom;
    }
}

// One instance per backend session, shared across all runtime providers. The
// backend may supply an acquire/release adapter to its existing generation
// counter so legacy and v3 requests consume the same allowance.
class RuntimeSession {
    constructor({ maxCalls = Number(process.env.LOCAL_AI_MAX_CALLS || 20) } = {}) {
        if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 20) throw Error('maxCalls must be from 1 to 20');
        this.maxCalls = maxCalls; this.calls = 0; this.active = 0;
    }
    acquire() {
        if (this.calls >= this.maxCalls || this.active) throw Object.assign(new BudgetError(this.active ? 'runtime-generation-busy' : 'runtime-session-limit'), { status: 429 });
        this.calls++; this.active++;
    }
    release() { this.active--; }
}
class RuntimeLedger {
    constructor({ registry, session }) {
        this.registry = registry; this.session = session;
        this.directory = registry.localDirectory; guards.add(this);
    }
    append(file, entry) {
        fixedDirectory(path.dirname(file));
        if (fs.existsSync(file)) contained(path.dirname(file), file);
        const fd = fs.openSync(file, 'a');
        try { fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n'); fs.fsyncSync(fd); }
        finally { fs.closeSync(fd); }
    }
    async baselines(ids) {
        const { fromRecord } = require('./baselines.cjs');
        const cacheDirectory = path.join(this.directory, 'runtime-baselines');
        fixedDirectory(cacheDirectory);
        return Promise.all(this.registry.records(ids).map(async r => ({
            P0: await fromRecord('P0', r, { cacheDirectory }),
            P1: await fromRecord('P1', r, { cacheDirectory })
        })));
    }
    async run(runner, messages, metadata = {}) {
        const records = this.registry.records(metadata.pageIds, metadata.policy);
        if (metadata.policy !== 'runtime' || metadata.pageSourceHashes?.some((s, i) => s !== records[i]?.sha256)) refused('runtime-source-changed');
        const payload = runner.payload ? runner.payload(messages) : { model: runner.model || 'scripted', messages };
        const serialized = JSON.stringify(payload), requestId = randomUUID(), started = Date.now();
        // Provider/model names only select a local usage directory, never paths.
        const safe = s => String(s || 'unknown').replace(/[^a-z0-9._-]/gi, '_').slice(0, 120);
        const directory = path.join(this.directory, safe(runner.provider) + '-' + safe(runner.model));
        const usageFile = path.join(directory, 'usage.jsonl');
        try { this.session.acquire(); }
        catch (error) { throw Object.assign(new BudgetError(error.message || 'runtime-session-refused'), { status: 429 }); }
        let status = 'failed', result;
        const info = { policy: 'runtime', protocol: 3, requestId, provider: runner.provider || 'scripted', model: runner.model || 'scripted',
            pageIds: records.map(r => r.id), site: records[0].site, turn: metadata.turn || 1, inputSha256: hash(serialized),
            promptHash: hash(messages.filter(m => m.role === 'system').map(m => m.content).join('\n')) };
        try {
            this.append(usageFile, { event: 'started', ...info });
            const raw = await dispatch(runner, messages, payload, metadata);
            result = typeof raw === 'string' ? { content: raw } : typeof raw?.action === 'string' ? { content: JSON.stringify(raw) } : raw;
            if (!result || typeof result !== 'object') throw Error('invalid-provider-result');
            status = 'completed';
            return { ...result, ledgerId: { requestId, usageFile }, costEstimate: runner.provider === 'deepseek' ? cost(result.usage, pricesAt(started)) || 0 : 0 };
        } catch (error) { result = error; throw error; }
        finally {
            try { this.append(usageFile, { event: status, ...info, providerRequestId: result?.requestId || null,
                usage: result?.usage || null, tokens: tokens(result?.usage), latencyMs: Date.now() - started }); }
            finally { this.session.release(); }
        }
    }
    outcome(receipt, outcome, reasons = []) {
        this.append(receipt.usageFile, { event: 'assessment', policy: 'runtime', protocol: 3, requestId: receipt.requestId, outcome, reasons });
    }
}
function createRuntimeAgent({ root = ROOT, session = new RuntimeSession() } = {}) {
    if (typeof session.acquire !== 'function' || typeof session.release !== 'function') throw Error('runtime-session-adapter-required');
    const registry = new RuntimeRegistry({ root }), ledger = new RuntimeLedger({ registry, session });
    return {
        issueConsent: (tab, page) => registry.issueConsent(tab, page),
        registerRuntimeExample: (token, host, html) => registry.registerRuntimeExample(token, host, html),
        async runRuntimeInduction(host, ids, runner) {
            host = hostName(host);
            if (!Array.isArray(ids) || ids.length !== 2) refused('runtime-two-examples-required');
            const records = registry.records(ids);
            if (records.some(r => r.site !== host)) refused('runtime-host-mismatch');
            if (records[0].url === records[1].url || records[0].sha256 === records[1].sha256) refused('runtime-distinct-examples-required');
            return require('./loop.cjs').runLoop({ pageIds: ids, policy: 'runtime', mode: 'P4', runner, ledger, site: host });
        },
        session
    };
}
let defaultAgent;
const current = () => defaultAgent ||= createRuntimeAgent();
module.exports = { createRuntimeAgent, RuntimeSession, isRuntimeLedger: ledger => guards.has(ledger),
    issueConsent: (...args) => current().issueConsent(...args),
    registerRuntimeExample: (...args) => current().registerRuntimeExample(...args),
    runRuntimeInduction: (...args) => current().runRuntimeInduction(...args) };

if (require.main === module && process.argv[2] === '--corpus-fingerprints') {
    buildFingerprints(JSON.parse(fs.readFileSync(0, 'utf8'))).then(entries => process.stdout.write(JSON.stringify(entries)))
        .catch(() => { process.stderr.write('runtime-corpus-fingerprint-build-failed\n'); process.exitCode = 1; });
}
