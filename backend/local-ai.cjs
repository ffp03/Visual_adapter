const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { CodexRunner } = require('./codex-runner.cjs');
const { DeepSeekRunner } = require('./deepseek-runner.cjs');

const ROOT = path.resolve(__dirname, '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const json = (res, code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
};
function hostname(value) {
    if (typeof value !== 'string' || value.length > 253 || !/^[a-z0-9.-]+$/i.test(value)) throw Error('Invalid hostname');
    const result = new URL('https://' + value).hostname;
    if (result !== value.toLowerCase() || result.includes('..')) throw Error('Invalid hostname');
    return result;
}
function cleanHTML(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 100000) throw Error('HTML must contain 1 to 100000 characters');
    const dom = new JSDOM(value);
    try {
        const doc = dom.window.document;
        doc.querySelectorAll('script,style,iframe,object,embed,template,noscript').forEach(e => e.remove());
        doc.querySelectorAll('input,textarea').forEach(e => { e.removeAttribute('value'); e.textContent = ''; });
        doc.querySelectorAll('*').forEach(e => [...e.attributes].forEach(a => {
            if (/^on/i.test(a.name)) e.removeAttribute(a.name);
        }));
        return doc.body.outerHTML;
    } finally { dom.window.close(); }
}
function validateRule(rule, html) {
    if (!rule || typeof rule.main !== 'string' || !rule.main.trim() || rule.main.length > 500
        || typeof rule.name !== 'string' || rule.name.length > 120 || !Array.isArray(rule.exclude)
        || rule.exclude.length > 30 || rule.exclude.some(x => typeof x !== 'string' || !x.trim() || x.length > 500)) {
        throw Error('Invalid extraction rule');
    }
    const dom = new JSDOM(html);
    try {
        const doc = dom.window.document;
        const stableSelector = element => {
            const tag = element.tagName.toLowerCase(), candidates = [];
            if (element.id) candidates.push(tag + '[id=' + JSON.stringify(element.id) + ']');
            if (element.classList.length) candidates.push(tag + [...element.classList].slice(0, 3).map(c => '[class~=' + JSON.stringify(c) + ']').join(''));
            if (['MAIN', 'ARTICLE'].includes(element.tagName)) candidates.push(tag);
            return candidates.find(selector => {
                try { return selector.length <= 500 && doc.querySelectorAll(selector).length === 1 && doc.querySelector(selector) === element; }
                catch { return false; }
            });
        };
        let main = doc.querySelector(rule.main);
        if (!main) throw Error('Rule must match a content container');
        if (/^(TR|TD|TH|TBODY|THEAD|TFOOT|CAPTION)$/.test(main.tagName)) {
            const table = main.closest('table'), selector = table && stableSelector(table);
            if (!selector) throw Error('Table fragment needs a stable table container');
            main = table; rule = { ...rule, main: selector };
        }
        if (!/^(BODY|MAIN|ARTICLE|DIV|SECTION|UL|OL|TABLE|CENTER)$/.test(main.tagName)) throw Error('Rule must match a content container');
        const normalize = text => text.replace(/\s+/g, ' ').trim();
        const blocks = [...doc.body.querySelectorAll('p,pre,tr,blockquote,[itemprop="text"]')]
            .filter(e => e.tagName !== 'TR' || (!e.querySelector('tr') && !e.querySelector('p,pre,blockquote,[itemprop="text"]')))
            .map(e => normalize(e.textContent)).filter(text => text.length >= 80).map(text => text.slice(0, 180));
        const indices = blocks.length > 9 ? [0, 1, 2, Math.floor(blocks.length / 2), blocks.length - 3, blocks.length - 2, blocks.length - 1] : blocks.map((_, i) => i);
        const anchors = [...new Set(indices.map(i => blocks[i]))];
        const comments = [...doc.body.querySelectorAll('.commtext,[role="comment"],[itemprop="commentText"]')]
            .map(e => normalize(e.textContent)).filter(text => text.length >= 20).map(text => text.slice(0, 180));
        const commentAnchors = comments.length ? [comments[0], comments[Math.floor(comments.length / 2)], comments.at(-1)] : [];
        const semantic = doc.querySelector('main,article,[role="main"]');
        const titleElement = semantic?.querySelector('h1');
        const title = normalize(titleElement?.textContent || '');
        const safeExclusions = rule.exclude.filter(selector => {
            if (doc.body.matches(selector) || semantic?.matches(selector)) throw Error('Exclusion would remove the content root');
            return !titleElement || ![...doc.querySelectorAll(selector)].some(element => element === titleElement || element.contains(titleElement));
        });
        if (safeExclusions.length !== rule.exclude.length) rule = { ...rule, exclude: safeExclusions };
        const usable = element => {
            const clone = element.cloneNode(true);
            for (const selector of rule.exclude) clone.querySelectorAll(selector).forEach(e => e.remove());
            const text = normalize(clone.textContent);
            const titleRetained = !title || [...clone.querySelectorAll('h1')].some(heading =>
                (!titleElement.id || heading.id === titleElement.id) && normalize(heading.textContent) === title);
            return !!text && titleRetained && commentAnchors.every(a => text.includes(a))
                && (!anchors.length || anchors.filter(a => text.includes(a)).length >= Math.ceil(anchors.length / 2));
        };
        if (!usable(main)) {
            // Widen locally rather than launching another model request when a rule
            // selects only a summary/post and omits sibling descriptions or comments.
            let replacement = null;
            for (let parent = main.parentElement; parent && parent !== doc.body; parent = parent.parentElement) {
                if (!/^(MAIN|ARTICLE|DIV|SECTION|UL|OL|TABLE|CENTER)$/.test(parent.tagName)) continue;
                if (!usable(parent)) continue;
                replacement = stableSelector(parent);
                if (replacement) break;
            }
            if (!replacement) throw Error('Rule would omit substantive content; keep local fallback');
            rule = { ...rule, main: replacement };
        }
    } finally { dom.window.close(); }
    return { main: rule.main, exclude: rule.exclude, name: rule.name };
}

