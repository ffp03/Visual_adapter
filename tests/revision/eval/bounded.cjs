'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
function decodeReply(policy, stdout) {
  try {
    const output = JSON.parse(stdout);
    if (!output || typeof output !== 'object' || Array.isArray(output) || typeof output.ok !== 'boolean' || typeof output.latencyMs !== 'number' || !Number.isFinite(output.latencyMs) || output.latencyMs < 0 ||
        (output.ok ? output.reason !== null : typeof output.reason !== 'string' || !output.reason)) throw Error('invalid-worker-response');
    if (policy === 'compile') {
      if (output.ok && (!output.procedure || output.procedure.schemaVersion !== 2 || !Array.isArray(output.procedure.regions) || !output.procedure.regions.length)) throw Error('invalid-worker-procedure');
      if (!output.ok && output.procedure !== null) throw Error('invalid-worker-failure');
    } else if (typeof output.html !== 'string' || typeof output.text !== 'string' || typeof output.fallback !== 'boolean') throw Error('invalid-worker-output');
    return output;
  } catch { return { html: '', text: '', ok: false, fallback: false, procedure: null, latencyMs: null, reason: 'runtime-worker-invalid-response' }; }
}
function executeBounded(policy, page, candidate, options = {}) {
  const timeoutMs = options.timeoutMs ?? (policy === 'P0' ? 120000 : 60000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw Error('invalid-policy-timeout');
  const child = spawnSync(process.execPath, [path.join(__dirname, 'policy-worker.cjs')], {
    input: JSON.stringify({ policy, page, candidate, options }), encoding: 'utf8', timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024, windowsHide: true
  });
  let output;
  if (child.error || child.status !== 0) {
    output = { html: '', text: '', ok: false, fallback: false, procedure: null, latencyMs: null,
      reason: child.error?.code === 'ETIMEDOUT' ? 'runtime-timeout:' + timeoutMs + 'ms' : 'runtime-worker-error:' + (child.error?.code || child.signal || child.status) };
  } else output = decodeReply(policy, child.stdout);
  return { ...output, timeoutMs, diagnostics: (child.stderr || '').slice(-4096) || null };
}
module.exports = { executeBounded, decodeReply };
