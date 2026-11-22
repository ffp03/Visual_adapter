'use strict';
// Run a frozen snapshot of development pages whose blind references exist now.
// All generated manifests/results stay in WP-B's output area.
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, run } = require('./run-baselines.cjs');
const { report } = require('./report.cjs');
const { createOutput } = require('./output.cjs');
function snapshot(folder, options = {}) {
  folder = path.resolve(folder);
  const corpus = path.join(ROOT, 'workspace/revision/corpus'), canonical = path.join(corpus, 'dev-manifest.json');
  createOutput(folder);
  if (fs.existsSync(canonical)) return run(canonical, path.join(folder, 'baselines'), options);
  const pages = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name === 'reference.json') {
        const meta = JSON.parse(fs.readFileSync(path.join(directory, 'meta.json')));
        pages.push({ id: path.basename(directory), site: new URL(meta.finalUrl || meta.url).hostname,
          url: meta.url, finalUrl: meta.finalUrl, sourceSha256: meta.sha256,
          sourceFile: path.join(directory, 'rendered-dom.html'), referenceFile: file });
      }
    }
  }
  visit(path.join(corpus, 'dev'));
  pages.sort((a, b) => a.id.localeCompare(b.id));
  const manifest = path.join(folder, 'available-dev-manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({ scope: 'Available blind development references at snapshot time', createdAt: new Date().toISOString(), pages }, null, 2));
  return run(manifest, path.join(folder, 'baselines'), options);
}
module.exports = { snapshot };
if (require.main === module) console.log(report(snapshot(process.argv[2] || path.join(ROOT, 'workspace/revision/results', 'available-dev-' + Date.now()), { progress: true }).summary));
