'use strict';
const fs = require('node:fs');
const MEASURES = ['contentRecall', 'contentCharacterRecall', 'noiseLeakage', 'noiseCharacterShare', 'titlePresent', 'titleFirst', 'orderTau', 'completePass', 'cleanPass', 'noFallbackPass'];
function failureBreakdown(rows) {
  const counts = { pages: rows.length, clean: 0, cleanFailures: 0, recall: 0, title: 0, order: 0, orderOrTitle: 0, noise: 0, titleFirstDiagnostic: 0, combinations: {} };
  for (const row of rows) {
    const s = row.scores || row, t = s.thresholds || {};
    if (!s.titleFirst) counts.titleFirstDiagnostic++;
    if (s.cleanPass) { counts.clean++; continue; }
    counts.cleanFailures++;
    const recall = s.contentRecall < (t.completeThreshold ?? 0.95), title = !s.titlePresent, order = s.orderTau < (t.orderThreshold ?? 0.9), noise = s.noiseLeakage > (t.noiseThreshold ?? 0.2);
    if (recall) counts.recall++; if (title) counts.title++; if (order) counts.order++; if (noise) counts.noise++; if (order || title) counts.orderOrTitle++;
    const key = [recall && 'recall', title && 'title', order && 'order', noise && 'noise'].filter(Boolean).join('+') || 'other';
    counts.combinations[key] = (counts.combinations[key] || 0) + 1;
  }
  return counts;
}
function seededRandom(seed = 20261120) {
  let state = Number(seed) >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function quantile(sorted, p) { const index = (sorted.length - 1) * p, lo = Math.floor(index); return sorted[lo] + (sorted[Math.ceil(index)] - sorted[lo]) * (index - lo); }
function value(row, measure) { const v = (row.scores || row)[measure]; if (typeof v !== 'boolean' && (typeof v !== 'number' || !Number.isFinite(v))) throw Error('missing-measure:' + measure); return Number(v); }
function clustered(values, { resamples = 10000, seed = 20261120 } = {}) {
  if (!values.length) throw Error('no-observations');
  if (!Number.isInteger(resamples) || resamples < 1) throw Error('invalid-resamples');
  const sites = new Map();
  for (const { site, value } of values) { if (!site) throw Error('missing-site'); if (!sites.has(site)) sites.set(site, []); sites.get(site).push(value); }
  const clusters = [...sites].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([, a]) => ({ sum: a.reduce((s, v) => s + v, 0), count: a.length }));
  const random = seededRandom(seed), samples = [];
  for (let r = 0; r < resamples; r++) {
    let sum = 0, count = 0;
    for (let i = 0; i < clusters.length; i++) { const c = clusters[Math.floor(random() * clusters.length)]; sum += c.sum; count += c.count; }
    samples.push(sum / count);
  }
  samples.sort((a, b) => a - b);
  return { estimate: values.reduce((s, v) => s + v.value, 0) / values.length, low: quantile(samples, 0.025), high: quantile(samples, 0.975), pages: values.length, sites: sites.size };
}
function summarize(rows, options = {}) {
  const policies = {};
  for (const policy of [...new Set(rows.map(r => r.policy))].sort()) {
    const selected = rows.filter(r => r.policy === policy), failuresByReason = {}, failuresByCategory = {};
    for (const row of selected.filter(r => r.ok === false)) {
      failuresByReason[row.reason || 'unknown'] = (failuresByReason[row.reason || 'unknown'] || 0) + 1;
      const category = row.failureCategory || require('./output.cjs').failureCategory(row.reason) || 'runtime-error';
      failuresByCategory[category] = (failuresByCategory[category] || 0) + 1;
    }
    policies[policy] = { pages: selected.length, failures: selected.filter(r => r.ok === false).length, failuresByReason, failuresByCategory, fallbacks: selected.filter(r => r.fallback).length, cleanFailureBreakdown: failureBreakdown(selected),
      accounting: Object.fromEntries(['modelRequests', 'promptTokens', 'completionTokens', 'cachedTokens', 'costEstimate', 'latencyMs'].map(k => [k, selected.reduce((s, r) => s + (r[k] || 0), 0)])),
      measures: Object.fromEntries(MEASURES.map(m => [m, clustered(selected.map(r => ({ site: r.site, value: value(r, m) })), options)])) };
  }
  return { resamples: options.resamples ?? 10000, seed: options.seed ?? 20261120, policies };
}
function pairedDifference(rows, policyA, policyB, options = {}) {
  const byPolicy = policy => {
    const map = new Map();
    for (const row of rows.filter(r => r.policy === policy)) { if (map.has(row.id)) throw Error('duplicate-page-policy:' + row.id); map.set(row.id, row); }
    return map;
  };
  const a = byPolicy(policyA), b = byPolicy(policyB);
  if (!a.size || a.size !== b.size || [...a.keys()].some(id => !b.has(id))) throw Error('unpaired-policy-pages');
  const pairs = [...a].map(([id, row]) => {
    const other = b.get(id);
    if (row.site !== other.site) throw Error('paired-site-mismatch');
    for (const key of ['sourceSha256', 'referenceSha256']) if (row[key] !== other[key]) throw Error('paired-binding-mismatch:' + key);
    if ((row.scoringVersion || row.scores?.scoringVersion) !== (other.scoringVersion || other.scores?.scoringVersion)) throw Error('paired-binding-mismatch:scoringVersion');
    const canonical = v => v && JSON.stringify(Object.keys(v).sort().map(k => [k, v[k]]));
    if (canonical(row.scores?.thresholds) !== canonical(other.scores?.thresholds)) throw Error('paired-binding-mismatch:thresholds');
    return [row, other];
  });
  return { policyA, policyB, direction: 'A minus B; wins respect metric direction', measures: Object.fromEntries(MEASURES.map(m => {
    const diffs = pairs.map(([x, y]) => ({ site: x.site, value: value(x, m) - value(y, m) }));
    const direction = m.startsWith('noise') ? -1 : 1;
    return [m, { ...clustered(diffs, options), wins: diffs.filter(d => d.value * direction > 1e-12).length, losses: diffs.filter(d => d.value * direction < -1e-12).length, ties: diffs.filter(d => Math.abs(d.value) <= 1e-12).length }];
  })) };
}
module.exports = { MEASURES, seededRandom, quantile, clustered, summarize, pairedDifference, failureBreakdown };
if (require.main === module) {
  const [file, a, b] = process.argv.slice(2);
  if (!file) throw Error('Usage: node stats.cjs ROWS.jsonl [POLICY_A POLICY_B]');
  const rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  console.log(JSON.stringify(a && b ? pairedDifference(rows, a, b) : summarize(rows), null, 2));
}
