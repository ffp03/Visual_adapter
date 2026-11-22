'use strict';
// Interactive v3 orchestration. A snapshot-bound consent covers one induction.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');
const core = require('../extension/procedure-core.js');
const v3 = require('../extension/procedure-v3.js');
const { Views } = require('./agent/outline.cjs');
const { createRuntimeAgent } = require('./agent/runtime.cjs');
const { dispatch } = require('./agent/transport.cjs');
const { firstDisclosure, checkPayload, payloadFor } = require('./runtime-disclosure.cjs');
const { BoundaryError } = require('./agent/ledger.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 403) => { throw Object.assign(Error(message), { status }); };
function createRuntimeLayouts({ directory, root, runner, session }) {
    const agent = createRuntimeAgent({ root, session });
    const store = path.join(directory, 'layouts-v3');
    const archive = path.join(store, 'archive');
    const payloads = path.join(directory, 'runtime-payloads');
    const history = path.join(directory, 'runtime-history');
    for (const dir of [store, archive, payloads, history]) fs.mkdirSync(dir, { recursive: true });
    const previews = new Map(), jobs = new Map();
    const epochs = new Map();
    const epoch = host => epochs.get(host) || 0;
    const invalidate = host => epochs.set(host, epoch(host) + 1);
    const isCurrent = job => !job.cancelled && job.epoch === epoch(job.host);
    const checkEpoch = job => { if (!isCurrent(job)) throw new BoundaryError(job.reason || 'Stale induction epoch'); };
    let clearing = false;
    const provider = runner.provider, model = runner.model;
    const prefix = host => hash(host) + '-';
    const file = (host, family) => path.join(store, prefix(host) + family + '.json');
    const records = host => fs.readdirSync(store).filter(n => n.endsWith('.json') && (!host || n.startsWith(prefix(host)))).map(n => {
        const entry = JSON.parse(fs.readFileSync(path.join(store, n), 'utf8'));
        return entry;
    }).filter(e => e.provider === provider && e.model === model);
    function move(target) {
        if (fs.existsSync(target)) fs.renameSync(target, path.join(archive, path.basename(target) + '.' + randomUUID()));
    }
    function save(entry, job) {
        if (job) checkEpoch(job);
        const target = file(entry.host, entry.family), temp = target + '.' + randomUUID() + '.tmp';
        fs.writeFileSync(temp, JSON.stringify(entry), { mode: 0o600 }); move(target); fs.renameSync(temp, target);
    }
    for (const entry of records()) if (entry.status === 'generating') {
        entry.status = 'failed'; entry.reason = 'Induction interrupted by restart; clear pending examples to retry'; save(entry);
    }
    function snapshot(data) {
        const url = new URL(data.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== data.hostname || url.username || url.password) fail('Page hostname mismatch');
        url.hash = '';
        if (typeof data.sanitizedHtml !== 'string' || !data.sanitizedHtml.trim() || Buffer.byteLength(data.sanitizedHtml) > 1048576) fail('Page snapshot too large or missing', 413);
        const dom = new JSDOM(data.sanitizedHtml, { url: url.href });
        try {
            const html = v3.clean(dom.window.document.body, dom.window.document, true).outerHTML;
            const clean = new JSDOM(html, { url: url.href });
            try {
                const family = hash(JSON.stringify(core.inspect(clean.window.document).descriptor));
                const sample = JSON.stringify(new Views([clean.window.document], { mode: 'P3' }).initial());
                return { url: url.href, html, family, sample, content: hash(v3.text(clean.window.document.body)) };
            } finally { clean.window.close(); }
        } finally { dom.window.close(); }
    }
    function disclose(data) {
        if (clearing) fail('Pending examples are being deleted', 429);
        // Transient local computation, never registers/persists a page here.
        const page = snapshot(data);
        for (const [key, old] of previews) if (old.tab === data.tab || old.expires < Date.now()) previews.delete(key);
        const entry = records(data.hostname).find(e => e.family === page.family);
        let disclosure = { characters: 0, maximumTotalCharacters: 0, sample: page.sample.slice(0, 1800) };
        if (entry?.status === 'pending' && entry.examples.length === 1
            && entry.examples[0].url !== page.url && entry.examples[0].content !== page.content) {
            const example = JSON.parse(fs.readFileSync(path.join(root, 'workspace/local-ai/runtime-examples', entry.examples[0].id + '.json'), 'utf8'));
            if (example.site !== data.hostname || hash(example.html) !== example.sha256) fail('Stored example changed');
            const documents = [example, { html: page.html, url: page.url }].map(p => new JSDOM(p.html, { url: p.url }));
            try { disclosure = firstDisclosure(documents.map(d => d.window.document), runner); }
            finally { documents.forEach(d => d.window.close()); }
        }
        const token = agent.issueConsent(data.tab, { url: page.url, sanitizedHtml: page.html });
        previews.set(token, { ...page, disclosure, tab: data.tab, host: data.hostname, expires: Date.now() + 600000 });
        return { protocol: 3, token, provider, model, ...disclosure,
            examples: entry?.examples?.length || 0, status: entry?.status || 'new',
            message: disclosure.characters ? 'One click authorizes this induction, up to ' + disclosure.maxTurns + ' provider requests on these two pages.'
                : 'This click saves this example locally (0 provider characters). A second distinct compatible page is needed before generation.' };
    }
    const publicJob = job => ({ protocol: 3, job: job.id, status: job.status, success: job.status === 'admitted',
        reason: job.reason, provider, model, payloadCount: job.receipts.length, receipts: job.receipts, examples: 2 });
    function cancel(job, reason) {
        job.cancelled = true; job.reason = reason;
    }
    async function generate(data) {
        if (clearing) fail('Pending examples are being deleted', 429);
        const page = previews.get(data.token); previews.delete(data.token);
        if (!page || page.expires < Date.now() || page.tab !== data.tab || page.host !== data.hostname) fail('Missing, expired or used consent');
        const current = snapshot(data);
        if (current.url !== page.url || current.html !== page.html) fail('Page changed; refresh disclosure');
        if (page.disclosure.characters && data.payloadHash !== page.disclosure.payloadHash) fail('Stale payload disclosure');
        let entry = records(page.host).find(e => e.family === page.family);
        if (entry?.status === 'failed') return { protocol: 3, status: 'fallback', reason: 'Previous attempt failed. Clear pending examples or report the rule before trying again.' };
        if (entry?.status === 'admitted') return { protocol: 3, status: 'admitted', success: true };
        if (entry?.examples.some(e => e.url === page.url || e.content === page.content)) return { protocol: 3, status: 'pending', reason: 'A second distinct page is needed.', examples: 1 };
        if (entry?.examples.length === 1 && !page.disclosure.characters) fail('Refresh disclosure for the two-page induction');
        if ([...jobs.values()].some(j => !['admitted', 'failed'].includes(j.status))) fail('Generation is busy', 429);
        const id = agent.registerRuntimeExample(data.token, page.host, page.html);
        entry ||= { host: page.host, family: page.family, provider, model, status: 'pending', examples: [] };
        entry.examples.push({ id, url: page.url, content: page.content });
        if (entry.examples.length === 2) entry.status = 'generating';
        save(entry);
        if (entry.examples.length === 1) return { protocol: 3, status: 'pending', examples: 1, reason: 'A second distinct page of this layout is needed. Nothing was sent to the provider.' };
        if (!page.disclosure.characters) fail('Refresh disclosure for the two-page induction');
        const job = { id: randomUUID(), host: page.host, tab: page.tab, epoch: epoch(page.host), status: 'preparing', receipts: [], settled: false };
        jobs.set(job.id, job);
        const wrapped = {
            provider, model, effort: runner.effort,
            payload: messages => {
                checkEpoch(job);
                const payload = payloadFor(runner, messages);
                checkPayload(messages, payload, page.disclosure, job.receipts.length + 1);
                return payload;
            },
            async generate(messages, context) {
                checkEpoch(job);
                const serialized = JSON.stringify(context.payload), payloadHash = hash(serialized);
                const receipt = { characters: serialized.length, payloadHash, payload: serialized, turn: context.metadata.turn,
                    sample: context.metadata.turn === 1 ? context.payload.messages[1].content.slice(0, 1800)
                        : context.payload.messages.at(-1).content.slice(0, 1800) };
                checkEpoch(job);
                fs.writeFileSync(path.join(payloads, job.id + '-' + context.metadata.turn + '.json'), serialized, { flag: 'wx', mode: 0o600 });
                checkEpoch(job);
                fs.appendFileSync(path.join(history, job.id + '.jsonl'), JSON.stringify({ host: page.host, ...receipt }) + '\n', { mode: 0o600 });
                job.receipts.push(receipt); job.status = 'running';
                return dispatch(runner, messages, context.payload, context.metadata);
            }
        };
        job.promise = agent.runRuntimeInduction(page.host, entry.examples.map(e => e.id), wrapped).then(result => {
            if (!isCurrent(job)) return;
            entry.status = result.accepted ? 'admitted' : 'failed';
            entry.rule = result.accepted ? result.rule : null;
            entry.reason = result.error || result.reasons?.join('; ') || result.reason;
            job.status = entry.status; job.reason = entry.reason;
            save(entry, job);
        }).catch(error => {
            if (isCurrent(job)) { entry.status = 'failed'; entry.reason = error.message; save(entry, job); job.status = 'failed'; job.reason = error.message; }
        }).finally(() => { job.settled = true; });
        return publicJob(job);
    }
    function getJob(data) {
        const job = jobs.get(data.job);
        if (!job || job.host !== data.hostname || job.tab !== data.tab) fail('Unknown generation');
        return job;
    }
    function sent(host) {
        const receipts = fs.readdirSync(history).filter(n => n.endsWith('.jsonl')).flatMap(n =>
            fs.readFileSync(path.join(history, n), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
                .filter(r => r.host === host).map(r => ({ ...r, induction: n.slice(0, -6) })));
        return { protocol: 3, provider, model, payloadCount: receipts.length, receipts };
    }
    function report(host) {
        invalidate(host);
        for (const entry of records(host)) move(file(host, entry.family));
        for (const job of jobs.values()) if (job.host === host) { cancel(job, 'Rule reported'); job.status = 'failed'; }
        for (const [key, p] of previews) if (p.host === host) previews.delete(key);
    }
    async function clear() {
        // These are user data, explicitly deleted by the product control.
        if (clearing) fail('Pending examples are being deleted', 429);
        clearing = true;
        try {
        // UI state is not worker liveness: Report can mark a still-preparing
        // job failed. Cancel and await EVERY promise, including those jobs.
        const allJobs = [...jobs.values()];
        const hosts = new Set([...allJobs.map(job => job.host), ...records().map(e => e.host), ...[...previews.values()].map(p => p.host)]);
        for (const host of hosts) invalidate(host);
        for (const job of allJobs) { cancel(job, 'Pending examples cleared'); if (job.status !== 'admitted') job.status = 'failed'; }
        if (allJobs.some(job => !job.settled && job.receipts.length)) runner.close?.();
        // Baseline workers may still be producing local copies. Wait for them
        // before deletion so no worker can recreate user data after success.
        await Promise.allSettled(allJobs.map(job => job.promise));
        const archivedEntries = fs.readdirSync(archive).filter(n => /^[a-f0-9]{64}-[a-f0-9]{64}\.json\./.test(n))
            .map(n => ({ ...JSON.parse(fs.readFileSync(path.join(archive, n), 'utf8')), metadataFile: path.join(archive, n) }))
            .filter(e => e.provider === provider && e.model === model);
        const entries = [...records().map(e => ({ ...e, metadataFile: file(e.host, e.family) })), ...archivedEntries];
        const admittedIds = new Set(entries.filter(e => e.status === 'admitted').flatMap(e => e.examples.map(p => p.id)));
        for (const entry of entries) if (entry.status !== 'admitted') {
            const sourceHashes = new Set();
            for (const e of entry.examples) {
                if (admittedIds.has(e.id)) continue;
                if (!/^runtime-[0-9a-f-]{36}$/.test(e.id)) fail('Invalid runtime example');
                const target = path.resolve(root, 'workspace/local-ai/runtime-examples', e.id + '.json');
                const expected = path.resolve(root, 'workspace/local-ai/runtime-examples');
                if (path.dirname(target) !== expected) fail('Invalid runtime example path');
                if (fs.existsSync(target)) { sourceHashes.add(JSON.parse(fs.readFileSync(target, 'utf8')).sha256); fs.unlinkSync(target); }
                // Remove raw examples archived by the earlier product version.
                for (const name of fs.readdirSync(archive).filter(n => n.startsWith(e.id + '.json.'))) {
                    const archived = path.join(archive, name);
                    sourceHashes.add(JSON.parse(fs.readFileSync(archived, 'utf8')).sha256);
                    fs.unlinkSync(archived);
                }
            }
            const cache = path.join(root, 'workspace/local-ai/runtime-baselines');
            if (fs.existsSync(cache)) for (const name of fs.readdirSync(cache).filter(n => n.endsWith('.json'))) {
                const target = path.join(cache, name);
                if (sourceHashes.has(JSON.parse(fs.readFileSync(target, 'utf8')).sourceHash)) fs.unlinkSync(target);
            }
            if (entry.examples.every(e => !admittedIds.has(e.id)) && fs.existsSync(entry.metadataFile)) fs.unlinkSync(entry.metadataFile);
        }
        previews.clear(); return { success: true };
        } finally { clearing = false; }
    }
    return { disclose, generate, sent, status: data => publicJob(getJob(data)), report, clear,
        list: host => records(host).filter(e => e.status === 'admitted').map(e => e.rule),
        close: () => { for (const job of jobs.values()) cancel(job, 'Server closed'); } };
}
module.exports = { createRuntimeLayouts };
