'use strict';
const fs = require('node:fs');
function report(summary) {
  const cell = v => `${v.estimate.toFixed(3)} [${v.low.toFixed(3)}, ${v.high.toFixed(3)}]`;
  const lines = ['| Policy | Pages | Recall | Char recall | Noise | Noise char share | Title first | Order tau | Complete | Clean | Failures |', '|---|---:|---|---|---|---|---|---|---|---|---:|'];
  for (const [policy, p] of Object.entries(summary.policies)) lines.push(`| ${policy} | ${p.pages} | ${['contentRecall', 'contentCharacterRecall', 'noiseLeakage', 'noiseCharacterShare', 'titleFirst', 'orderTau', 'completePass', 'cleanPass'].map(m => cell(p.measures[m])).join(' | ')} | ${p.failures} |`);
  if (summary.bySite) {
    lines.push('', '| Site | Policy | Pages | Recall | Char recall | Noise | Noise share | Title first | Tau | Complete | Clean | Failures |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const [site, s] of Object.entries(summary.bySite)) for (const [policy, p] of Object.entries(s.policies)) lines.push(`| ${site} | ${policy} | ${p.pages} | ${['contentRecall', 'contentCharacterRecall', 'noiseLeakage', 'noiseCharacterShare', 'titleFirst', 'orderTau', 'completePass', 'cleanPass'].map(m => p.measures[m].estimate.toFixed(3)).join(' | ')} | ${p.failures} |`);
  }
  if (Object.values(summary.policies).some(p => p.cleanFailureBreakdown)) {
    lines.push('', 'Clean failure reasons overlap; combinations in summary.json form disjoint groups. Title-first is a separate diagnostic, not an additional clean-pass gate.', '', '| Policy | Clean failures | Recall | Title missing | Order | Order or title | Noise | Title-first diagnostic failures |', '|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const [policy, p] of Object.entries(summary.policies)) { const b = p.cleanFailureBreakdown; if (b) lines.push(`| ${policy} | ${b.cleanFailures} | ${b.recall} | ${b.title} | ${b.order} | ${b.orderOrTitle} | ${b.noise} | ${b.titleFirstDiagnostic} |`); }
  }
  if (summary.audited) lines.push('', 'Audited-reference subset (included above; do not add its accounting to all-reference totals):', '', report(summary.audited));
  else if (Object.hasOwn(summary, 'audited')) lines.push('', 'Audited-reference subset: no audited reference pages available.');
  return lines.join('\n');
}
module.exports = { report };
if (require.main === module) console.log(report(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))));
