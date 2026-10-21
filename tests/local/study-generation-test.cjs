const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto');
const { Worker } = require('node:worker_threads');
const subject = require('./study-generation.cjs');
const root = path.resolve(__dirname, '../..');
const audited = require('../../workspace/task023/refresh-20261021/live_pilot.cjs');
const { DeepSeekRunner } = require('../../backend/deepseek-runner.cjs');
const scratch = path.join(root, 'workspace/task023/refresh-20261021/study-generation-v1');
fs.mkdirSync(scratch, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const write = (file, value) => { fs.writeFileSync(file, JSON.stringify(value, null, 2)); return sha(fs.readFileSync(file)); };
function fakeLedger() {
    const folder = fs.mkdtempSync(path.join(scratch, 'fake-'));
    for (const name of ['events','lock-history']) fs.mkdirSync(path.join(folder, name));
    write(path.join(folder, 'authorization.json'), audited.authorization);
    return folder;
}
async function fixture() {
    const folder = fakeLedger(), results = {}, outcomeHashes = {};
    for (const id of [...audited.authorization.initialIds, ...audited.authorization.subsequentIds]) {
        const reservation = audited.reserve(folder, id, {});
        fs.mkdirSync(path.join(folder, id));
        results[id] = write(path.join(folder, id, 'provider-result.json'), { rule: { main: 'main', exclude: [], name: 'Synthetic pilot' } });
        audited.finish(folder, reservation, { success: true, estimatedUsd: 0, resultSha256: results[id] });
        outcomeHashes[id] = sha(fs.readFileSync(path.join(folder, 'events', String(reservation.sequence).padStart(3, '0') + '-b-outcome.json')));
    }
    const marker = path.join(folder, 'synthetic-binding.json'); write(marker, { synthetic: true });
    const assessmentFile = path.join(folder, 'assessment.json');
    const assessmentSha256 = write(assessmentFile, { schemaVersion: 1, decision: 'completed-pilot-assessed', providerResultHashes: results, strictCheckpoints: [{ file: marker, sha256: sha(fs.readFileSync(marker)) }] });
    const args = { html: '<main><h1>Synthetic reading</h1><p>Bounded model data</p></main>' };
    let body;
    const probe = new DeepSeekRunner({ apiKey: subject.FAKE_KEY, fetchRequest: async (url, options) => { body = JSON.parse(options.body); return providerResponse(); } });
    await probe.generate(args.html); probe.close();
    const requestFile = path.join(folder, 'prepared-request.json'), argumentsFile = path.join(folder, 'arguments.json');
    const record = { id: 'development-final-synthetic', requestFile, requestSha256: write(requestFile, body), argumentsFile, argumentsSha256: write(argumentsFile, args) };
    const phaseCode = {};
    for (const file of ['tests/local/study-generation.cjs','workspace/task023/refresh-20261021/live_pilot.cjs','backend/deepseek-runner.cjs','backend/model-evidence.cjs']) phaseCode[file] = sha(fs.readFileSync(path.join(root, file)));
    const plan = { schemaVersion: 1, scope: 'development-final', bindings: { phaseCode, production: { [marker]: sha(fs.readFileSync(marker)) }, scorer: { [marker]: sha(fs.readFileSync(marker)) }, inputs: { [marker]: sha(fs.readFileSync(marker)) } }, records: [record] };
    const planFile = path.join(folder, 'plan.json'), approvalFile = path.join(folder, 'approval.json');
    const approval = { schemaVersion: 1, decision: 'approved-phase', scope: plan.scope, planSha256: write(planFile, plan), pilotOutcomeHashes: outcomeHashes, assessmentFile, assessmentSha256 };
    write(approvalFile, approval);
    return { folder, plan, planFile, approval, approvalFile, record, body, marker, rebind() { record.requestSha256 = sha(fs.readFileSync(requestFile)); approval.planSha256 = write(planFile, plan); write(approvalFile, approval); } };
}
function providerResponse({ failed = false, usage = { prompt_tokens: 10, completion_tokens: 2 }, requestId = 'fake-receipt' } = {}) {
    return new Response(JSON.stringify({ id: 'fake-id', model: 'DeepSeek-V4.1-Flash-1017', usage, choices: [{ finish_reason: failed ? 'length' : 'stop', message: { content: '{"main":"main","exclude":[],"name":"Fake result"}' } }] }), { headers: { 'x-request-id': requestId } });
}
test('four pilot plus both final scopes share the80call cap without resetting allowance', () => {
    const folder = fakeLedger();
    for (let i = 0; i < 80; i++) {
        const reservation = i < 4 ? audited.reserve(folder, 'pilot-' + i, {}) : subject.reserveScope(folder, 'final-' + i, i % 2 ? 'development-final' : 'unseen-final', {});
        audited.finish(folder, reservation, { success: true, estimatedUsd: 0 });
    }
    assert.equal(audited.ledger(folder).calls.size, 80);
    assert.throws(() => subject.reserveScope(folder, 'call81', 'unseen-final', {}), /Global budget/);
});
test('pending, missing usage and failed-with-usage retain full reservations underUSD1', () => {
    const folder = fakeLedger();
    for (let i = 0; i < 16; i++) {
        const r = subject.reserveScope(folder, 'attempt-' + i, 'development-final', {});
        if (i === 0) audited.finish(folder, r, { success: false, estimatedUsd: .000001, reportedEstimateUsd: .000001, usage: { prompt_tokens: 1, completion_tokens: 1 } });
        if (i === 1) audited.finish(folder, r, { success: true, estimatedUsd: null });
    }
    assert.equal(audited.ledger(folder).chargedUsd, 1);
    assert.equal(audited.ledger(folder).calls.get('attempt-0').outcome.estimatedUsd, null);
    assert.throws(() => subject.reserveScope(folder, 'over', 'unseen-final', {}), /Global budget/);
    assert.throws(() => subject.reserveScope(folder, 'attempt-0', 'development-final', {}), /already exists/);
    assert(fs.readdirSync(path.join(folder, 'events')).some(name => name.includes('.staged-')));
});
test('concurrent scope reservations cannot overspend the final remaining slot', async () => {
    const folder = fakeLedger(); for (let i = 0; i < 15; i++) subject.reserveScope(folder, 'pending-' + i, 'development-final', {});
    const workers = Array.from({ length: 4 }, (_, i) => new Worker(`const {parentPort,workerData}=require('node:worker_threads');const api=require(workerData.module);parentPort.once('message',()=>{try{api.reserveScope(workerData.folder,workerData.id,'unseen-final',{});parentPort.postMessage(true)}catch{parentPort.postMessage(false)}parentPort.close()});parentPort.postMessage('ready');`, { eval: true, workerData: { module: path.join(__dirname, 'study-generation.cjs'), folder, id: 'race-' + i } }));
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); })));
    const outcomes = workers.map(worker => new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); })); workers.forEach(worker => worker.postMessage('go'));
    assert.equal((await Promise.all(outcomes)).filter(Boolean).length, 1);
    assert.equal(audited.ledger(folder).calls.size, 16); assert.equal(audited.ledger(folder).chargedUsd, 1);
    await Promise.all(workers.map(worker => worker.terminate()));
});
test('approved exact fake request stores immutable raw/result bindings without secrets in metadata', async () => {
    const f = await fixture(); let calls = 0;
    const response = await subject.runRecord({ planFile: f.planFile, approvalFile: f.approvalFile, id: f.record.id }, { folder: f.folder, apiKey: subject.FAKE_KEY, fetchRequest: async (url, options) => {
        calls++; assert.equal(options.headers.Authorization, 'Bearer ' + subject.FAKE_KEY); assert.equal(options.body, JSON.stringify(f.body)); return providerResponse({ requestId: subject.FAKE_KEY });
    } });
    assert.equal(calls, 1); assert.equal(response.success, true); assert.equal(response.requestId, '[redacted]');
    const state = audited.ledger(f.folder), call = state.calls.get(f.record.id), dir = path.join(f.folder, f.record.id);
    assert.equal(call.outcome.rawResponseSha256, sha(fs.readFileSync(path.join(dir, 'raw-response.json'))));
    assert.equal(call.outcome.resultSha256, sha(fs.readFileSync(path.join(dir, 'provider-result.json'))));
    assert(!JSON.stringify(call).includes(subject.FAKE_KEY)); assert(!JSON.stringify(call).includes('Bounded model data'));
    await assert.rejects(subject.runRecord({ planFile: f.planFile, approvalFile: f.approvalFile, id: f.record.id }, { folder: f.folder, apiKey: subject.FAKE_KEY, fetchRequest: async () => { calls++; return providerResponse(); } }), /already exists/); assert.equal(calls, 1);
});
test('failed provider with reported usage remains fully reserved and cannot retry', async () => {
    const f = await fixture(); let calls = 0;
    await assert.rejects(subject.runRecord({ planFile: f.planFile, approvalFile: f.approvalFile, id: f.record.id }, { folder: f.folder, apiKey: subject.FAKE_KEY, fetchRequest: async () => { calls++; return providerResponse({ failed: true }); } }), /reservation retained/);
    const call = audited.ledger(f.folder).calls.get(f.record.id); assert.equal(calls, 1); assert.equal(call.outcome.success, false); assert.equal(call.outcome.estimatedUsd, null); assert(call.outcome.reportedEstimateUsd > 0); assert.equal(audited.ledger(f.folder).chargedUsd, .0625);
});
test('partial reserved attempts never fetch again and event publication never overwrites', async () => {
    const f = await fixture(); subject.reserveScope(f.folder, f.record.id, f.plan.scope, {});
    let calls = 0;
    await assert.rejects(subject.runRecord({ planFile: f.planFile, approvalFile: f.approvalFile, id: f.record.id }, { folder: f.folder, apiKey: subject.FAKE_KEY, fetchRequest: async () => { calls++; return providerResponse(); } }), /already exists/);
    assert.equal(calls, 0); assert.equal(audited.ledger(f.folder).chargedUsd, .0625);
    const immutable = path.join(f.folder, 'immutable.json'); subject.writeNew(immutable, { first: true });
    assert.throws(() => subject.writeNew(immutable, { replacement: true })); assert.deepEqual(JSON.parse(fs.readFileSync(immutable)), { first: true });
    assert(fs.readdirSync(f.folder).filter(name => name.startsWith('immutable.json.staged-')).length === 2);
});
test('credential echoes are not persisted and transport failure stays fully reserved', async () => {
    const f = await fixture();
    await assert.rejects(subject.runRecord({ planFile: f.planFile, approvalFile: f.approvalFile, id: f.record.id }, { folder: f.folder, apiKey: subject.FAKE_KEY, fetchRequest: async () => new Response(JSON.stringify({ id: subject.FAKE_KEY, usage: { prompt_tokens: 1, completion_tokens: 0 } })) }), /reservation retained/);
    const call = audited.ledger(f.folder).calls.get(f.record.id);
    assert.equal(call.outcome.estimatedUsd, null); assert(!JSON.stringify(call).includes(subject.FAKE_KEY));
    assert.equal(fs.existsSync(path.join(f.folder, f.record.id, 'raw-response.json')), false); assert(call.outcome.rawResponseSha256);
});
test('invalid or out-of-bound success usage cannot release its reserved allowance', async () => {
    for (const usage of [undefined, { prompt_tokens: 1, completion_tokens: 1, prompt_cache_hit_tokens: -1 }, { prompt_tokens: 1, completion_tokens: 1000000 }]) {
        const f = await fixture();
        await subject.runRecord({ planFile: f.planFile, approvalFile: f.approvalFile, id: f.record.id }, { folder: f.folder, apiKey: subject.FAKE_KEY, fetchRequest: async () => usage === undefined ? new Response(JSON.stringify({ model: 'fake', choices: [{ finish_reason: 'stop', message: { content: '{"main":"main","exclude":[],"name":"No usage"}' } }] })) : providerResponse({ usage }) });
        assert.equal(audited.ledger(f.folder).calls.get(f.record.id).outcome.estimatedUsd, null);
        assert.equal(audited.ledger(f.folder).chargedUsd, .0625);
    }
});
test('approval, hash drift, duplicate IDs and model constraints reject before fake provider fetch', async () => {
    for (const mode of ['missing-approval','hash-drift','duplicate-id','bad-model','bad-tokens','large-user','wrong-system','unfinished-pilot','unsuccessful-pilot']) {
        const f = await fixture();
        if (mode === 'missing-approval') fs.renameSync(f.approvalFile, f.approvalFile + '.archived');
        if (mode === 'hash-drift') fs.appendFileSync(f.marker, 'changed');
        if (mode === 'duplicate-id') { f.plan.records.push({ ...f.record }); f.rebind(); }
        if (mode === 'unfinished-pilot') { const name = fs.readdirSync(path.join(f.folder, 'events')).find(name => /^004-b-outcome/.test(name)); fs.renameSync(path.join(f.folder, 'events', name), path.join(f.folder, name + '.archived')); }
        if (mode === 'unsuccessful-pilot') { const target = path.join(f.folder, 'events/004-b-outcome.json'); const outcome = JSON.parse(fs.readFileSync(target)); outcome.success = false; write(target, outcome); f.approval.pilotOutcomeHashes[outcome.id] = sha(fs.readFileSync(target)); write(f.approvalFile, f.approval); }
        if (['bad-model','bad-tokens','large-user','wrong-system'].includes(mode)) {
            const request = structuredClone(f.body);
            if (mode === 'bad-model') request.model = 'different';
            if (mode === 'bad-tokens') request.max_tokens = 2048;
            if (mode === 'large-user') request.messages[1].content = 'x'.repeat(12001);
            if (mode === 'wrong-system') request.messages[0].content = 'Changed system';
            write(f.record.requestFile, request); f.rebind();
        }
        let calls = 0; await assert.rejects(subject.runRecord({ planFile: f.planFile, approvalFile: f.approvalFile, id: f.record.id }, { folder: f.folder, apiKey: subject.FAKE_KEY, fetchRequest: async () => { calls++; return providerResponse(); } }));
        assert.equal(calls, 0, mode); assert.equal(audited.ledger(f.folder).calls.size, 4, mode);
    }
});
test('44-record binding recheck exceeding the live deadline never reserves or fetches', async () => {
    const f = await fixture();
    f.plan.records = Array.from({ length: 44 }, (_, index) => ({ ...f.record, id: 'slow-phase-' + index })); f.rebind();
    let elapsed = 0, argumentChecks = 0, calls = 0, generations = 0;
    const originalGenerate = DeepSeekRunner.prototype.generate;
    DeepSeekRunner.prototype.generate = function (...args) { generations++; return originalGenerate.apply(this, args); };
    try {
        await assert.rejects(subject.runRecord({ planFile: f.planFile, approvalFile: f.approvalFile, id: f.plan.records[0].id }, {
            folder: f.folder, apiKey: subject.FAKE_KEY, fetchRequest: async () => { calls++; return providerResponse(); },
            clock: () => elapsed,
            onBindingChecked: file => { if (file === fs.realpathSync(f.record.argumentsFile)) { argumentChecks++; elapsed += 1500; } }
        }), /no reservation/);
    } finally { DeepSeekRunner.prototype.generate = originalGenerate; }
    assert.equal(argumentChecks, 44); assert.equal(elapsed, 66000);
    assert.equal(generations, 45, '44 offline reproductions plus one live runner; no reproduction inside fetch hook');
    assert.equal(calls, 0); assert.equal(audited.ledger(f.folder).calls.size, 4); assert.equal(audited.ledger(f.folder).chargedUsd, 0);
});
test('aborted, already elapsed and lock-time elapsed requests all stop before reservation', async () => {
    for (const mode of ['aborted','entry-expired','lock-expired']) {
        const f = await fixture(); let calls = 0, reads = 0;
        await assert.rejects(subject.runRecord({ planFile: f.planFile, approvalFile: f.approvalFile, id: f.record.id }, {
            folder: f.folder, apiKey: subject.FAKE_KEY, fetchRequest: async () => { calls++; return providerResponse(); },
            clock: () => { reads++; return mode === 'entry-expired' && reads >= 2 || mode === 'lock-expired' && reads >= 5 ? 60001 : 0; },
            beforeBindingRecheck: signal => { if (mode === 'aborted') Object.defineProperty(signal, 'aborted', { value: true }); }
        }), /no reservation/);
        assert.equal(calls, 0, mode); assert.equal(audited.ledger(f.folder).calls.size, 4, mode);
    }
});
test('post-reservation deadline expiry retains its reservation without provider dispatch', async () => {
    const f = await fixture(); let elapsed = 0, calls = 0;
    await assert.rejects(subject.runRecord({ planFile: f.planFile, approvalFile: f.approvalFile, id: f.record.id }, {
        folder: f.folder, apiKey: subject.FAKE_KEY,
        fetchRequest: async () => { calls++; return providerResponse(); },
        clock: () => elapsed,
        afterReservation: () => { elapsed = 60001; }
    }), /reservation retained/);
    assert.equal(calls, 0);
    const state = audited.ledger(f.folder), call = state.calls.get(f.record.id);
    assert.equal(state.calls.size, 5); assert.equal(state.chargedUsd, .0625);
    assert.equal(call.outcome.success, false); assert.equal(call.outcome.estimatedUsd, null);
});
