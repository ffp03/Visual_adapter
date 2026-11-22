'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { extractText, normalize } = require('./text.cjs');
const { normalizeManifest, pageFiles, siteFor } = require('./run-baselines.cjs');
const { createOutput } = require('./output.cjs');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function validateReference(reference, source) {
  const errors = [];
  if (!reference || !Array.isArray(reference.content) || !Array.isArray(reference.noise) || (reference.neutral !== undefined && !Array.isArray(reference.neutral))) return [{ reason: 'invalid-reference-schema' }];
  if (['content', 'noise', 'neutral'].some(section => (reference[section] || []).some(u => !u || typeof u !== 'object' || Array.isArray(u)))) return [{ reason: 'invalid-reference-unit' }];
  for (const unit of reference.content) if (typeof unit.required !== 'boolean') errors.push({ reason: 'invalid-required-flag', section: 'content', id: unit.id });
  if (!reference.content.some(u => u.required === true)) errors.push({ reason: 'no-required-units' });
  if (!reference.content.some(u => u.role === 'title')) errors.push({ reason: 'missing-title-unit' });
  const sourceText = extractText(source), groups = new Map();
  for (const section of ['content', 'noise', 'neutral']) for (const unit of reference[section] || []) {
    if (typeof unit.text !== 'string' || !normalize(unit.text)) { errors.push({ reason: 'empty-reference-unit', section, id: unit.id }); continue; }
    const value = normalize(unit.text);
    if (!sourceText.includes(value)) errors.push({ reason: 'unit-not-in-source-text', section, id: unit.id });
    if (!groups.has(value)) groups.set(value, []); groups.get(value).push({ section, id: unit.id });
  }
  for (const [value, units] of groups) if (units.length > 1) {
    let occurrences = 0;
    for (let i = sourceText.indexOf(value); i >= 0; i = sourceText.indexOf(value, i + value.length)) occurrences++;
    if (occurrences < units.length) errors.push({ reason: 'duplicate-unit-multiplicity', units, annotated: units.length, occurrences });
  }
  return errors;
}
function loadValidPages(manifestFile) {
  manifestFile = path.resolve(manifestFile);
  const manifestBytes = fs.readFileSync(manifestFile), manifest = JSON.parse(manifestBytes), pages = normalizeManifest(manifest);
  const ids = pages.map(p => p.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw Error('invalid-or-duplicate-page-id');
  const valid = [], skipped = [];
  for (const page of pages) {
    let files;
    try {
      files = pageFiles(page, manifestFile);
      const sourceBytes = fs.readFileSync(files.source), referenceBytes = fs.readFileSync(files.reference);
      const sourceSha256 = sha256(sourceBytes), referenceSha256 = sha256(referenceBytes);
      if ((page.sourceSha256 || page.sha256) && sourceSha256 !== (page.sourceSha256 || page.sha256)) throw Error('source-sha256-mismatch');
      if (page.referenceSha256 && referenceSha256 !== page.referenceSha256) throw Error('reference-sha256-mismatch');
      const reference = JSON.parse(referenceBytes), errors = validateReference(reference, sourceBytes.toString('utf8'));
      if (errors.length) { skipped.push({ id: page.id, referenceFile: files.reference, referenceSha256, errors }); continue; }
      valid.push({ page: { ...page, site: siteFor(page), sourceFile: files.source, referenceFile: files.reference, sourceSha256, referenceSha256 }, reference, referenceBytes });
    } catch (error) { skipped.push({ id: page.id, referenceFile: files?.reference, errors: [{ reason: error.code === 'ENOENT' ? 'missing-input-file' : error.message }] }); }
  }
  return { manifestFile, manifestBytes, manifestSha256: sha256(manifestBytes), valid, skipped, totalPages: pages.length };
}
function freezeValidReferences(manifestFile, directory) {
  const input = loadValidPages(manifestFile), folder = createOutput(directory), pages = [];
  for (const item of input.valid) {
    const file = path.join(folder, sha256(JSON.stringify(item.page.id)) + '-reference.json');
    fs.writeFileSync(file, item.referenceBytes, { flag: 'wx' });
    pages.push({ ...item.page, originalReferenceFile: item.page.originalReferenceFile || item.page.referenceFile, referenceFile: file });
  }
  const snapshot = { scope: 'Valid frozen references under the current shared text extractor', canonicalManifest: input.manifestFile, canonicalManifestSha256: input.manifestSha256, frozenAt: new Date().toISOString(), totalPages: input.totalPages, pages, excluded: input.skipped };
  const file = path.join(folder, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), { flag: 'wx' });
  return { manifestFile: file, snapshot };
}
module.exports = { validateReference, loadValidPages, freezeValidReferences, sha256 };
if (require.main === module) {
  const [manifest, directory] = process.argv.slice(2);
  if (!manifest || !directory) throw Error('Usage: node references.cjs MANIFEST NEW_RESULTS_INPUT_FOLDER');
  const result = freezeValidReferences(manifest, directory);
  console.log(JSON.stringify({ manifestFile: result.manifestFile, validPages: result.snapshot.pages.map(p => p.id), skipped: result.snapshot.excluded }, null, 2));
}
