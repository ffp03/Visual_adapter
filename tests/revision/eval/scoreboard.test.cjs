'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./output.cjs');
const { run } = require('./scoreboard.cjs');
const { validateReference, freezeValidReferences, sha256 } = require('./references.cjs');
const { SCORING_VERSION } = require('./score.cjs');
function fixture() {
  fs.mkdirSync(path.join(ROOT, 'workspace/revision/results'), { recursive: true });
  const folder = fs.mkdtempSync(path.join(ROOT, 'workspace/revision/results/scoreboard-test-'));
  const html = '<main><h1>Fixture title</h1><p>Meaningful body content starts right here.</p></main><nav>Global navigation</nav>';
  const reference = { content: [{ id: 't', role: 'title', required: true, text: 'Fixture title' }, { id: 'b', role: 'body', required: true, text: 'Meaningful body content starts right here.' }], noise: [{ id: 'n', text: 'Global navigation' }], neutral: [] };
  fs.writeFileSync(path.join(folder, 'capture.html'), html);
  fs.writeFileSync(path.join(folder, 'reference.json'), JSON.stringify(reference));
  const pages = ['a', 'b'].map(id => ({ id, site: id + '.example', url: 'https://' + id + '.example/', sourceFile: 'capture.html', referenceFile: 'reference.json' }));
  const manifest = path.join(folder, 'manifest.json'); fs.writeFileSync(manifest, JSON.stringify({ pages }));
  return { folder, manifest, html, reference, pages };
}
function outputs(f, name, rows, html = '<h1>Fixture title</h1><p>Meaningful body content starts right here.</p>') {
  const folder = path.join(f.folder, name); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'rows.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  for (const r of rows) if (r.ok || r.fallback) fs.writeFileSync(path.join(folder, r.outputFile || `${r.id}-${r.policy}.html`), html);
  return folder;
}
const row = (id, policy, extra = {}) => ({ id, policy, ok: true, fallback: false, modelRequests: 0, ...extra });
test('shared reference checking uses spaced DOM text and enforces empty/duplicate units', () => {
  const f = fixture();
  assert.deepEqual(validateReference(f.reference, f.html), []);
  const cells = '<h1>Fixture title</h1><table><tr><td>Key</td><td>Value</td></tr></table>';
  assert.deepEqual(validateReference({ ...f.reference, content: [f.reference.content[0], { id: 'table', role: 'table', required: true, text: 'Key Value' }], noise: [] }, cells), []);
  assert.ok(validateReference({ ...f.reference, noise: [{ id: 'empty', text: '' }] }, f.html).some(e => e.reason === 'empty-reference-unit'));
  assert.ok(validateReference({ ...f.reference, content: [...f.reference.content, { ...f.reference.content[0], id: 'duplicate' }] }, f.html).some(e => e.reason === 'duplicate-unit-multiplicity'));
  assert.ok(validateReference({ ...f.reference, content: [null] }, f.html).some(e => e.reason === 'invalid-reference-unit'));
  const snapshot = freezeValidReferences(f.manifest, path.join(f.folder, 'frozen'));
  assert.equal(snapshot.snapshot.pages.length, 2);
  const bytes = fs.readFileSync(snapshot.snapshot.pages[0].referenceFile);
  assert.equal(sha256(bytes), snapshot.snapshot.pages[0].referenceSha256);
});
test('review 4: a string required flag rejects the entire reference including scoreboard use', () => {
  const f = fixture();
  const bad = { ...f.reference, content: [f.reference.content[0], { ...f.reference.content[1], required: 'true' }] };
  assert.ok(validateReference(bad, f.html).some(e => e.reason === 'invalid-required-flag' && e.id === 'b'));
  fs.writeFileSync(path.join(f.folder, 'reference.json'), JSON.stringify(bad));
  const folder = outputs(f, 'baseline', [row('a', 'P0'), row('b', 'P0')]);
  const result = run(f.manifest, [folder], { resamples: 20 });
  assert.equal(result.rows.length, 0); assert.equal(result.summary.skipped.length, 2);
});
test('review 6: audited subset is reported separately from the combined cohort', () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.folder, 'audited-reference.json'), JSON.stringify({ ...f.reference, audited: true }));
  fs.writeFileSync(f.manifest, JSON.stringify({ pages: f.pages.map(p => p.id === 'a' ? { ...p, referenceFile: 'audited-reference.json' } : p) }));
  const baseline = outputs(f, 'baseline', [row('a', 'P0'), row('b', 'P0', { ok: false, reason: 'runtime-error' }), row('a', 'P1'), row('b', 'P1', { ok: false, reason: 'runtime-error' })]);
  const agent = outputs(f, 'agent', [row('a', 'P3'), row('b', 'P3', { ok: false, reason: 'invalid' })]);
  const result = run(f.manifest, [baseline, agent], { resamples: 100 });
  assert.equal(result.summary.policies.P0.measures.cleanPass.estimate, 0.5);
  assert.equal(result.summary.audited.policies.P0.measures.cleanPass.estimate, 1);
  assert.equal(result.summary.audited.policies.P0.pages, 1); assert.equal(result.summary.audited.bySite['a.example'].policies.P0.pages, 1);
  assert.deepEqual(result.summary.audited.validPages, ['a']); assert.equal(result.summary.audited.comparisons.length, 2);
  assert.match(result.markdown, /Audited-reference subset/); assert.match(result.markdown, /Audited-reference paired differences/);
  assert.equal(result.rows.find(r => r.id === 'a').audited, true); assert.equal(result.rows.find(r => r.id === 'b').audited, false);
  fs.writeFileSync(path.join(f.folder, 'audited-reference.json'), JSON.stringify({ ...f.reference, audit: { status: 'audited' } }));
  assert.equal(run(f.manifest, [baseline], { resamples: 20 }).summary.audited.policies.P0.pages, 1);
});
test('scoreboard combines folders, ignores saved scores, retains accounting and prints paired agent intervals', () => {
  const f = fixture();
  const baseline = outputs(f, 'baselines', f.pages.flatMap(p => ['P0', 'P1'].map(policy => row(p.id, policy, { outputFile: p.id + '-' + policy + '.html', scores: { contentRecall: -99 }, scoringVersion: 'old', referenceSha256: 'old-reference' }))));
  const agent = outputs(f, 'agent', [row('a', 'P3', { modelRequests: 2, tokens: { prompt: 100, completion: 20, cached: 30 } }), row('b', 'P3', { ok: false, fallback: true, reason: 'gate-rejected', modelRequests: 1, promptTokens: 50 })]);
  const result = run(f.manifest, [baseline, agent], { outputDirectory: path.join(f.folder, 'scoreboard'), resamples: 100 });
  assert.equal(result.rows.length, 6); assert.equal(result.summary.comparisons.length, 2);
  assert.equal(result.summary.bySite['a.example'].policies.P3.pages, 1);
  const deliveredFallback = result.rows.find(r => r.id === 'b' && r.policy === 'P3');
  assert.equal(deliveredFallback.ok, false); assert.equal(deliveredFallback.scores.cleanPass, true); assert.equal(deliveredFallback.scores.noFallbackPass, false);
  assert.equal(deliveredFallback.failureCategory, 'gate-rejected');
  assert.equal(result.summary.policies.P3.failures, 1); assert.equal(result.summary.policies.P3.fallbacks, 1);
  assert.equal(result.summary.policies.P3.accounting.modelRequests, 3); assert.equal(result.summary.policies.P3.accounting.promptTokens, 150); assert.equal(result.summary.policies.P3.accounting.cachedTokens, 30);
  assert.equal(result.rows[0].scores.contentRecall, 1); assert.equal(result.rows[0].scoringVersion, SCORING_VERSION);
  assert.match(result.markdown, /Paired differences/); assert.match(result.markdown, /P3 \| P0 \| cleanPass/);
  assert.equal(result.summary.comparisons[0].measures.cleanPass.pages, 2);
  assert.ok(fs.existsSync(path.join(f.folder, 'scoreboard', result.rows[0].referenceSnapshotFile)));
  assert.throws(() => run(f.manifest, [baseline, baseline]), /duplicate-page-policy/);
});
test('missing rows and HTML are counted failures, and invalid references are skipped for all policies', () => {
  const f = fixture();
  const agent = outputs(f, 'agent', [row('a', 'P4')]);
  const missingRow = run(f.manifest, [agent], { resamples: 20 });
  assert.equal(missingRow.summary.policies.P4.pages, 2); assert.equal(missingRow.summary.policies.P4.failures, 1);
  assert.equal(missingRow.rows.find(r => r.id === 'b').reason, 'missing-policy-row');
  assert.equal(missingRow.summary.unavailableComparisons.length, 2);
  const missing = outputs(f, 'missing-html', [row('a', 'P0', { outputFile: 'other.html' })]);
  // Point at a non-existent file after writing one known artifact.
  fs.writeFileSync(path.join(missing, 'rows.jsonl'), JSON.stringify(row('a', 'P0', { outputFile: 'absent.html' })));
  assert.equal(run(f.manifest, [missing], { resamples: 20 }).rows[0].reason, 'missing-policy-output');
  fs.writeFileSync(path.join(f.folder, 'bad-reference.json'), JSON.stringify({ ...f.reference, noise: [{ text: '' }] }));
  fs.writeFileSync(f.manifest, JSON.stringify({ pages: f.pages.map(p => p.id === 'b' ? { ...p, referenceFile: 'bad-reference.json' } : p) }));
  const skipped = run(f.manifest, [agent], { resamples: 20 });
  assert.equal(skipped.rows.length, 1); assert.equal(skipped.summary.skipped[0].id, 'b');
  fs.writeFileSync(f.manifest, JSON.stringify({ pages: f.pages.map(p => ({ ...p, referenceFile: 'bad-reference.json' })) }));
  const empty = run(f.manifest, [agent], { resamples: 20, outputDirectory: path.join(f.folder, 'empty-scoreboard') });
  assert.equal(empty.rows.length, 0); assert.equal(empty.summary.skipped.length, 2); assert.deepEqual(empty.summary.declaredPolicies, ['P4']);
  assert.match(empty.markdown, /No valid reference pages/); assert.match(empty.markdown, /Skipped page/);
  assert.equal(fs.readFileSync(path.join(f.folder, 'empty-scoreboard/rows.jsonl'), 'utf8'), '');
});
test('source/output mismatches, malformed metadata and path escapes never produce successful rows', () => {
  const f = fixture();
  const folders = [
    outputs(f, 'wrong-source', [row('a', 'P0', { sourceSha256: 'wrong' })]),
    outputs(f, 'wrong-output', [row('a', 'P1', { outputSha256: 'wrong' })]),
    outputs(f, 'bad-accounting', [row('a', 'P3', { modelRequests: -1 })])
  ];
  const r = run(f.manifest, folders, { resamples: 20 });
  assert.equal(r.rows.filter(x => x.ok).length, 0); assert.equal(r.summary.accountingIncomplete, true);
  assert.equal(r.rows.find(x => x.policy === 'P0').reason, 'source-sha256-mismatch');
  const escaped = outputs(f, 'escape', [row('a', 'P4')]);
  fs.writeFileSync(path.join(escaped, 'rows.jsonl'), JSON.stringify(row('a', 'P4', { outputFile: '../capture.html' })));
  assert.equal(run(f.manifest, [escaped], { resamples: 20 }).rows[0].reason, 'invalid-output-path');
  const { metadata } = require('./scoreboard.cjs');
  assert.ok(metadata(row('a', 'P4', { tokens: 500 })).errors.includes('invalid-tokens-object'));
  assert.ok(metadata(row('a', 'P4', { tokens: { input: 500 } })).errors.includes('unknown-token-field'));
});
