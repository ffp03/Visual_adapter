'use strict';
const core = require('../../../../extension/procedure-core.js');
const { documentFor, result, failed } = require('./common.cjs');
const { withCssCompatibility } = require('../dom.cjs');
function run(page, baseURL) {
  return withCssCompatibility(skipped => {
  let dom;
  try { dom = documentFor(page, baseURL); const output = core.fallback(dom.window.document); return result(output.html, true, null, { coverage: output.coverage, cssCompatibilitySkipped: skipped() }); }
  catch (error) { return failed(error); }
  finally { dom?.window.close(); }
  });
}
module.exports = { run };
