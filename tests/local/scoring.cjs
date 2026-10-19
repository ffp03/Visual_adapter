const assert = require('node:assert/strict');
const { scorer } = require('./harness.cjs');
const validate = scorer();
const content = '<h1>Heading</h1><p>' + 'content'.repeat(50) + '</p>';
const raw = '<nav>' + 'noise'.repeat(50) + '</nav><main>' + content + '</main>';
const clean = validate(raw, content, { main: 'main' });
assert.equal(clean.method, 'dom-metrics');
assert.equal(clean.confidence, 0.9); // Existing production weights, not a new quality threshold.
assert.equal(clean.isValid, true);
const empty = validate(raw, '', { main: '#missing' });
assert.equal(empty.isValid, false);
assert.equal(empty.metrics.extractedTextLength, 0);
const noisy = validate(raw, raw, { main: 'body' });
assert.ok(noisy.confidence < clean.confidence);
console.log(JSON.stringify({ production_scorer_checks: 3, passed: 3, diagnostic_only: true, clean_confidence: clean.confidence }));
