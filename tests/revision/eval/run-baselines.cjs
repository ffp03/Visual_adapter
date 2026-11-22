'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { score, DEFAULTS, SCORING_VERSION } = require('./score.cjs');
const { summarize, pairedDifference } = require('./stats.cjs');
const { report } = require('./report.cjs');
const p2 = require('./policies/p2-replay.cjs');
const { ROOT, createOutput, failureCategory } = require('./output.cjs');
const { executeBounded } = require('./bounded.cjs');
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const siteFor = page => page.site || page.host || new URL(page.finalUrl || page.url).hostname;
function resolveFile(file, manifestFile) {
  if (typeof file !== 'string' || !file) throw Error('missing-manifest-path');
  if (path.isAbsolute(file)) return file;
  // Repository-relative paths are the existing October convention; new corpus
  // manifests may also use manifest-relative paths.
  const fromRoot = path.resolve(ROOT, file), fromManifest = path.resolve(path.dirname(manifestFile), file);
  return fs.existsSync(fromRoot) ? fromRoot : fromManifest;
}
function pageFiles(page, manifestFile) {
  const folder = page.directory || page.dir || page.path || (page.id && page.siteId ? 'dev/' + page.siteId + '/' + page.id : page.id && 'dev/' + page.id);
  return {
    source: resolveFile(page.sourceFile || page.htmlPath || page.capturePath || (folder && path.join(folder, 'rendered-dom.html')), manifestFile),
    reference: resolveFile(page.referenceFile || page.referencePath || (folder && path.join(folder, 'reference.json')), manifestFile)
  };
}
function normalizeManifest(manifest) {
  const pages = Array.isArray(manifest) ? manifest : manifest.pages || manifest.sites?.flatMap(site => site.pages.map(page => ({ site: site.host || site.siteId, host: site.host, siteId: site.siteId, ...page })));
  if (!Array.isArray(pages) || !pages.length) throw Error('empty-manifest');
  return pages.map(page => ({ ...page, id: page.id || page.pageId }));
}
function loadCandidate(page, manifestFile) {
  const file = page.candidateFile || page.candidatePath;
  const saved = { candidate: page.candidate, file: file ? resolveFile(file, manifestFile) : null, expectedSha256: page.candidateSha256 || null, observedSha256: null, error: null };
  if (file) {
    try {
      const bytes = fs.readFileSync(saved.file); saved.observedSha256 = sha256(bytes);
      if (saved.expectedSha256 && saved.expectedSha256 !== saved.observedSha256) throw Error('candidate-sha256-mismatch');
      const envelope = JSON.parse(bytes); saved.candidate = envelope.rule === undefined ? envelope : envelope.rule;
    } catch (error) { saved.error = error; }
  }
  saved.available = page.candidate !== undefined || !!file;
  saved.ruleSha256 = saved.candidate === undefined ? null : sha256(JSON.stringify(saved.candidate));
  return saved;
}
function run(manifestFile, outputDirectory, options = {}) {
  manifestFile = path.resolve(manifestFile); outputDirectory = path.resolve(outputDirectory);
  const manifestBytes = fs.readFileSync(manifestFile), manifest = JSON.parse(manifestBytes);
  const pages = normalizeManifest(manifest);
  const ids = pages.map(p => p.id);
  if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !id)) throw Error('invalid-or-duplicate-page-id');
  if (new Set(pages.map(p => p.p2Mode || options.p2Mode || 'fresh')).size !== 1) throw Error('mixed-p2-modes-require-separate-runs');
  createOutput(outputDirectory);
  fs.writeFileSync(path.join(outputDirectory, 'manifest.snapshot.json'), manifestBytes);
  const rows = [], skipped = [], thresholds = { ...DEFAULTS, ...options.thresholds }, sharedCompilations = new Map();
  for (const page of pages) {
    const files = pageFiles(page, manifestFile);
    if (!fs.existsSync(files.reference)) { skipped.push({ id: page.id, reason: 'reference-not-yet-available', reference: files.reference }); continue; }
    const referenceBytes = fs.readFileSync(files.reference), reference = JSON.parse(referenceBytes);
    if (page.referenceSha256 && sha256(referenceBytes) !== page.referenceSha256) throw Error('reference-sha256-mismatch:' + page.id);
    const referenceSnapshotFile = sha256(page.id).slice(0, 16) + '-reference.json';
    fs.writeFileSync(path.join(outputDirectory, referenceSnapshotFile), referenceBytes, { flag: 'wx' });
    const base = { id: page.id, site: siteFor(page), audited: reference.audited === true || reference.audit?.status === 'audited', sourceFile: files.source, referenceFile: files.reference, referenceSnapshotFile, referenceSha256: sha256(referenceBytes) };
    let html, sourceError, sourceSha256 = null;
    try { const bytes = fs.readFileSync(files.source); sourceSha256 = sha256(bytes); html = bytes.toString('utf8'); if ((page.sha256 || page.sourceSha256) && sourceSha256 !== (page.sourceSha256 || page.sha256)) throw Error('source-sha256-mismatch'); }
    catch (error) { sourceError = error; }
    const mode = page.p2Mode || options.p2Mode || 'fresh';
    if (!['fresh', 'shared'].includes(mode)) throw Error('invalid-p2-mode');
    let seedPage = page, shared;
    if (mode === 'shared') seedPage = pages.find(p => p.id === (page.seedId || page.inductionPageId)) || null;
    const saved = loadCandidate(mode === 'shared' && seedPage ? seedPage : page, manifestFile);
    const candidate = saved.candidate, available = saved.available || mode === 'shared' && (page.seedId || page.inductionPageId);
    let candidateError = saved.error;
    if (mode === 'shared' && available) {
      if (!seedPage) candidateError = Error('induction-page-not-in-manifest');
      else if (siteFor(seedPage) !== siteFor(page)) candidateError = Error('induction-site-mismatch');
      else {
        const cacheKey = seedPage.id + ':' + saved.ruleSha256 + ':' + saved.observedSha256;
        if (!sharedCompilations.has(cacheKey)) {
          let compilation;
          try {
            if (candidateError) throw candidateError;
            const seedFiles = pageFiles(seedPage, manifestFile), seedBytes = fs.readFileSync(seedFiles.source), seedHash = sha256(seedBytes);
            if ((seedPage.sourceSha256 || seedPage.sha256) && seedHash !== (seedPage.sourceSha256 || seedPage.sha256)) throw Error('induction-source-sha256-mismatch');
            compilation = { ...executeBounded('compile', { html: seedBytes.toString('utf8'), url: seedPage.finalUrl || seedPage.url }, candidate, { timeoutMs: options.timeoutMs }), sourceSha256: seedHash };
          } catch (error) { compilation = { ok: false, reason: error.message, procedure: null }; }
          sharedCompilations.set(cacheKey, compilation);
        }
        shared = sharedCompilations.get(cacheKey);
      }
    }
    const policies = ['P0', 'P1', ...(available ? ['P2', 'P2-nr'] : [])];
    for (const policy of policies) {
      const start = performance.now(); let output;
      if (sourceError || (policy.startsWith('P2') && candidateError)) output = { html: '', text: '', ok: false, reason: (sourceError || candidateError).message, fallback: false };
      else if (policy === 'P2' && shared && !shared.ok) output = { html: '', ok: false, reason: shared.reason, fallback: false };
      else output = executeBounded(policy, { html, url: page.finalUrl || page.url }, candidate, { procedure: shared?.procedure, timeoutMs: options.timeoutMs });
      const latencyMs = output.latencyMs ?? (output.reason?.startsWith('runtime-timeout') ? null : performance.now() - start);
      const scores = score(output.ok ? output.html : '', reference, { ...thresholds, format: 'html', ok: output.ok, fallback: output.fallback });
      const stem = sha256(page.id).slice(0, 16) + '-' + policy;
      fs.writeFileSync(path.join(outputDirectory, stem + '.html'), output.html, { flag: 'wx' });
      const row = { ...base, policy, scoringVersion: SCORING_VERSION, ok: output.ok, reason: output.reason, failureCategory: output.ok ? null : failureCategory(output.reason), fallback: !!output.fallback, modelRequests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, costEstimate: 0,
        latencyMs, timeoutMs: output.timeoutMs || options.timeoutMs || (policy === 'P0' ? 120000 : 60000), diagnostics: output.diagnostics || null, cssCompatibilitySkipped: output.cssCompatibilitySkipped || 0, sourceSha256, candidateFile: saved.file, candidateExpectedSha256: saved.expectedSha256, candidateSha256: saved.observedSha256, candidateRuleSha256: saved.ruleSha256,
        p2Mode: policy.startsWith('P2') ? mode : null, inductionPageId: mode === 'shared' && policy.startsWith('P2') ? seedPage?.id || null : null,
        inductionSourceSha256: shared?.sourceSha256 || null, procedureSha256: output.procedure ? sha256(JSON.stringify(output.procedure)) : null,
        outputFile: stem + '.html', outputSha256: sha256(output.html), scores };
      rows.push(row); fs.appendFileSync(path.join(outputDirectory, 'rows.jsonl'), JSON.stringify(row) + '\n');
      if (options.progress) console.error(`${page.id} ${policy}: ${output.ok ? 'ok' : output.reason}`);
    }
  }
  const summary = rows.length ? summarize(rows, options) : { policies: {} };
  summary.manifestFile = manifestFile; summary.manifestSha256 = sha256(manifestBytes); summary.thresholds = thresholds; summary.skipped = skipped;
  summary.p2Mode = pages[0].p2Mode || options.p2Mode || 'fresh';
  summary.timeoutsMs = { P0: options.timeoutMs ?? 120000, P1: options.timeoutMs ?? 60000, P2: options.timeoutMs ?? 60000, 'P2-nr': options.timeoutMs ?? 60000 };
  summary.runtime = { node: process.version, jsdom: require('jsdom/package.json').version, readability: require('@mozilla/readability/package.json').version, coreSha256: p2.coreSha256 };
  summary.scoringVersion = SCORING_VERSION;
  summary.bySite = Object.fromEntries([...new Set(rows.map(r => r.site))].sort().map(site => [site, summarize(rows.filter(r => r.site === site), options)]));
  summary.audited = rows.some(r => r.audited) ? summarize(rows.filter(r => r.audited), options) : null;
  summary.comparisons = [];
  for (const policy of Object.keys(summary.policies)) for (const baseline of ['P0', 'P1']) {
    if (policy === baseline) continue;
    const subset = rows.filter(r => r.policy === policy || r.policy === baseline && rows.some(x => x.id === r.id && x.policy === policy));
    if (subset.some(r => r.policy === baseline)) summary.comparisons.push(pairedDifference(subset, policy, baseline, options));
  }
  fs.writeFileSync(path.join(outputDirectory, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outputDirectory, 'report.md'), report(summary) + '\n');
  return { rows, summary };
}
module.exports = { run, resolveFile, pageFiles, normalizeManifest, loadCandidate, siteFor, ROOT };
if (require.main === module) {
  const [manifest = path.join(ROOT, 'workspace/revision/corpus/dev-manifest.json'), output = path.join(ROOT, 'workspace/revision/results', 'baselines-' + new Date().toISOString().replace(/[:.]/g, '-')), mode = 'fresh'] = process.argv.slice(2);
  console.log(report(run(manifest, output, { p2Mode: mode, progress: true }).summary));
}
