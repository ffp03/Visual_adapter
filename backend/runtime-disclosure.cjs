'use strict';
const { Views } = require('./agent/outline.cjs');
const { SYSTEM_PROMPT, runLoop } = require('./agent/loop.cjs');
const { synchronous } = require('./agent/baselines.cjs');
const { BoundaryError } = require('./agent/ledger.cjs');
const { createHash } = require('node:crypto');
const hash = s => createHash('sha256').update(s).digest('hex');
// These limits are not exported by the agent. Derive them from its executable
// defaults and fail closed if that interface changes, rather than silently
// presenting a stale product limit. Views budgets cues, not the entire JSON
// observation: the runtime wrapper additionally enforces this derived budget
// on the complete final message (observation plus bounded action history).
function limits(pageCount = 2) {
    const cue = /remaining:\s*(\d+)/.exec(Views.prototype.summary.toString());
    const turns = /maxTurns\s*=\s*(\d+)/.exec(runLoop.toString());
    if (!cue || !turns) throw new BoundaryError('agent-disclosure-limits-unavailable');
    return { maxTurns: Number(turns[1]), observationCharacters: pageCount * Number(cue[1]), pageCueCharacters: Number(cue[1]) };
}
const payloadFor = (runner, messages) => JSON.parse(JSON.stringify(runner.payload ? runner.payload(messages) : { model: runner.model, messages }));
function firstDisclosure(documents, runner) {
    const bound = limits(documents.length);
    const views = new Views(documents, { cueLength: 60, mode: 'P4', baselines: synchronous(documents) });
    // The public loop prompt and Views are the sole sources of page evidence.
    // Framing mirrors loop.cjs; the guarded actual first payload must match its
    // preview hash before ANY transport, so drift refuses instead of sending.
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify({
        mode: 'P4', hostname: documents[0].location.hostname, model: runner.model || 'scripted', inductionPages: documents.length,
        cueLength: 60, remainingTurns: bound.maxTurns, pages: views.initial()
    }) }, { role: 'user', content: JSON.stringify({ actionLog: [], remainingTurns: bound.maxTurns, mustSubmit: bound.maxTurns === 1 }) }];
    const payload = payloadFor(runner, messages), serialized = JSON.stringify(payload);
    const emptyMessages = messages.map((m, i) => i === messages.length - 1 ? { ...m, content: '' } : m);
    // JSON escapes at most six characters per UTF-16 code unit. Include all
    // repeated initial evidence, system instructions and provider settings.
    const perRequestCharacters = JSON.stringify(payloadFor(runner, emptyMessages)).length + 6 * bound.observationCharacters;
    return { ...bound, perRequestCharacters, maximumTotalCharacters: bound.maxTurns * perRequestCharacters,
        characters: serialized.length, payloadHash: hash(serialized), sample: messages[1].content.slice(0, 1800) };
}
function checkPayload(messages, payload, disclosure, turn) {
    const serialized = JSON.stringify(payload);
    if (messages.at(-1).content.length > disclosure.observationCharacters || serialized.length > disclosure.perRequestCharacters
        || turn > disclosure.maxTurns) throw new BoundaryError('induction-observation-cap-exceeded');
    if (turn === 1 && hash(serialized) !== disclosure.payloadHash) throw new BoundaryError('first-payload-disclosure-changed');
    return serialized;
}
module.exports = { firstDisclosure, checkPayload, limits, payloadFor };
