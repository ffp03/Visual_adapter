'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { score, SCORING_VERSION } = require('./score.cjs');
const { loadValidPages, sha256 } = require('./references.cjs');
const { summarize, pairedDifference, MEASURES } = require('./stats.cjs');
const { report } = require('./report.cjs');
const { createOutput, failureCategory } = require('./output.cjs');
function inside(root, file) { const rel = path.relative(root, file); return rel !== '' && !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep); }
function metadata(row) {
  const errors = [];
  if (typeof row.ok !== 'boolean') errors.push('ok-must-be-boolean');
  if (typeof row.fallback !== 'boolean') errors.push('fallback-must-be-boolean');
  if (row.tokens !== undefined) {
    if (!row.tokens || typeof row.tokens !== 'object' || Array.isArray(row.tokens)) errors.push('invalid-tokens-object');
    else if (Object.keys(row.tokens).some(k => !['prompt', 'completion', 'cached'].includes(k))) errors.push('unknown-token-field');
  }
  if (row.reason !== undefined && row.reason !== null && typeof row.reason !== 'string') errors.push('reason-must-be-string-or-null');
  if (row.ok === false && (typeof row.reason !== 'string' || !row.reason.trim())) errors.push('failed-row-needs-reason');
  const values = {};
  for (const [key, value] of Object.entries({ modelRequests: row.modelRequests, promptTokens: row.promptTokens ?? row.tokens?.prompt ?? 0, completionTokens: row.completionTokens ?? row.tokens?.completion ?? 0, cachedTokens: row.cachedTokens ?? row.tokens?.cached ?? 0 })) {
    if (!Number.isSafeInteger(value) || value < 0) { errors.push('invalid-' + key); values[key] = 0; } else values[key] = value;
  }
  const costEstimate = row.costEstimate ?? 0, latencyMs = row.latencyMs ?? null;
  if (typeof costEstimate !== 'number' || !Number.isFinite(costEstimate) || costEstimate < 0) errors.push('invalid-costEstimate');
  if (latencyMs !== null && (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs) || latencyMs < 0)) errors.push('invalid-latencyMs');
  return { errors, values: { ...values, costEstimate: errors.includes('invalid-costEstimate') ? 0 : costEstimate, latencyMs: errors.includes('invalid-latencyMs') ? null : latencyMs } };
}
function readFolders(folders, knownIds) {
  const byKey = new Map(), policies = new Set(), inputs = [], outsideManifestRows = [];
  for (const directory of folders) {
    const folder = fs.realpathSync(path.resolve(directory)), file = path.join(folder, 'rows.jsonl'), bytes = fs.readFileSync(file);
    inputs.push({ folder, rowsFile: file, rowsSha256: sha256(bytes), bytes });
    const lines = bytes.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      let row; try { row = JSON.parse(line); } catch { throw Error('invalid-rows-json:' + file + ':' + (index + 1)); }
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('invalid-row-object:' + file + ':' + (index + 1));
      const id = row.id || row.pageId, policy = row.policy;
      if (typeof id !== 'string' || !id || typeof policy !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(policy)) throw Error('invalid-row-identity:' + file + ':' + (index + 1));
      policies.add(policy);
      if (!knownIds.has(id)) { outsideManifestRows.push({ id, policy, inputFolder: folder, inputRow: index + 1 }); return; }
      const key = JSON.stringify([id, policy]);
      if (byKey.has(key)) throw Error('duplicate-page-policy:' + id + ':' + policy);
      byKey.set(key, { row, folder, inputRow: index + 1 });
    });
  }
  if (!policies.size) throw Error('no-policy-rows');
  return { byKey, policies: [...policies].sort(), inputs, outsideManifestRows };
}
function comparisonsReport(comparisons, unavailable) {
  const lines = [];
  if (comparisons.length) {
    lines.push('', 'Paired differences are policy minus baseline; lower noise is better. Wins/losses respect each metric direction.', '', '| Policy | Baseline | Measure | Difference [95% CI] | Wins | Losses | Ties | Pages | Sites |', '|---|---|---|---|---:|---:|---:|---:|---:|');
    for (const c of comparisons) for (const m of MEASURES) { const v = c.measures[m]; lines.push(`| ${c.policyA} | ${c.policyB} | ${m} | ${v.estimate.toFixed(3)} [${v.low.toFixed(3)}, ${v.high.toFixed(3)}] | ${v.wins} | ${v.losses} | ${v.ties} | ${v.pages} | ${v.sites} |`); }
  }
  for (const c of unavailable) lines.push('', `${c.policyA} versus ${c.policyB}: unavailable (${c.reason}).`);
  return lines.join('\n');
}
function exclusionsReport(skipped, outside) {
  const lines = [];
  if (skipped.length) {
    lines.push('', 'Invalid references are excluded identically from every policy.', '', '| Skipped page | Reasons |', '|---|---|');
    for (const page of skipped) lines.push(`| ${page.id.replace(/\|/g, '\\|')} | ${[...new Set(page.errors.map(e => e.reason))].join(', ')} |`);
  }
  if (outside.length) lines.push('', `${outside.length} input rows are outside the manifest cohort and excluded from cohort accounting; their identities are retained in summary.json.`);
  return lines.join('\n');
}
function run(manifestFile, folders, options = {}) {
  if (!Array.isArray(folders) || !folders.length) throw Error('at-least-one-output-folder-required');
  const input = loadValidPages(manifestFile), knownIds = new Set(input.valid.map(x => x.page.id));
  // Rows on invalid-reference pages are deliberately omitted from every policy
  // and listed with the skipped references, rather than becoming policy failures.
  const allIds = new Set([...knownIds, ...input.skipped.map(p => p.id)]);
  const sources = readFolders(folders, allIds), rows = [];
  const out = options.outputDirectory ? createOutput(options.outputDirectory) : null;
  if (out) {
    fs.writeFileSync(path.join(out, 'manifest.snapshot.json'), input.manifestBytes, { flag: 'wx' });
    fs.writeFileSync(path.join(out, 'rows.jsonl'), '', { flag: 'wx' });
    sources.inputs.forEach((entry, index) => fs.writeFileSync(path.join(out, `input-rows-${index}.jsonl`), entry.bytes, { flag: 'wx' }));
  }
  for (const item of input.valid) {
    const { page, reference, referenceBytes } = item;
    const referenceSnapshotFile = sha256(JSON.stringify(page.id)) + '-reference.json';
    if (out) fs.writeFileSync(path.join(out, referenceSnapshotFile), referenceBytes, { flag: 'wx' });
    for (const policy of sources.policies) {
      const entry = sources.byKey.get(JSON.stringify([page.id, policy]));
      const original = entry?.row || {}, parsed = metadata(original);
      let html = '', ok = original.ok === true, reason = original.reason || null, outputError = null, inputOutputFile = null;
      if (!entry) { ok = false; reason = 'missing-policy-row'; }
      else if (parsed.errors.length) { ok = false; reason = 'invalid-policy-metadata:' + parsed.errors.join(','); }
      const fallback = original.fallback === true;
      try {
        if (entry && original.sourceSha256 && original.sourceSha256 !== page.sourceSha256) throw Error('source-sha256-mismatch');
        if (entry && (ok || fallback)) {
          const relative = original.outputFile ?? `${page.id}-${policy}.html`;
          if (typeof relative !== 'string' || path.isAbsolute(relative)) throw Error('invalid-output-path');
          const candidate = path.resolve(entry.folder, relative);
          if (!inside(entry.folder, candidate)) throw Error('invalid-output-path');
          inputOutputFile = fs.realpathSync(candidate);
          if (!inside(entry.folder, inputOutputFile)) throw Error('output-symlink-escapes-folder');
          const bytes = fs.readFileSync(inputOutputFile);
          if (original.outputSha256 && sha256(bytes) !== original.outputSha256) throw Error('output-sha256-mismatch');
          html = bytes.toString('utf8');
        }
      } catch (error) { ok = false; outputError = error.code === 'ENOENT' ? 'missing-policy-output' : error.message; reason = outputError; html = ''; }
      const delivered = !!entry && (ok || fallback) && !outputError && !parsed.errors.length;
      const scores = score(delivered ? html : '', reference, { ...options.thresholds, format: 'html', ok, fallback });
      const outputFile = sha256(JSON.stringify([page.id, policy])) + '.html';
      if (out) fs.writeFileSync(path.join(out, outputFile), html, { flag: 'wx' });
      const row = { id: page.id, site: page.site, policy, audited: reference.audited === true || reference.audit?.status === 'audited', ok, reason: ok ? reason : reason || 'policy-failed', failureCategory: ok ? null : failureCategory(reason), fallback,
        ...parsed.values, scores, scoringVersion: SCORING_VERSION, sourceFile: page.sourceFile, sourceSha256: page.sourceSha256, referenceFile: page.referenceFile, referenceSha256: page.referenceSha256,
        referenceSnapshotFile: out ? referenceSnapshotFile : null, outputFile: out ? outputFile : null, outputSha256: sha256(html), inputFolder: entry?.folder || null, inputRow: entry?.inputRow || null, inputOutputFile,
        inputSourceSha256: original.sourceSha256 || null, inputReferenceSha256: original.referenceSha256 || null, inputScoringVersion: original.scoringVersion || original.scores?.scoringVersion || null, metadataErrors: entry ? parsed.errors : [], outputError };
      rows.push(row);
      if (out) fs.appendFileSync(path.join(out, 'rows.jsonl'), JSON.stringify(row) + '\n');
    }
  }
  const summary = rows.length ? summarize(rows, options) : { policies: {}, resamples: options.resamples ?? 10000, seed: options.seed ?? 20261120 };
  summary.scoringVersion = SCORING_VERSION; summary.manifestFile = input.manifestFile; summary.manifestSha256 = input.manifestSha256; summary.totalManifestPages = input.totalPages;
  summary.validPages = input.valid.map(x => x.page.id); summary.skipped = input.skipped; summary.outsideManifestRows = sources.outsideManifestRows;
  summary.declaredPolicies = sources.policies;
  summary.inputFolders = sources.inputs.map(({ bytes, ...entry }) => entry);
  summary.accountingIncomplete = rows.some(r => r.metadataErrors.length);
  summary.bySite = Object.fromEntries([...new Set(rows.map(r => r.site))].sort().map(site => [site, summarize(rows.filter(r => r.site === site), options)]));
  summary.comparisons = []; summary.unavailableComparisons = [];
  for (const policy of sources.policies.filter(p => !['P0', 'P1'].includes(p))) for (const baseline of ['P0', 'P1']) {
    if (!summary.policies[policy] || !summary.policies[baseline]) { summary.unavailableComparisons.push({ policyA: policy, policyB: baseline, reason: !rows.length ? 'no-valid-references' : 'baseline-folder-not-supplied' }); continue; }
    summary.comparisons.push(pairedDifference(rows.filter(r => [policy, baseline].includes(r.policy)), policy, baseline, options));
  }
  const auditedRows = rows.filter(row => row.audited);
  summary.audited = auditedRows.length ? summarize(auditedRows, options) : null;
  if (summary.audited) {
    const audited = summary.audited;
    audited.validPages = [...new Set(auditedRows.map(r => r.id))];
    audited.bySite = Object.fromEntries([...new Set(auditedRows.map(r => r.site))].sort().map(site => [site, summarize(auditedRows.filter(r => r.site === site), options)]));
    audited.comparisons = []; audited.unavailableComparisons = [];
    for (const policy of sources.policies.filter(p => !['P0', 'P1'].includes(p))) for (const baseline of ['P0', 'P1']) {
      if (!audited.policies[policy] || !audited.policies[baseline]) { audited.unavailableComparisons.push({ policyA: policy, policyB: baseline, reason: 'baseline-folder-not-supplied' }); continue; }
      audited.comparisons.push(pairedDifference(auditedRows.filter(r => [policy, baseline].includes(r.policy)), policy, baseline, options));
    }
  }
  const markdown = (rows.length ? report(summary) : 'No valid reference pages. No quality estimates or confidence intervals were computed.') + comparisonsReport(summary.comparisons, summary.unavailableComparisons)
    + (summary.audited ? '\n\nAudited-reference paired differences' + comparisonsReport(summary.audited.comparisons, summary.audited.unavailableComparisons) : '') + exclusionsReport(input.skipped, sources.outsideManifestRows);
  if (out) { fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2), { flag: 'wx' }); fs.writeFileSync(path.join(out, 'report.md'), markdown + '\n', { flag: 'wx' }); }
  return { rows, summary, markdown };
}
module.exports = { run, metadata, readFolders, comparisonsReport, exclusionsReport };
if (require.main === module) {
  const args = process.argv.slice(2), manifest = args.shift(), folders = [], options = {};
  for (const arg of args) {
    if (arg.startsWith('--out=')) options.outputDirectory = arg.slice(6);
    else if (arg.startsWith('--resamples=')) options.resamples = Number(arg.slice(12));
    else if (arg.startsWith('--seed=')) options.seed = Number(arg.slice(7));
    else if (arg.startsWith('--')) throw Error('unknown-option:' + arg);
    else folders.push(arg);
  }
  if (!manifest || !folders.length) throw Error('Usage: node scoreboard.cjs MANIFEST OUTPUT_FOLDER [OUTPUT_FOLDER...] [--out=NEW_RESULTS_FOLDER] [--seed=N] [--resamples=10000]');
  console.log(run(manifest, folders, options).markdown);
}
