'use strict';
// Offline/read-only: node tests/revision/eval/regate-trials.cjs <results> <corpus>
// Accepts either <results>/sites/<site> or <results>/<site>/sites/<site>.
// P4 eval-run writes its final rule to trial.json and normally writes [] to
// candidates.json. loop.cjs history records preview verdicts, but not their rules;
// report those unavailable proposals rather than inventing or silently skipping them.
const fs = require('node:fs');
const path = require('node:path');
const v3 = require('../../../extension/procedure-v3.js');
const { createDOM } = require('./dom.cjs');
const p0 = require('./policies/p0-reader.cjs');
const p1 = require('./policies/p1-readability.cjs');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const directories = folder => fs.readdirSync(folder, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
function trialFolders(results) {
    const folders = [];
    const add = root => {
        for (const site of directories(root)) {
            const folder = path.join(root, site);
            if (['trial.json', 'candidates.json'].some(f => fs.existsSync(path.join(folder, f)))) folders.push({ site, folder });
        }
    };
    if (fs.existsSync(path.join(results, 'sites'))) add(path.join(results, 'sites'));
    for (const name of directories(results)) {
        if (name !== 'sites' && fs.existsSync(path.join(results, name, 'sites'))) add(path.join(results, name, 'sites'));
    }
    return folders;
}
function proposals(folder) {
    const records = [], trialFile = path.join(folder, 'trial.json'), candidatesFile = path.join(folder, 'candidates.json');
    const trial = fs.existsSync(trialFile) ? read(trialFile) : null;
    const candidates = fs.existsSync(candidatesFile) ? read(candidatesFile) : [];
    if (!Array.isArray(candidates)) throw Error('candidates-must-be-array:' + candidatesFile);
    function add(record, source) {
        const rule = record?.rule || (record?.schemaVersion === 3 ? record : null);
        if (rule) records.push({ rule, source, old: record.gate || record });
    }
    candidates.forEach((candidate, i) => add(candidate, 'candidates.json:' + i));
    if (trial?.rule && !records.some(r => JSON.stringify(r.rule) === JSON.stringify(trial.rule))) add(trial, 'trial.json');
    let unavailablePreviewRules = 0;
    for (const [i, entry] of (trial?.history || []).entries()) {
        if (entry.action !== 'preview') continue;
        if (entry.rule) add(entry, 'trial.json:history:' + i);
        else unavailablePreviewRules++;
    }
    return { records, trial, unavailablePreviewRules };
}
function inductionPages(corpus, site, hostname) {
    const locations = ['dev', 'eval'].map(split => path.join(corpus, split, site)).filter(fs.existsSync);
    if (locations.length !== 1) throw Error('expected-one-corpus-site:' + site);
    const folder = locations[0], manifestFile = path.join(folder, 'site-manifest.json');
    const manifest = fs.existsSync(manifestFile) ? read(manifestFile) : null;
    return [1, 2].map(n => {
        const suffix = new RegExp('(?:^|[-_])p' + n + '$');
        const names = directories(folder).filter(name => suffix.test(name));
        if (names.length !== 1) throw Error('expected-one-induction-page:' + site + ':p' + n);
        const page = manifest?.pages?.find(p => (p.pageId || p.id) === names[0]);
        const host = manifest?.host || hostname;
        const url = page?.finalUrl || page?.url || (host ? 'https://' + host + '/' + names[0] : null);
        if (!url) throw Error('induction-url-unavailable:' + site);
        return { html: fs.readFileSync(path.join(folder, names[0], 'rendered-dom.html'), 'utf8'), url };
    });
}
function oldVerdict(record) {
    return { accepted: typeof record?.accepted === 'boolean' ? record.accepted : null,
        reasons: record?.reasons?.length ? record.reasons : record?.reason ? [record.reason] : [] };
}
function regate(results, corpus, emit = row => console.log(JSON.stringify(row))) {
    let count = 0;
    for (const { site, folder } of trialFolders(path.resolve(results))) {
        const { records, trial, unavailablePreviewRules } = proposals(folder);
        if (!records.length) {
            emit({ site, trial: path.join(folder, 'trial.json'), candidate: null, old: oldVerdict(trial),
                new: null, reasons: ['no-saved-rule'], unavailablePreviewRules });
            continue;
        }
        const pages = inductionPages(path.resolve(corpus), site, records[0].rule.applicability?.hostname);
        const documents = [];
        try {
            for (const page of pages) documents.push(createDOM(page.html, { url: page.url }));
            const docs = documents.map(d => d.window.document);
            const inventories = v3.inventory(docs, { mode: 'P4' });
            // Run baselines synchronously without baselines.cjs's on-disk cache.
            const baselines = pages.map(page => ({ P0: p0.run(page), P1: p1.run(page) }));
            for (const { rule, source, old } of records) {
                const verdict = v3.gate(docs, rule, { mode: 'P4', inventories, baselines });
                emit({ site, trial: path.join(folder, 'trial.json'), candidate: source, old: oldVerdict(old),
                    new: { accepted: verdict.accepted, reasons: verdict.reasons }, unavailablePreviewRules });
                count++;
            }
        } finally { documents.forEach(d => d.window.close()); }
    }
    return count;
}
if (require.main === module) {
    if (process.argv.length !== 4) {
        console.error('Usage: node tests/revision/eval/regate-trials.cjs <results-folder> <corpus-folder>');
        process.exitCode = 1;
    } else {
        try { regate(process.argv[2], process.argv[3]); }
        catch (error) { console.error(error.message); process.exitCode = 1; }
    }
}
module.exports = { regate };
