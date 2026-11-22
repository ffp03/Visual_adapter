'use strict';
// Exact LCS, with an explicit resource bound rather than quadratic match objects.
const LIMITS = Object.freeze({ sparseMatches: 100000, denseCells: 200000000, workspaceBytes: 32 * 1024 * 1024 });
function counts(values) { const map = new Map(); for (const v of values) map.set(v, (map.get(v) || 0) + 1); return map; }
function greedy(a, b, first = null) {
  const positions = new Set(b), result = first ? [{ ...first }] : [];
  let j = first ? first.output + 1 : 0;
  for (let i = first ? first.unit + 1 : 0; i < a.length; i++) {
    if (!positions.has(a[i])) continue;
    while (j < b.length && b[j] !== a[i]) j++;
    if (j === b.length) break;
    result.push({ unit: i, output: j++ });
  }
  return result;
}
function upperBound(a, b, first = null) {
  const ac = counts(first ? a.slice(first.unit + 1) : a), bc = counts(first ? b.slice(first.output + 1) : b);
  let total = first ? 1 : 0;
  for (const [token, count] of ac) total += Math.min(count, bc.get(token) || 0);
  return total;
}
function matchableCount(a, b, first = null) {
  const values = new Set(first ? b.slice(first.output + 1) : b);
  let total = first ? 1 : 0;
  for (let i = first ? first.unit + 1 : 0; i < a.length; i++) if (values.has(a[i])) total++;
  return total;
}
function sparse(a, b, positions) {
  const tree = new Uint32Array(b.length + 1), pairs = [];
  const query = k => { let best = 0; for (; k > 0; k -= k & -k) best = Math.max(best, tree[k]); return best; };
  const update = (k, v) => { for (; k < tree.length; k += k & -k) tree[k] = Math.max(tree[k], v); };
  let longest = 0;
  for (let i = a.length - 1; i >= 0; i--) {
    const batch = (positions.get(a[i]) || []).map(j => ({ unit: i, output: j, length: 1 + query(b.length - j - 1) }));
    for (const p of batch) { update(b.length - p.output, p.length); longest = Math.max(longest, p.length); pairs.push(p); }
  }
  pairs.sort((x, y) => x.output - y.output || x.unit - y.unit);
  function trace(first = null) {
    const result = first ? [{ unit: first.unit, output: first.output }] : [];
    let remaining = first ? first.length - 1 : longest, i = first?.unit ?? -1, j = first?.output ?? -1;
    if (!remaining) return result;
    for (const p of pairs) if (p.unit > i && p.output > j && p.length >= remaining) {
      result.push({ unit: p.unit, output: p.output }); i = p.unit; j = p.output;
      if (--remaining === 0) break;
    }
    return result;
  }
  return { longest, trace, firstQualifying: required => pairs.find(p => p.length >= required) || null };
}
function dense(a, b) {
  const m = a.length, n = b.length, block = Math.max(1, Math.ceil(Math.sqrt(m)));
  const workspaceCells = (Math.ceil(m / block) + block + 6) * (n + 1) + n;
  if ((m + 1) * (n + 1) > LIMITS.denseCells || workspaceCells * 4 > LIMITS.workspaceBytes) throw Error('lcs-resource-limit');
  const checkpoints = new Map(), firstIndex = new Map();
  a.forEach((v, i) => { if (!firstIndex.has(v)) firstIndex.set(v, i); });
  const starts = new Uint32Array(n);
  let next = new Uint32Array(n + 1), current = new Uint32Array(n + 1);
  checkpoints.set(m, next.slice());
  function fill(i, row, following, recordStarts = false) {
    row[n] = 0;
    for (let j = n - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? following[j + 1] + 1 : Math.max(following[j], row[j + 1]);
      if (recordStarts && a[i] === b[j] && firstIndex.get(b[j]) === i) starts[j] = following[j + 1] + 1;
    }
  }
  for (let i = m - 1; i >= 0; i--) {
    fill(i, current, next, true);
    [next, current] = [current, next];
    if (i % block === 0) checkpoints.set(i, next.slice());
  }
  const longest = next[0];
  // Reuse ONE fixed block workspace during reconstruction. No discarded blocks
  // accumulate external ArrayBuffer memory while tracing a long alignment.
  const rows = Array.from({ length: block + 1 }, () => new Uint32Array(n + 1));
  let cached = -1;
  function get(i, j) {
    if (i === m || j === n) return 0;
    const start = Math.floor(i / block) * block;
    if (cached !== start) {
      const end = Math.min(start + block, m), count = end - start;
      rows[count].set(checkpoints.get(end));
      for (let k = count - 1; k >= 0; k--) fill(start + k, rows[k], rows[k + 1]);
      cached = start;
    }
    return rows[i - start][j];
  }
  function trace(first = null) {
    const result = first ? [{ unit: first.unit, output: first.output }] : [];
    let i = first ? first.unit + 1 : 0, j = first ? first.output + 1 : 0, left = first ? first.length - 1 : longest;
    while (left && i < m && j < n) {
      if (a[i] === b[j] && get(i + 1, j + 1) === left - 1) { result.push({ unit: i++, output: j++ }); left--; }
      else if (get(i + 1, j) === left) i++;
      else j++;
    }
    // The output sequence is earliest; greedily embed those token values in the
    // reference to break any remaining reference-index tie identically to sparse.
    let u = 0;
    for (const p of result) { while (a[u] !== b[p.output]) u++; p.unit = u++; }
    return result;
  }
  return { longest, trace, firstQualifying: required => {
    for (let j = 0; j < n; j++) if (starts[j] >= required) return { unit: firstIndex.get(b[j]), output: j, length: starts[j] };
    return null;
  } };
}
function oracle(a, b, options = {}) {
  const positions = new Map();
  b.forEach((v, j) => { if (!positions.has(v)) positions.set(v, []); positions.get(v).push(j); });
  let matches = 0;
  for (const [v, count] of counts(a)) { matches += count * (positions.get(v)?.length || 0); if (matches > LIMITS.sparseMatches) break; }
  return options.backend === 'dense' || matches > LIMITS.sparseMatches ? dense(a, b) : sparse(a, b, positions);
}
function lcsAlignment(a, b, options = {}) {
  if (!a.length || !b.length) return [];
  if (options.backend !== 'dense') {
    const fast = greedy(a, b);
    // Length reaching a frequency upper bound alone does not prove the earliest
    // alignment (00010 / 00101 is a counterexample). Matching every reference
    // token whose value occurs in the output does prove that tie-breaker.
    if (fast.length === matchableCount(a, b)) return fast;
  }
  return oracle(a, b, options).trace();
}
function qualifyingAlignment(a, b, required, options = {}) {
  if (!Number.isInteger(required) || required < 1) throw Error('invalid-lcs-required-length');
  if (!a.length || !b.length || required > Math.min(a.length, b.length) || upperBound(a, b) < required) return [];
  if (options.backend !== 'dense') {
    const firstIndex = new Map(); a.forEach((v, i) => { if (!firstIndex.has(v)) firstIndex.set(v, i); });
    const j = b.findIndex(v => firstIndex.has(v) && a.length - firstIndex.get(v) >= required);
    if (j >= 0) {
      const first = { unit: firstIndex.get(b[j]), output: j }, fast = greedy(a, b, first);
      if (fast.length >= required && fast.length === matchableCount(a, b, first)) return fast;
    }
  }
  const index = oracle(a, b, options), first = index.firstQualifying(required);
  return first ? index.trace(first) : [];
}
module.exports = { lcsAlignment, qualifyingAlignment, LIMITS };
