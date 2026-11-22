'use strict';
// Read-only provenance-bound smoke replay of saved October model candidates.
// These are execution diagnostics, not scores against November references.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { coreSha256 } = require('./policies/p2-replay.cjs');
const { characterLength } = require('./score.cjs');
const { ROOT } = require('./run-baselines.cjs');
const { createOutput, failureCategory } = require('./output.cjs');
const { executeBounded } = require('./bounded.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const artifactName = (id, policy) => hash(String(id)).slice(0, 16) + '-' + policy + '.html';
function boundRead(file, expected) {
  const bytes = fs.readFileSync(path.resolve(ROOT, file));
  if (hash(bytes) !== expected) throw Error('frozen-artifact-sha256-mismatch:' + file);
  return bytes;
}
function loadFrozenCandidate(record) {
  const receipt = JSON.parse(boundRead(record.outcomeFile, record.outcomeSha256));
  if (typeof record.attemptId !== 'string' || !record.attemptId.trim() || typeof receipt.id !== 'string' || !receipt.id.trim() || receipt.phase !== 'outcome' || receipt.id !== record.attemptId || typeof receipt.success !== 'boolean') throw Error('receipt-attempt-binding-mismatch');
  if (!receipt.success) return { ok: false, reason: 'provider-attempt-failed:' + (receipt.error || receipt.status || 'unknown'), receipt };
  if (receipt.resultSha256 !== record.candidateSha256) throw Error('receipt-candidate-binding-mismatch');
  let candidate;
  const bytes = boundRead(record.candidateFile, record.candidateSha256);
  try { candidate = JSON.parse(bytes); } catch { return { ok: false, reason: 'invalid-candidate-json', receipt }; }
  if (typeof receipt.requestId !== 'string' || !receipt.requestId.trim() || typeof candidate.requestId !== 'string' || !candidate.requestId.trim() || candidate.requestId !== receipt.requestId) throw Error('receipt-request-binding-mismatch');
  return { ok: true, candidate: candidate.rule, receipt };
}
function run(outputDirectory, { limit = Infinity, timeoutMs = 60000 } = {}) {
  outputDirectory = path.resolve(outputDirectory);
  const study = path.join(ROOT, 'workspace/task023/refresh-20261021/final-study-v1');
  const manifest = JSON.parse(fs.readFileSync(path.join(study, 'prepared44-v2/manifest.json')));
  const contracts = fs.readdirSync(path.join(study, 'contracts')).filter(f => f.endsWith('.candidates.json')).sort();
  const records = contracts.flatMap(file => JSON.parse(fs.readFileSync(path.join(study, 'contracts', file))).records.map(r => ({ ...r, contract: file })));
  if (new Set(records.map(r => r.id)).size !== records.length) throw Error('duplicate-contract-page');
  createOutput(outputDirectory);
  const rows = [];
  for (const record of records.slice(0, limit)) {
    const page = manifest.pages.find(p => p.id === record.id);
    if (!page) throw Error('contract-page-not-in-manifest:' + record.id);
    const source = boundRead(page.sourceFile, page.sourceSha256);
    const saved = loadFrozenCandidate(record);
    const failure = { html: '', text: '', ok: false, reason: saved.reason };
    const outputs = saved.ok ? Object.fromEntries(['P2', 'P2-nr'].map(policy => [policy, executeBounded(policy, { html: source.toString('utf8'), url: page.url }, saved.candidate, { timeoutMs })])) : { P2: failure, 'P2-nr': failure };
    for (const [policy, output] of Object.entries(outputs)) {
      const outputFile = artifactName(page.id, policy);
      fs.writeFileSync(path.join(outputDirectory, outputFile), output.html);
      const row = { id: page.id, site: page.site, policy, ok: output.ok, reason: output.reason, failureCategory: output.ok ? null : failureCategory(output.reason), outputCharacters: characterLength(output.text),
        outputFile, outputSha256: hash(output.html), coreSha256, candidateSha256: record.candidateSha256,
        candidateFile: record.candidateFile, sourceSha256: page.sourceSha256, contract: record.contract,
        timeoutMs, diagnostics: output.diagnostics || null, adjustments: output.procedure?.adjustments || [] };
      rows.push(row); fs.appendFileSync(path.join(outputDirectory, 'rows.jsonl'), JSON.stringify(row) + '\n');
    }
    console.log(`${page.id}: ${Object.entries(outputs).map(([p, o]) => `${p} ${o.ok ? 'ok' : 'failure: ' + o.reason} (${characterLength(o.text)} chars)`).join('; ')}`);
  }
  const summary = { scope: 'November jsdom execution of frozen October candidates; not historical browser reproduction or November accuracy scores', pages: rows.length / 2,
    policies: Object.fromEntries(['P2', 'P2-nr'].map(p => [p, { successes: rows.filter(r => r.policy === p && r.ok).length, failures: rows.filter(r => r.policy === p && !r.ok).length }])) };
  fs.writeFileSync(path.join(outputDirectory, 'summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}
module.exports = { run, loadFrozenCandidate, artifactName };
if (require.main === module) {
  const [output = path.join(ROOT, 'workspace/revision/results', 'october-replay-' + Date.now()), limit] = process.argv.slice(2);
  console.log(JSON.stringify(run(output, { limit: limit === undefined ? Infinity : Number(limit) }), null, 2));
}
