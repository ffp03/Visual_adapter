'use strict';
// One bounded, offline policy operation. stdout is a JSON-only transport.
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const p0 = require('./policies/p0-reader.cjs'), p1 = require('./policies/p1-readability.cjs'), p2 = require('./policies/p2-replay.cjs');
function execute(request) {
  const start = performance.now(); let output;
  if (request.policy === 'compile') output = p2.compile(request.page, request.candidate, request.options);
  else if (request.policy === 'P0') output = p0.run(request.page);
  else if (request.policy === 'P1') output = p1.run(request.page);
  else if (request.policy === 'P2' || request.policy === 'P2-nr') output = p2.run(request.page, request.candidate, { ...request.options, noRepair: request.policy === 'P2-nr' });
  else throw Error('invalid-worker-policy');
  return { ...output, latencyMs: performance.now() - start };
}
module.exports = { execute };
if (require.main === module) process.stdout.write(JSON.stringify(execute(JSON.parse(fs.readFileSync(0, 'utf8')))));
