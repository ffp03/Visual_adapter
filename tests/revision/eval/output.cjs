'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
const RESULTS = path.join(ROOT, 'workspace/revision/results');
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
function createOutput(directory) {
  const target = path.resolve(directory);
  if (!inside(RESULTS, target)) throw Error('output-must-be-under-revision-results');
  fs.mkdirSync(RESULTS, { recursive: true });
  const realRoot = fs.realpathSync(RESULTS);
  let ancestor = path.dirname(target);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const realAncestor = fs.realpathSync(ancestor);
  if (realAncestor !== realRoot && !inside(realRoot, realAncestor)) throw Error('output-symlink-escapes-results');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Exclusive final mkdir prevents concurrent runs from sharing a JSONL.
  try { fs.mkdirSync(target); } catch (error) { if (error.code === 'EEXIST') throw Error('output-directory-exists'); throw error; }
  return target;
}
function failureCategory(reason) {
  if (!reason) return null;
  const declared = String(reason).match(/^(invalid|gate-rejected|not-applicable|runtime-error|budget)(?:[: ]|$)/i);
  if (declared) return declared[1].toLowerCase();
  if (/^runtime-|^provider-attempt-failed/i.test(reason)) return 'runtime-error';
  if (/not (?:a )?valid selector|SyntaxError|unrecognized expression|invalid.*selector/i.test(reason)) return 'invalid';
  if (/budget/i.test(reason)) return 'budget';
  if (/role-preservation|unsupported|scope-indeterminate/i.test(reason)) return 'gate-rejected';
  if (/must-match|not-applicable|precondition|scope-mismatch|no-article/i.test(reason)) return 'not-applicable';
  if (/invalid|unstable|JSON|Unexpected token|Expected property/i.test(reason)) return 'invalid';
  return 'runtime-error';
}
module.exports = { ROOT, RESULTS, createOutput, failureCategory };
