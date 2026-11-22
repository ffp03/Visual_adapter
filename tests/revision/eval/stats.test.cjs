'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { clustered, summarize, pairedDifference, MEASURES } = require('./stats.cjs');
test('seeded 10,000-resample site bootstrap is deterministic and page-weighted', () => {
  const values = [{ site: 'a', value: 0 }, { site: 'a', value: 0 }, { site: 'b', value: 1 }];
  const a = clustered(values), b = clustered([...values].reverse());
  assert.deepEqual(a, b); assert.equal(a.estimate, 1 / 3); assert.equal(a.low, 0); assert.equal(a.high, 1);
  assert.deepEqual(clustered([{ site: 'a', value: 0.7 }]), { estimate: 0.7, low: 0.7, high: 0.7, pages: 1, sites: 1 });
  assert.notDeepEqual(clustered(values, { seed: 1, resamples: 9 }), clustered(values, { seed: 2, resamples: 9 }));
});
test('paired differences preserve sites, include failures, and reverse noise win direction', () => {
  const make = (id, policy, v, ok = true) => ({ id, site: id[0], policy, ok, reason: ok ? null : 'invalid-selector', scores: Object.fromEntries(MEASURES.map(m => [m, v])) });
  const rows = [make('a1', 'A', 1), make('a1', 'B', 0, false), make('b1', 'A', 0), make('b1', 'B', 1)];
  const difference = pairedDifference(rows, 'A', 'B');
  assert.equal(difference.measures.cleanPass.estimate, 0); assert.equal(difference.measures.cleanPass.wins, 1); assert.equal(difference.measures.cleanPass.losses, 1);
  assert.equal(difference.measures.noiseLeakage.wins, 1);
  assert.equal(summarize(rows).policies.B.failuresByReason['invalid-selector'], 1);
  assert.throws(() => pairedDifference(rows.slice(1), 'A', 'B'), /unpaired/);
  assert.throws(() => pairedDifference([...rows, rows[0]], 'A', 'B'), /duplicate/);
});
test('pairing rejects mismatched capture/reference/threshold bindings', () => {
  const make = policy => ({ id: 'a', site: 's', policy, sourceSha256: 'source', referenceSha256: 'reference', scores: { ...Object.fromEntries(MEASURES.map(m => [m, 1])), thresholds: { presenceThreshold: 0.9 } } });
  for (const key of ['sourceSha256', 'referenceSha256']) {
    const other = { ...make('B'), [key]: 'changed' };
    assert.throws(() => pairedDifference([make('A'), other], 'A', 'B'), /binding-mismatch/);
  }
  const other = make('B'); other.scores.thresholds.presenceThreshold = 0.8;
  assert.throws(() => pairedDifference([make('A'), other], 'A', 'B'), /binding-mismatch:thresholds/);
  assert.throws(() => pairedDifference([make('A'), { ...make('B'), scoringVersion: 'different' }], 'A', 'B'), /binding-mismatch:scoringVersion/);
});
test('clean failure attribution retains overlapping causes and disjoint combinations', () => {
  const { failureBreakdown } = require('./stats.cjs');
  const good = { contentRecall: 1, titlePresent: true, titleFirst: true, orderTau: 1, noiseLeakage: 0, cleanPass: true };
  const r = failureBreakdown([good, { ...good, cleanPass: false, contentRecall: 0.8, titlePresent: false }, { ...good, cleanPass: false, orderTau: 0, noiseLeakage: 0.5 }, { ...good, titleFirst: false }]);
  assert.equal(r.cleanFailures, 2); assert.equal(r.recall, 1); assert.equal(r.orderOrTitle, 2); assert.equal(r.noise, 1);
  assert.deepEqual(r.combinations, { 'recall+title': 1, 'order+noise': 1 }); assert.equal(r.titleFirstDiagnostic, 1);
});