function createLocalServer({ runner = new DeepSeekRunner(), directory, maxCalls = 20 } = {}) {
    const provider = runner.provider || 'test-double', model = runner.model || 'test-model', effort = runner.effort || 'unavailable';
    directory ||= path.join(ROOT, 'workspace/local-ai', provider + '-' + model);
    if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 20) throw Error('maxCalls must be from 1 to 20');
    const cache = path.join(directory, 'rules'), archive = path.join(directory, 'archive');
    fs.mkdirSync(cache, { recursive: true }); fs.mkdirSync(archive, { recursive: true });
    const inFlight = new Map();
    const failedHosts = new Set();
    let calls = 0;
    const file = host => path.join(cache, hash(host) + '.json');
    function read(host) {
        try { const entry = JSON.parse(fs.readFileSync(file(host), 'utf8')); return entry.hostname === host && entry.provider === provider && entry.model === model ? entry : null; }
        catch { return null; }
    }
    function retire(host) {
        if (fs.existsSync(file(host))) fs.renameSync(file(host), path.join(archive, hash(host) + '-' + randomUUID() + '.json'));
    }
    async function generate(host, html) {
        const cached = read(host);
        if (cached) return { success: true, rule: cached.rule, source: 'local-cache', provider, model };
        if (inFlight.has(host)) return inFlight.get(host);
        if (failedHosts.has(host)) {
            const error = Error('Previous generation failed; keep the local fallback. Reporting the host explicitly enables another attempt.');
            error.status = 429; throw error;
        }
        if (inFlight.size || calls >= maxCalls) {
            const error = Error(calls >= maxCalls ? 'Generation allowance exhausted for this server session' : 'Generation is busy; keep the local fallback');
            error.status = 429; throw error;
        }
        const job = (async () => {
            const cleaned = cleanHTML(html);
            calls++;
            const requestId = randomUUID();
            const inputSha256 = hash(cleaned.slice(0, 30000));
            fs.appendFileSync(path.join(directory, 'usage.jsonl'), JSON.stringify({ event: 'started', requestId,
                provider, model, effort, inputSha256, at: new Date().toISOString() }) + '\n');
            let result, status = 'failed';
            try {
                result = await runner.generate(cleaned.slice(0, 30000));
                const rule = validateRule(result.rule, cleaned);
                const normalization = JSON.stringify(rule) === JSON.stringify(result.rule) ? null : {
                    originalMain: result.rule.main, appliedMain: rule.main,
                    droppedExclusions: result.rule.exclude.filter(selector => !rule.exclude.includes(selector)), reason: 'local-content-coverage-validation' };
                const entry = { hostname: host, rule, modelRule: result.rule, normalization, provider, model, effort, servedModel: result.servedModel || null,
                    requestId, threadId: result.threadId || null, providerRequestId: result.requestId || null,
                    usage: result.usage, created: new Date().toISOString(), inputSha256 };
                retire(host);
                const temp = file(host) + '.' + randomUUID() + '.tmp';
                fs.writeFileSync(temp, JSON.stringify(entry, null, 2)); fs.renameSync(temp, file(host));
                status = 'completed';
                return { success: true, rule, normalization, source: 'generated', provider, model, requestId };
            } catch (error) {
                failedHosts.add(host);
                result ||= { usage: error.usage, requestId: error.requestId, servedModel: error.servedModel };
                throw error;
            } finally {
                fs.appendFileSync(path.join(directory, 'usage.jsonl'), JSON.stringify({ event: status, requestId,
                    threadId: result?.threadId || null, providerRequestId: result?.requestId || null,
                    provider, model, effort, servedModel: result?.servedModel || null,
                    usage: result?.usage || null, inputSha256, at: new Date().toISOString() }) + '\n');
            }
        })();
        inFlight.set(host, job);
        try { return await job; } finally { inFlight.delete(host); }
    }
    const server = http.createServer(async (req, res) => {
        // Restrict browser callers and Host to prevent websites consuming the local account.
        if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || '')) return json(res, 403, { error: 'Local host required' });
        const origin = req.headers.origin;
        if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return json(res, 403, { error: 'Extension origin required' });
        if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.writeHead(204); return res.end();
        }
        try {
            const url = new URL(req.url, 'http://127.0.0.1');
            if (req.method === 'GET' && url.pathname === '/health') return json(res, 200,
                { status: 'ok', provider, model, effort, calls, maxCalls, active: inFlight.size });
            if (req.method === 'GET' && url.pathname.startsWith('/rules/')) {
                const entry = read(hostname(decodeURIComponent(url.pathname.slice(7))));
                return json(res, 200, { rule: entry?.rule || null, provider, model });
            }
            if (req.method !== 'POST' || !['/analyze', '/verify', '/report'].includes(url.pathname)) return json(res, 404, { error: 'Unknown endpoint' });
            if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'JSON required' });
            const chunks = []; let bytes = 0;
            for await (const chunk of req) {
                bytes += chunk.length;
                if (bytes > 262144) return json(res, 413, { error: 'Request too large' });
                chunks.push(chunk);
            }
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8')), host = hostname(data.hostname);
            if (url.pathname === '/analyze') return json(res, 200, await generate(host, data.html));
            if (url.pathname === '/report') { retire(host); failedHosts.delete(host); return json(res, 200, { success: true }); }
            // Verification here is deterministic only; it never starts another model turn.
            validateRule(data.rule, cleanHTML(data.rawHTML));
            return json(res, 200, { success: true, verification: { status: 'local-only', modelVerification: false } });
        } catch (error) {
            return json(res, error.status || (error instanceof SyntaxError ? 400 : 503),
                { success: false, status: 'fallback', error: error.message });
        }
    });
    server.requestTimeout = 15000;
    server.on('close', () => runner.close?.());
    return server;
}

if (require.main === module) {
    const runner = process.argv.includes('--codex') ? new CodexRunner() : new DeepSeekRunner();
    if (runner.checkLogin) runner.checkLogin();
    const port = Number(process.env.LOCAL_AI_PORT || 7861);
    const maxCalls = Number(process.env.LOCAL_AI_MAX_CALLS || 20);
    const server = createLocalServer({ runner, maxCalls });
    server.listen(port, '127.0.0.1', () => console.log(`Visual Adapter: ${runner.provider} ${runner.model} (${runner.effort}) at http://127.0.0.1:${port}; max ${maxCalls} generations, no automatic retries.`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { runner.close(); server.close(); });
}

module.exports = { createLocalServer, cleanHTML, validateRule, hostname };
