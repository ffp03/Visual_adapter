// Frozen-request study execution. Import-safe; no credentials or network until runRecord.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const ROOT = path.resolve(__dirname, '../..');
const PILOT = path.join(ROOT, 'workspace/task023/refresh-20261021/live_pilot.cjs');
const audited = require(PILOT);
const { DeepSeekRunner, sharedKey } = require('../../backend/deepseek-runner.cjs');
const CANONICAL = path.join(ROOT, 'workspace/task023/refresh-20261021/fresh-development-pilot/live-v2');
const FAKE_KEY = 'explicit-offline-fake-only';
const SCOPES = new Set(['development-final', 'unseen-final']);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const executionHashes = new Map([__filename, PILOT, path.join(ROOT, 'backend/deepseek-runner.cjs'), path.join(ROOT, 'backend/model-evidence.cjs')]
    .map(file => [fs.realpathSync(file), sha(fs.readFileSync(file))]));
function inside(file) {
    if (typeof file !== 'string') throw Error('Invalid bound file');
    const resolved = fs.realpathSync(path.resolve(ROOT, file));
    if (!resolved.toLowerCase().startsWith((ROOT + path.sep).toLowerCase())) throw Error('Bound file outside owning project');
    return resolved;
}
function checked(file, expected) {
    if (!/^[a-f0-9]{64}$/.test(expected || '')) throw Error('Missing file binding');
    const target = inside(file), bytes = fs.readFileSync(target);
    if (sha(bytes) !== expected) throw Error('Bound file changed');
    return { target, bytes };
}
function writeNew(file, value) {
    const stage = file + '.staged-' + crypto.randomUUID(), handle = fs.openSync(stage, 'wx');
    try { fs.writeFileSync(handle, Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2)); fs.fsyncSync(handle); }
    finally { fs.closeSync(handle); }
    fs.linkSync(stage, file); // Never replace an outcome; retain staged evidence.
}
function reserveScope(folder, id, scope, hashes, ready = () => {}) {
    if (!SCOPES.has(scope) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(id)) throw Error('Invalid study scope or record ID');
    return audited.withLock(folder, () => {
        const state = audited.ledger(folder), limits = audited.authorization;
        if (state.calls.has(id)) throw Error('Attempt already exists; no retry');
        if (state.calls.size >= limits.maxCalls || state.chargedUsd + limits.reserveUsd > limits.maxUsd + 1e-12) throw Error('Global budget exhausted');
        ready();
        const event = { ...hashes, phase: 'reserved', id, scope, at: new Date().toISOString(), sequence: state.calls.size + 1, reserveUsd: limits.reserveUsd };
        writeNew(path.join(folder, 'events', String(event.sequence).padStart(3, '0') + '-a-reserved.json'), event);
        return event;
    });
}
function safeUsage(value) {
    if (!value || typeof value !== 'object') return null;
    const keys = ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens'].filter(key => own(value, key));
    if (keys.some(key => !Number.isSafeInteger(value[key]) || value[key] < 0)) return null;
    return Object.fromEntries(keys.map(key => [key, value[key]]));
}
function estimateUsage(usage) {
    const estimate = audited.usageCost(usage);
    return usage?.prompt_tokens <= 128000 && usage?.completion_tokens <= 1024 && estimate !== null && estimate <= audited.authorization.reserveUsd ? estimate : null;
}
function credentialField(value) {
    return value && typeof value === 'object' && Object.entries(value).some(([key, nested]) => /^(?:api[-_]?key|authorization|headers)$/i.test(key) || credentialField(nested));
}
function validateRequest(body) {
    if (body.model !== 'deepseek-flash' || body.max_tokens !== 1024 || body.stream !== false || body.reasoning_effort !== 'none'
        || body.thinking?.type !== 'disabled' || body.response_format?.type !== 'json_object') throw Error('Invalid frozen model settings');
    if (!Array.isArray(body.messages) || body.messages.length !== 2 || body.messages[0].role !== 'system' || body.messages[1].role !== 'user'
        || body.messages.some(message => typeof message.content !== 'string') || body.messages[1].content.length > 12000) throw Error('Invalid frozen model messages');
    if (body.messages.reduce((sum, message) => sum + Buffer.byteLength(message.content), 0) > 128000 || Buffer.byteLength(JSON.stringify(body)) > 160000) throw Error('Frozen request byte bound exceeded');
}
function verifyBindings(planFile, approvalFile, folder = CANONICAL, onChecked) {
    const check = (file, expected) => { const result = checked(file, expected); onChecked?.(result.target); return result; };
    const planBytes = fs.readFileSync(inside(planFile)), plan = JSON.parse(planBytes), planSha256 = sha(planBytes);
    if (plan.schemaVersion !== 1 || !SCOPES.has(plan.scope) || !Array.isArray(plan.records) || !plan.records.length) throw Error('Invalid phase plan');
    for (const kind of ['phaseCode','production','scorer','inputs']) {
        const bindings = plan.bindings?.[kind];
        if (!bindings || typeof bindings !== 'object' || !Object.keys(bindings).length) throw Error('Incomplete phase bindings');
        for (const [file, hash] of Object.entries(bindings)) check(file, hash);
    }
    for (const required of [__filename, PILOT, path.join(ROOT, 'backend/deepseek-runner.cjs'), path.join(ROOT, 'backend/model-evidence.cjs')]) {
        const bound = Object.keys(plan.bindings.phaseCode).find(file => inside(file) === fs.realpathSync(required));
        if (!bound || plan.bindings.phaseCode[bound] !== executionHashes.get(fs.realpathSync(required))) throw Error('Missing or stale executable phase binding');
    }
    const authorizationBytes = fs.readFileSync(path.join(folder, 'authorization.json'));
    if (JSON.stringify(JSON.parse(authorizationBytes)) !== JSON.stringify(audited.authorization)) throw Error('Canonical authorization mismatch');
    const approvalBytes = fs.readFileSync(inside(approvalFile)), approval = JSON.parse(approvalBytes);
    if (approval.schemaVersion !== 1 || approval.decision !== 'approved-phase' || approval.scope !== plan.scope || approval.planSha256 !== planSha256) throw Error('Phase approval missing or mismatched');
    const state = audited.ledger(folder), pilotIds = [...audited.authorization.initialIds, ...audited.authorization.subsequentIds];
    const assessment = JSON.parse(check(approval.assessmentFile, approval.assessmentSha256).bytes);
    if (assessment.schemaVersion !== 1 || assessment.decision !== 'completed-pilot-assessed') throw Error('Pilot assessment absent');
    if (Object.keys(approval.pilotOutcomeHashes || {}).sort().join() !== [...pilotIds].sort().join()) throw Error('Four pilot outcomes required');
    for (const id of pilotIds) {
        const call = state.calls.get(id);
        if (call?.outcome?.success !== true || call.reservation.scope !== 'development-pilot') throw Error('Pilot unfinished or unsuccessful');
        const event = path.join(folder, 'events', String(call.reservation.sequence).padStart(3, '0') + '-b-outcome.json');
        if (sha(fs.readFileSync(event)) !== approval.pilotOutcomeHashes[id]) throw Error('Pilot outcome binding changed');
        const result = check(path.join(folder, id, 'provider-result.json'), assessment.providerResultHashes?.[id]);
        if (call.outcome.resultSha256 !== sha(result.bytes)) throw Error('Pilot result/outcome mismatch');
    }
    if (!Array.isArray(assessment.strictCheckpoints) || !assessment.strictCheckpoints.length) throw Error('Strict pilot checkpoints missing');
    for (const checkpoint of assessment.strictCheckpoints) check(checkpoint.file, checkpoint.sha256);
    const ids = new Set(), records = [];
    for (const record of plan.records) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(record.id || '') || ids.has(record.id)) throw Error('Duplicate or invalid planned ID'); ids.add(record.id);
        const request = check(record.requestFile, record.requestSha256), argumentsFile = check(record.argumentsFile, record.argumentsSha256);
        const body = JSON.parse(request.bytes), args = JSON.parse(argumentsFile.bytes);
        if (!args || typeof args.html !== 'string' || Object.keys(args).some(key => !['html','evidence'].includes(key)) || credentialField(args)) throw Error('Invalid frozen generator arguments');
        validateRequest(body);
        records.push({ ...record, wire: JSON.stringify(body), args });
    }
    return { plan, planSha256, approvalSha256: sha(approvalBytes), records };
}
async function verifyPhase(planFile, approvalFile, folder = CANONICAL) {
    const phase = verifyBindings(planFile, approvalFile, folder);
    for (const record of phase.records) {
        let matched = false;
        const runner = new DeepSeekRunner({ apiKey: FAKE_KEY, timeoutMs: 60000, fetchRequest: async (url, options) => {
            if (url !== 'https://api.deepseek.com/chat/completions' || options.method !== 'POST' || options.body !== record.wire) throw Error('Actual runner differs from frozen request');
            matched = true;
            return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"main":"main","exclude":[],"name":"Preflight"}' } }] }));
        } });
        try { await runner.generate(record.args.html, record.args.evidence); } finally { runner.close(); }
        if (!matched) throw Error('Frozen request was not reproduced');
    }
    return phase;
}
async function runRecord({ planFile, approvalFile, id }, testing) {
    const folder = testing ? testing.folder : CANONICAL;
    if (testing && (testing.apiKey !== FAKE_KEY || typeof testing.fetchRequest !== 'function' || testing.fetchRequest === fetch
        || inside(folder).toLowerCase() === fs.realpathSync(CANONICAL).toLowerCase())) throw Error('Tests require isolated ledger and explicit fake key/fetch');
    const phase = await verifyPhase(planFile, approvalFile, folder), record = phase.records.find(value => value.id === id);
    if (!record) throw Error('Record outside approved plan');
    if (fs.existsSync(path.join(folder, id)) || audited.ledger(folder).calls.has(id)) throw Error('Attempt already exists; no retry');
    const apiKey = testing ? FAKE_KEY : sharedKey();
    if (record.wire.includes(apiKey) || JSON.stringify(record.args).includes(apiKey)) throw Error('Credential detected in frozen data');
    let reservation, callFolder, receipt = {}, result;
    const safe = value => typeof value === 'string' ? value.replaceAll(apiKey, '[redacted]').replace(/[\x00-\x1f]/g, '').slice(0, 240) : null;
    const began = Date.now();
    const clock = testing?.clock || (() => performance.now());
    let liveBegan;
    const checkDeadline = signal => {
        const elapsed = clock() - liveBegan;
        if (signal.aborted || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 60000) throw Error('Live request deadline expired before reservation');
    };
    const runner = new DeepSeekRunner({ apiKey, timeoutMs: 60000, fetchRequest: async (url, options) => {
        checkDeadline(options.signal);
        if (url !== 'https://api.deepseek.com/chat/completions' || options.method !== 'POST' || options.body !== record.wire) throw Error('Frozen request mismatch');
        validateRequest(JSON.parse(options.body));
        // Recheck mutable disk bindings immediately before the only paid action.
        testing?.beforeBindingRecheck?.(options.signal);
        const rechecked = verifyBindings(planFile, approvalFile, folder, testing?.onBindingChecked);
        checkDeadline(options.signal);
        if (rechecked.planSha256 !== phase.planSha256 || rechecked.approvalSha256 !== phase.approvalSha256) throw Error('Phase changed before reservation');
        checkDeadline(options.signal);
        reservation = reserveScope(folder, id, phase.plan.scope, { planSha256: phase.planSha256, approvalSha256: phase.approvalSha256, requestFileSha256: record.requestSha256, wireRequestSha256: sha(options.body) }, () => checkDeadline(options.signal));
        callFolder = path.join(folder, id); fs.mkdirSync(callFolder); writeNew(path.join(callFolder, 'started.json'), reservation);
        testing?.afterReservation?.(options.signal);
        checkDeadline(options.signal);
        const response = await (testing ? testing.fetchRequest : fetch)(url, options);
        receipt = { status: response.status, requestId: safe(response.headers?.get('x-request-id')) };
        writeNew(path.join(callFolder, 'response-metadata.json'), receipt);
        const chunks = []; let bytes = 0;
        for await (const chunk of response.body || []) { bytes += chunk.length; if (bytes > 262144) { await response.body?.cancel().catch(() => {}); throw Error('Response size bound'); } chunks.push(chunk); }
        const raw = Buffer.concat(chunks);
        receipt.rawResponseSha256 = sha(raw);
        try { const data = JSON.parse(raw); receipt.servedModel = safe(data.model); receipt.usage = safeUsage(data.usage); receipt.requestId ||= safe(data.id); } catch {}
        if (raw.includes(Buffer.from(apiKey))) throw Error('Credential echoed by provider');
        writeNew(path.join(callFolder, 'raw-response.json'), raw);
        return new Response(raw.length ? raw : null, { status: response.status, headers: receipt.requestId ? { 'x-request-id': receipt.requestId } : {} });
    } });
    try {
        liveBegan = clock();
        result = await runner.generate(record.args.html, record.args.evidence);
        // Persist only the actual provider result, never request headers or input data.
        result.requestId = safe(result.requestId); result.servedModel = safe(result.servedModel); result.usage = safeUsage(result.usage);
        writeNew(path.join(callFolder, 'provider-result.json'), result);
        const estimatedUsd = estimateUsage(result.usage);
        audited.finish(folder, reservation, { success: true, ...receipt, estimatedUsd, reportedEstimateUsd: audited.usageCost(result.usage), accountingWarning: estimatedUsd === null ? 'Missing or out-of-bound usage; full reservation retained' : null, resultSha256: sha(fs.readFileSync(path.join(callFolder, 'provider-result.json'))), elapsedMs: Date.now() - began });
        return { id, success: true, requestId: result.requestId, servedModel: result.servedModel, usage: result.usage, estimatedUsd };
    } catch {
        if (reservation) audited.finish(folder, reservation, { success: false, ...receipt, error: 'Provider attempt failed; no retry', estimatedUsd: null, reportedEstimateUsd: audited.usageCost(receipt.usage), elapsedMs: Date.now() - began });
        throw Error(reservation ? 'Provider attempt failed; reservation retained; no retry' : 'Study preflight failed; no reservation');
    } finally { runner.close(); }
}
module.exports = { reserveScope, verifyPhase, runRecord, validateRequest, writeNew, FAKE_KEY, CANONICAL };
if (require.main === module) (async () => {
    const [command, planFile, approvalFile, id] = process.argv.slice(2);
    if (command === 'verify') { const phase = await verifyPhase(planFile, approvalFile); console.log(JSON.stringify({ verified: true, planSha256: phase.planSha256, scope: phase.plan.scope, records: phase.records.length, liveCalls: 0 })); }
    else if (command === 'run') console.log(JSON.stringify(await runRecord({ planFile, approvalFile, id })));
    else throw Error('Use verify PLAN APPROVAL or run PLAN APPROVAL RECORD_ID');
})().catch(() => { console.error('Study execution refused or failed; inspect immutable local events. No automatic retry.'); process.exitCode = 1; });
