'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { run, ROOT, normalizeManifest, pageFiles, loadCandidate } = require('./run-baselines.cjs');
fs.mkdirSync(path.join(ROOT, 'workspace/revision/results'), { recursive: true });
test('end-to-end manifest run counts invalid candidates, saves artifacts and reports pending references', () => {
  const folder = fs.mkdtempSync(path.join(ROOT, 'workspace/revision/results/synthetic-test-'));
  fs.writeFileSync(path.join(folder, 'capture.html'), '<main><h1>Fixture title</h1><p>' + 'A substantial article sentence giving detail and useful information. '.repeat(10) + '</p></main>');
  const reference = { content: [{ id: 't', role: 'title', required: true, text: 'Fixture title' }, { id: 'b', role: 'body', required: true, text: 'A substantial article sentence giving detail and useful information.' }], noise: [{ id: 'nav', text: 'Global navigation' }] };
  fs.writeFileSync(path.join(folder, 'reference.json'), JSON.stringify(reference));
  const manifest = { pages: [{ id: 'one', site: 'example.org', url: 'https://example.org/', sourceFile: 'capture.html', referenceFile: 'reference.json', candidate: { main: '#missing', name: 'bad', exclude: [] } }, { id: 'pending', site: 'example.org', sourceFile: 'capture.html', referenceFile: 'pending.json' }] };
  const file = path.join(folder, 'manifest.json'); fs.writeFileSync(file, JSON.stringify(manifest));
  const { rows, summary } = run(file, path.join(folder, 'output'), { resamples: 100 });
  assert.equal(rows.length, 4); assert.equal(summary.skipped.length, 1);
  for (const policy of ['P2', 'P2-nr']) { const row = rows.find(r => r.policy === policy); assert.equal(row.ok, false); assert.equal(row.scores.contentRecall, 0); assert.equal(summary.policies[policy].failures, 1); }
  assert.equal(rows.find(r => r.policy === 'P0').scores.cleanPass, true);
  assert.ok(fs.existsSync(path.join(folder, 'output/summary.json')));
  assert.deepEqual(fs.readFileSync(path.join(folder, 'output', rows[0].referenceSnapshotFile)), fs.readFileSync(path.join(folder, 'reference.json')));
  assert.deepEqual(fs.readFileSync(path.join(folder, 'output/manifest.snapshot.json')), fs.readFileSync(file));
  assert.equal(fs.readFileSync(path.join(folder, 'output/rows.jsonl'), 'utf8').trim().split('\n').length, 4);
  assert.throws(() => run(file, path.join(folder, 'output')), /directory-exists/);
});
test('file candidates with parse errors and missing captures stay in the denominator; audited subset is separate', () => {
  const folder = fs.mkdtempSync(path.join(ROOT, 'workspace/revision/results/synthetic-provenance-'));
  fs.writeFileSync(path.join(folder, 'capture.html'), '<main><h1>Fixture title</h1><p>Article text.</p></main>');
  fs.writeFileSync(path.join(folder, 'bad-candidate.json'), '{broken');
  fs.writeFileSync(path.join(folder, 'reference.json'), JSON.stringify({ audited: true, content: [{ id: 't', role: 'title', required: true, text: 'Fixture title' }], noise: [] }));
  const pages = ['candidate-bad', 'source-missing'].map(id => ({ pageId: id, site: 'fixture', url: 'https://example.org/', sourceFile: id === 'source-missing' ? 'absent.html' : 'capture.html', referenceFile: 'reference.json', candidateFile: 'bad-candidate.json' }));
  const manifest = path.join(folder, 'manifest.json'); fs.writeFileSync(manifest, JSON.stringify({ pages }));
  const { rows, summary } = run(manifest, path.join(folder, 'output'), { resamples: 20 });
  assert.equal(rows.length, 8); assert.equal(summary.audited.policies.P0.pages, 2);
  assert.equal(summary.policies['P2-nr'].failures, 2);
  for (const row of rows.filter(r => r.id === 'source-missing')) { assert.equal(row.ok, false); assert.equal(row.scores.cleanPass, false); }
});
test('canonical nested site manifest resolves corpus page paths', () => {
  const pages = normalizeManifest({ sites: [{ siteId: 'dev-01', host: 'example.org', pages: [{ pageId: 'dev-01-p1', url: 'https://example.org/' }] }] });
  assert.equal(pages[0].id, 'dev-01-p1'); assert.equal(pages[0].site, 'example.org');
  assert.equal(pageFiles(pages[0], path.join(ROOT, 'workspace/revision/corpus/dev-manifest.json')).source, path.join(ROOT, 'workspace/revision/corpus/dev/dev-01/dev-01-p1/rendered-dom.html'));
});
test('runner shared mode binds compilation to seed and candidate files retain byte hashes', () => {
  const folder = fs.mkdtempSync(path.join(ROOT, 'workspace/revision/results/synthetic-shared-'));
  const html = '<h1 id="title">Shared title</h1><main><p>' + 'Seed article prose with substantive details. '.repeat(10) + '</p></main>';
  fs.writeFileSync(path.join(folder, 'seed.html'), html);
  fs.writeFileSync(path.join(folder, 'target.html'), html + '<aside id="added"><p>New reading material outside main.</p></aside>');
  fs.writeFileSync(path.join(folder, 'reference.json'), JSON.stringify({ content: [{ id: 't', role: 'title', required: true, text: 'Shared title' }], noise: [] }));
  const envelope = JSON.stringify({ rule: { name: 'shared', main: 'main', exclude: [] }, requestId: 'fixture' }, null, 2);
  const hash = crypto.createHash('sha256').update(envelope).digest('hex');
  fs.writeFileSync(path.join(folder, 'candidate.json'), envelope);
  const pages = [{ id: 'seed', sourceFile: 'seed.html', candidateFile: 'candidate.json', candidateSha256: hash }, { id: 'target', sourceFile: 'target.html' }].map(p => ({ ...p, seedId: 'seed', site: 'example.org', referenceFile: 'reference.json', url: 'https://example.org/' }));
  const file = path.join(folder, 'manifest.json'); fs.writeFileSync(file, JSON.stringify({ pages }));
  const { rows } = run(file, path.join(folder, 'output'), { p2Mode: 'shared', resamples: 20 });
  const target = rows.find(r => r.id === 'target' && r.policy === 'P2');
  assert.equal(target.ok, false); assert.equal(target.inductionPageId, 'seed'); assert.equal(target.candidateSha256, hash);
  assert.notEqual(target.candidateRuleSha256, hash); assert.equal(target.candidateFile, path.join(folder, 'candidate.json'));
  assert.equal(target.procedureSha256, rows.find(r => r.id === 'seed' && r.policy === 'P2').procedureSha256);
  const mismatched = loadCandidate({ candidateFile: 'candidate.json', candidateSha256: 'wrong' }, file);
  assert.equal(mismatched.observedSha256, hash); assert.match(mismatched.error.message, /sha256-mismatch/);
  const differentSites = pages.map(p => ({ ...p, site: undefined, url: p.id === 'seed' ? 'https://seed.example/' : 'https://other.example/' }));
  const crossSiteFile = path.join(folder, 'cross-site.json'); fs.writeFileSync(crossSiteFile, JSON.stringify({ pages: differentSites }));
  const crossSiteRows = run(crossSiteFile, path.join(folder, 'cross-site-output'), { p2Mode: 'shared', resamples: 10 }).rows;
  for (const row of crossSiteRows.filter(r => r.id === 'target' && r.policy.startsWith('P2'))) assert.equal(row.reason, 'induction-site-mismatch');
});
test('result writers reject existing directories and junction escapes', () => {
  const { createOutput } = require('./output.cjs');
  const folder = fs.mkdtempSync(path.join(ROOT, 'workspace/revision/results/synthetic-containment-'));
  const target = path.join(folder, 'new'); createOutput(target);
  assert.throws(() => createOutput(target), /directory-exists/);
  const link = path.join(folder, 'escape'); fs.symlinkSync(__dirname, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => createOutput(path.join(link, 'must-not-be-created')), /symlink-escapes/);
});
test('October receipt must bind request/candidate/attempt; failed receipts need no candidate', () => {
  const { loadFrozenCandidate, artifactName } = require('./replay-october.cjs');
  const folder = fs.mkdtempSync(path.join(ROOT, 'workspace/revision/results/synthetic-receipt-'));
  const save = (file, value) => { const text = JSON.stringify(value); fs.writeFileSync(path.join(folder, file), text); return crypto.createHash('sha256').update(text).digest('hex'); };
  const candidateFile = path.join(folder, 'candidate.json');
  const candidateSha256 = save('candidate.json', { rule: { main: 'main', name: 'fixture', exclude: [] }, requestId: 'request-1' });
  const receipt = { id: 'attempt-1', phase: 'outcome', success: true, resultSha256: candidateSha256, requestId: 'request-1' };
  const record = { attemptId: 'attempt-1', candidateFile, candidateSha256, outcomeFile: path.join(folder, 'outcome.json'), outcomeSha256: save('outcome.json', receipt) };
  assert.equal(loadFrozenCandidate(record).ok, true);
  assert.throws(() => loadFrozenCandidate({ ...record, candidateSha256: 'swapped' }), /candidate-binding/);
  assert.throws(() => loadFrozenCandidate({ ...record, attemptId: 'swapped' }), /attempt-binding/);
  const failed = { ...record, candidateFile: undefined, outcomeSha256: save('outcome.json', { ...receipt, success: false, status: 500 }) };
  assert.equal(loadFrozenCandidate(failed).ok, false);
  const missingIds = { ...record, attemptId: undefined, outcomeSha256: save('outcome.json', { ...receipt, id: undefined }) };
  assert.throws(() => loadFrozenCandidate(missingIds), /attempt-binding/);
  const missingRequest = { ...record, outcomeSha256: save('outcome.json', { ...receipt, requestId: undefined }) };
  assert.throws(() => loadFrozenCandidate(missingRequest), /request-binding/);
  assert.equal(path.basename(artifactName('../../outside', 'P2')), artifactName('../../outside', 'P2'));
  assert.equal(require('./output.cjs').failureCategory("'[' is not a valid selector"), 'invalid');
});
test('bounded policy subprocess returns structured output and explicit timeout failures', () => {
  const { executeBounded } = require('./bounded.cjs');
  const good = executeBounded('P0', { html: '<main><h1>Worker title</h1><p>Text body.</p></main>', url: 'https://example.org/' });
  assert.equal(good.ok, true, good.reason); assert.match(good.text, /Worker title/);
  assert.equal(typeof good.latencyMs, 'number');
  const timeout = executeBounded('P0', { html: '<main>Text</main>' }, undefined, { timeoutMs: 1 });
  assert.equal(timeout.ok, false); assert.equal(timeout.html, ''); assert.equal(timeout.latencyMs, null); assert.equal(timeout.reason, 'runtime-timeout:1ms');
});
test('malformed worker replies are counted runtime failures and selector keywords do not alter categories', () => {
  const { decodeReply } = require('./bounded.cjs');
  const { failureCategory } = require('./output.cjs');
  for (const reply of ['{broken', 'null', '{"html":"","text":""}', '{"ok":true,"reason":null,"latencyMs":0,"html":null,"text":"","fallback":false}']) {
    const r = decodeReply('P0', reply); assert.equal(r.ok, false); assert.equal(failureCategory(r.reason), 'runtime-error');
  }
  assert.equal(decodeReply('compile', '{"ok":true,"reason":null,"latencyMs":0}').ok, false);
  for (const word of ['budget', 'unsupported', 'role-preservation']) assert.equal(failureCategory(`'#${word}[' is not a valid selector`), 'invalid');
});
test('snapshot filename collisions fail exclusively without overwriting earlier reference bytes', () => {
  const folder = fs.mkdtempSync(path.join(ROOT, 'workspace/revision/results/synthetic-collision-'));
  fs.writeFileSync(path.join(folder, 'capture.html'), '<main><h1>Fixture title</h1></main>');
  const reference = { content: [{ role: 'title', required: true, text: 'Fixture title' }], noise: [] };
  fs.writeFileSync(path.join(folder, 'reference.json'), JSON.stringify(reference));
  const pages = ['\ud800', '\ufffd'].map(id => ({ id, site: 'example.org', url: 'https://example.org/', sourceFile: 'capture.html', referenceFile: 'reference.json' }));
  const file = path.join(folder, 'manifest.json'); fs.writeFileSync(file, JSON.stringify({ pages }));
  assert.throws(() => run(file, path.join(folder, 'output'), { resamples: 10 }), { code: 'EEXIST' });
  const first = JSON.parse(fs.readFileSync(path.join(folder, 'output/rows.jsonl'), 'utf8').split('\n')[0]);
  assert.deepEqual(fs.readFileSync(path.join(folder, 'output', first.referenceSnapshotFile)), fs.readFileSync(path.join(folder, 'reference.json')));
});
