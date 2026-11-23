'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { regate } = require('../eval/regate-trials.cjs');
const { rule, prose } = require('./helpers.cjs');
function write(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
}
function contents(root) {
    const files = {};
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const file = path.join(root, entry.name);
        if (entry.isDirectory()) {
            for (const [name, value] of Object.entries(contents(file))) files[path.join(entry.name, name)] = value;
        } else files[entry.name] = fs.readFileSync(file).toString('base64');
    }
    return files;
}
test('regate CLI reads actual P4 trial/candidates shapes on two tiny induction pages without writing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-f1-regate-'));
    const results = path.join(root, 'results'), corpus = path.join(root, 'corpus');
    const folder = path.join(results, 'eval-01', 'sites', 'eval-01');
    const proposed = rule({ exclude: ['.related-articles'] });
    write(path.join(folder, 'trial.json'), { accepted: false, reason: 'gate-rejected', reasons: ['p1:G4:unique-exclusion:.related-articles'], rule: proposed,
        gate: { accepted: false, reasons: ['p1:G4:unique-exclusion:.related-articles'] },
        history: [{ turn: 1, action: 'preview', outcome: 'gate-rejected' }, { turn: 2, action: 'submit', outcome: 'gate-rejected' }] });
    write(path.join(folder, 'candidates.json'), []);
    const site = path.join(corpus, 'eval', 'eval-01');
    write(path.join(site, 'site-manifest.json'), { siteId: 'eval-01', host: 'example.test', pages: [1,2].map(n => ({ pageId: 'eval-01-p' + n, finalUrl: 'https://example.test/page' + n })) });
    for (const n of [1,2]) write(path.join(site, 'eval-01-p' + n, 'rendered-dom.html'),
        `<main class="reading"><h1>Title ${n}</h1><p>${prose('Body '+n)}</p><div class="related-articles"><p>${prose('Teaser '+n)}</p></div></main>`);
    const before = contents(root);
    const child = spawnSync(process.execPath, [require.resolve('../eval/regate-trials.cjs'), results, corpus], { encoding: 'utf8', timeout: 30000 });
    assert.equal(child.status, 0, child.stderr);
    const [row] = child.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(row.site, 'eval-01');assert.equal(row.candidate, 'trial.json');
    assert.equal(row.old.accepted, false);assert.equal(row.new.accepted, true);assert.deepEqual(row.new.reasons, []);
    assert.equal(row.unavailablePreviewRules, 1);
    assert.deepEqual(contents(root), before);
    // Also accept multiple saved candidate trials, including a still-unsafe rule.
    write(path.join(folder, 'candidates.json'), [
        { accepted: false, reason: 'gate-rejected', rule: proposed },
        { accepted: false, reason: 'gate-rejected', rule: rule({ exclude: ['main > p'] }) }
    ]);
    const rows = [], beforeCandidates = contents(root);
    assert.equal(regate(results, corpus, row => rows.push(row)), 2);
    assert.equal(rows[0].new.accepted, true);assert.equal(rows[1].new.accepted, false);
    assert.ok(rows[1].new.reasons.some(r => r.includes('G4:')));
    assert.deepEqual(contents(root), beforeCandidates);
    // eval-run's normal <run>/sites/<site> layout works too.
    const direct = [];
    assert.equal(regate(path.join(results, 'eval-01'), corpus, row => direct.push(row)), 2);
    assert.deepEqual(direct.map(r => r.new.accepted), [true, false]);
});
test('regate reports runs with no saved rule and refuses ambiguous corpus splits', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-f1-regate-errors-'));
    const results = path.join(root, 'results'), corpus = path.join(root, 'corpus'), folder = path.join(results, 'sites', 'site');
    write(path.join(folder, 'trial.json'), { accepted: false, reason: 'provider-error', rule: null });
    write(path.join(folder, 'candidates.json'), []);
    const rows = [];
    assert.equal(regate(results, corpus, row => rows.push(row)), 0);
    assert.equal(rows[0].old.accepted, false);assert.equal(rows[0].new, null);assert.deepEqual(rows[0].reasons, ['no-saved-rule']);
    write(path.join(folder, 'candidates.json'), [{ rule: rule() }]);
    for (const split of ['dev','eval']) fs.mkdirSync(path.join(corpus, split, 'site'), { recursive: true });
    assert.throws(() => regate(results, corpus, () => {}), /expected-one-corpus-site:site/);
});
