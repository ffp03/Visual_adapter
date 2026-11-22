'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const corePath = require.resolve('../../../../extension/procedure-core.js');
const core = require(corePath);
const { documentFor, result, failed } = require('./common.cjs');
// Expose the ORIGINAL private renderer in a separate VM instance. This avoids
// copying sanitization or invoking the preservation/repair gate for P2-nr.
const source = fs.readFileSync(corePath, 'utf8');
const marker = 'return { validationLimits, prepareValidationContext,';
if (source.split(marker).length !== 2) throw Error('core-render-adapter-boundary-changed');
const sandbox = { module: { exports: {} }, URL };
vm.runInNewContext(source.replace(marker, 'return { render, ' + marker.slice(9)), sandbox, { filename: corePath });
const renderer = sandbox.module.exports.render;
const coreSha256 = crypto.createHash('sha256').update(source).digest('hex');
function compile(page, candidate, options = {}) {
  let dom;
  try { const rule = parseCandidate(candidate); dom = documentFor(page, options.baseURL); return { ok: true, reason: null, procedure: core.compile(dom.window.document, rule), coreSha256 }; }
  catch (error) { return { ok: false, reason: error.message, procedure: null, coreSha256 }; }
  finally { dom?.window.close(); }
}
function parseCandidate(value) {
  const c = typeof value === 'string' ? JSON.parse(value) : value;
  if (!c || typeof c.main !== 'string' || !c.main.trim() || c.main.length > 500 || typeof c.name !== 'string' || c.name.length > 120 || !Array.isArray(c.exclude) || c.exclude.length > 30 || c.exclude.some(s => typeof s !== 'string' || !s.trim() || s.length > 500)) throw Error('invalid-model-rule');
  return c;
}
function run(page, candidate, options = {}) {
  let dom;
  try {
    const rule = parseCandidate(candidate);
    dom = documentFor(page, options.baseURL);
    const doc = dom.window.document;
    if (options.noRepair) {
      // Keep October's nonpositional predicate and CSS parser, for main and exclusions.
      for (const s of [rule.main, ...rule.exclude]) {
        if (/:(?:nth-|first-|last-|only-)/i.test(s)) throw Error('unstable-region-selector');
        try { doc.querySelectorAll(s); } catch { throw Error('invalid-selector'); }
      }
      if (core.matches(doc, rule.main).length !== 1) throw Error('model-region-must-match-exactly-once');
      return result(renderer(doc, [{ selector: rule.main }], rule.exclude).innerHTML, true, null, { coreSha256 });
    }
    let procedure = options.procedure;
    if (!procedure && options.inductionPage) {
      const compiled = compile(options.inductionPage, rule);
      if (!compiled.ok) throw Error(compiled.reason);
      procedure = compiled.procedure;
    }
    if (!procedure) procedure = core.compile(doc, rule);
    const applied = core.apply(doc, procedure);
    return result(applied.html, applied.accepted, applied.reason, { procedure, coreSha256 });
  } catch (error) { return { ...failed(error), coreSha256 }; }
  finally { dom?.window.close(); }
}
function replay(page, candidate, options = {}) { return { P2: run(page, candidate, options), 'P2-nr': run(page, candidate, { ...options, noRepair: true }) }; }
module.exports = { run, replay, compile, parseCandidate, coreSha256 };
