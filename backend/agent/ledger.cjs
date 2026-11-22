'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {PageRegistry}=require('./pages.cjs');
const ROOT = path.resolve(__dirname, '../..');
const { dispatch, isAuthorized } = require('./transport.cjs');
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
// Official list prices verified 2026-11-20. USD per million tokens.
const PRICES = Object.freeze({ source: 'https://api-docs.deepseek.com/quick_start/pricing/', verified: '2026-11-20',
    peak: { input: 0.30, cached: 0.006, output: 1.20 }, offPeak: { input: 0.15, cached: 0.003, output: 0.60 } });
function pricesAt(date) {
    const d = new Date(date), h = d.getUTCHours(), day = d.getUTCDay();
    // Chinese holidays are not inferred. Peak prices are a conservative estimate
    // on a weekday holiday and the basis is persisted in each receipt.
    return day >= 1 && day <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10)) ? 'peak' : 'offPeak';
}
function tokens(usage) {
    if (!usage || typeof usage !== 'object') return null;
    const prompt = usage.prompt_tokens ?? usage.input_tokens;
    const completion = usage.completion_tokens ?? usage.output_tokens;
    const cached = usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? usage.cached_input_tokens ?? 0;
    if (![prompt,completion,cached].every(n => Number.isSafeInteger(n) && n >= 0) || cached > prompt) return null;
    return { prompt, completion, cached, total: prompt + completion };
}
function cost(usage, tier = 'peak') {
    const t = tokens(usage); if (!t) return null;
    const p = PRICES[tier];
    return ((t.prompt - t.cached) * p.input + t.cached * p.cached + t.completion * p.output) / 1e6;
}
class BudgetError extends Error { constructor(reason) { super(reason); this.name = 'BudgetError'; this.reason = reason; } }
class BoundaryError extends Error {constructor(reason){super(reason);this.name='BoundaryError';this.reason=reason;}}
class Ledger {
    constructor({ root = ROOT, directory = path.join(root, 'workspace/revision'), maxDollars = 5, maxRequests = 2000, maxDevRequests = 780, now = () => new Date() } = {}) {
        this.directory = directory; this.file = path.join(directory, 'ledger.jsonl');
        this.root=path.resolve(root);this.registry=new PageRegistry({root:this.root});
        this.payloadDirectory = path.join(directory, 'payloads'); this.now = now;
        // Configuration can lower limits for tests; it cannot increase approval.
        this.limits = { dollars: Math.min(5,maxDollars), requests: Math.min(2000,maxRequests), dev: Math.min(780,maxDevRequests) };
        if (Object.values(this.limits).some(n => !Number.isFinite(n) || n < 0)) throw Error('invalid-ledger-limits');
        fs.mkdirSync(this.payloadDirectory, { recursive: true });
    }
    entries() {
        if (!fs.existsSync(this.file)) return [];
        // A truncated/corrupt record closes the gate. Never silently skip it.
        return fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean).map(line => {
            const e=JSON.parse(line);
            if (!e || typeof e.id!=='string' || !['request','result','assessment','refused','freeze'].includes(e.event)
                || ['costEstimate','reservedCost'].some(k=>e[k]!==undefined && (!Number.isFinite(e[k]) || e[k]<0))
                || (e.event==='request' && typeof e.paid!=='boolean')) throw Error('invalid-ledger-record');
            return e;
        });
    }
    append(entry) {
        const fd = fs.openSync(this.file, 'a');
        try { fs.writeSync(fd, JSON.stringify({ at: this.now().toISOString(), ...entry }) + '\n'); fs.fsyncSync(fd); }
        finally { fs.closeSync(fd); }
    }
    locked(work) {
        const lock = path.join(this.directory, 'ledger.lock');
        let fd;
        for(let attempt=0;attempt<25;attempt++)try{fd=fs.openSync(lock,'wx');break;}catch(error){
            if(error.code!=='EEXIST')throw error;
            if(attempt===24)throw new BudgetError('ledger-locked');
            // Only serialize concurrent ledger appends; never retry transport.
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
        }
        try { fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: this.now().toISOString() })); return work(); }
        finally {
            fs.closeSync(fd);
            // Retain lock receipts as evidence; never unlink historical files.
            const archive = path.join(this.payloadDirectory, 'locks'); fs.mkdirSync(archive, { recursive: true });
            fs.renameSync(lock, path.join(archive, crypto.randomUUID() + '.json'));
        }
    }
    totals() {
        const requests = new Map();
        const entries=this.entries();
        for (const entry of entries) {
            if (!entry.id || entry.event === 'refused' || entry.event === 'freeze') continue;
            requests.set(entry.id, { ...requests.get(entry.id), ...entry });
        }
        const values = [...requests.values()].filter(e => e.event !== 'refused');
        const paid = values.filter(e => e.paid === true);
        return { requests: values.length, paidRequests: paid.length, devRequests: paid.filter(e => e.policy === 'dev').length,
            dollars: paid.reduce((sum, e) => sum + (e.costEstimate ?? e.reservedCost ?? 0), 0),
            pending: values.filter(e => e.outcome === 'started').length,
            budgetRefusals: entries.filter(e=>e.event==='refused').length,
            promptTokens: values.reduce((s,e) => s + (e.tokens?.prompt || 0),0),
            completionTokens: values.reduce((s,e) => s + (e.tokens?.completion || 0),0),
            cachedTokens: values.reduce((s,e) => s + (e.tokens?.cached || 0),0),
            failures: values.filter(e => !['started','generated','accepted'].includes(e.outcome)).length };
    }
    guard({ policy, pageIds, pageSourceHashes,paid = true, reservedCost = 0 }) {
        let records;try{records=this.registry.records(pageIds,policy);}catch(e){throw new BoundaryError(e.message);}
        if(pageSourceHashes&&(!Array.isArray(pageSourceHashes)||pageSourceHashes.length!==records.length||records.some((p,i)=>p.sha256!==pageSourceHashes[i])))throw new BoundaryError('manifest-source-changed');
        if (!paid) return records;
        const totals = this.totals();
        if (totals.paidRequests >= this.limits.requests) throw new BudgetError('request-cap');
        if (totals.dollars >= this.limits.dollars || totals.dollars + reservedCost > this.limits.dollars) throw new BudgetError('dollar-cap');
        if (policy === 'dev' && totals.devRequests >= this.limits.dev) throw new BudgetError('development-cap');
        return records;
    }
    async run(runner, messages, metadata = {}) {
        const paid = runner.provider === 'deepseek';
        const payload = runner.payload ? runner.payload(messages) : { model: runner.model || 'scripted', messages };
        if (payload.max_tokens !== undefined && (!Number.isSafeInteger(payload.max_tokens) || payload.max_tokens < 1)) throw new BudgetError('invalid-output-token-bound');
        const serialized = JSON.stringify(payload);
        const prompt = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
        // UTF-8 byte count bounds input tokens conservatively, even on non-ASCII
        // text. Reserve maximum output and peak rates before starting transport.
        const reservedCost = paid ? (Buffer.byteLength(serialized) * PRICES.peak.input + (payload.max_tokens || 4096) * PRICES.peak.output) / 1e6 : 0;
        const id = crypto.randomUUID(), start = this.now(), tier = pricesAt(start);
        const info = { policy: metadata.policy || 'dev', experimentPolicy: metadata.experimentPolicy || 'P4',
            iteration:metadata.iteration??null,experiment:metadata.experiment||null,gateHash:metadata.gateHash||null,viewsHash:metadata.viewsHash||null,settingsHash:metadata.settingsHash||null,
            site: metadata.site || null, pageIds:metadata.pageIds||[],pages:[],turn: metadata.turn || 1,
            provider: runner.provider || 'scripted', model: runner.model || 'scripted', effort: runner.effort || null,
            paid, promptHash: hash(prompt), payloadHash: hash(serialized) };
        this.locked(() => {
            try {
                const records=this.guard({...info,pageSourceHashes:metadata.pageSourceHashes,reservedCost});
                info.pages=records.map(p=>p.file);info.pageSourceHashes=records.map(p=>p.sha256);info.manifestHash=records[0].manifestHash;info.site=records[0].site;
            }
            catch (error) { this.append({ event: 'refused', id, ...info, outcome: error.name==='BoundaryError'?'boundary':'budget', reason: error.message }); throw error; }
            const filename = path.join(this.payloadDirectory, id + '.json');
            fs.writeFileSync(filename, serialized, { flag: 'wx', mode: 0o600 });
            this.append({ event: 'request', id, ...info, outcome: 'started', reservedCost, payloadFile: path.relative(this.directory, filename), pricing: { ...PRICES, tier } });
        });
        try {
            const raw = await dispatch(runner, messages, payload, metadata);
            const result = typeof raw === 'string' ? {content:raw} : typeof raw?.action === 'string' ? {content:JSON.stringify(raw)} : raw;
            const responseFile=path.join(this.payloadDirectory,id+'.response.json');
            fs.writeFileSync(responseFile,JSON.stringify(result),{flag:'wx',mode:0o600});
            this.locked(() => this.append({ event: 'result', id, outcome: 'generated', usage: result.usage || null, tokens: tokens(result.usage),
                responseFile:path.relative(this.directory,responseFile),
                costEstimate: paid ? cost(result.usage, tier) ?? reservedCost : 0,
                costBasis: tokens(result.usage) ? 'reported-usage' : 'conservative-reservation-usage-unavailable',
                latencyMs: this.now() - start, requestId: result.requestId || result.threadId || null, servedModel: result.servedModel || null }));
            return { ...result, ledgerId: id,costEstimate:paid ? cost(result.usage,tier)??reservedCost : 0 };
        } catch (error) {
            this.locked(() => this.append({ event: 'result', id, outcome: 'provider-error', reason: error.code || error.name || 'Error',
                usage: error.usage || null, tokens: tokens(error.usage), costEstimate: paid ? cost(error.usage,tier) ?? reservedCost : 0,
                costBasis: tokens(error.usage) ? 'reported-usage' : 'conservative-reservation-usage-unavailable',
                latencyMs: this.now() - start, requestId: error.requestId || null }));
            error.costEstimate=paid ? cost(error.usage,tier)??reservedCost : 0;throw error;
        }
    }
    outcome(id, outcome, reasons = []) { this.locked(() => this.append({ event: 'assessment', id, outcome, reasons })); }
}
module.exports = { Ledger, BudgetError,BoundaryError, PRICES, pricesAt, tokens, cost, hash, isAuthorized };
