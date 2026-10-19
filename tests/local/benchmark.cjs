// Offline extraction/display benchmark. No network, no AI calls, no browser timing claims.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { page, scorer, root, sourceFile } = require('./harness.cjs');
const { assertCompatibleProvenance, fingerprintInputs } = require('./provenance.cjs');
const outDir = path.join(root, 'workspace/task023');
const normalize = text => text.replace(/\s+/g, ' ').trim();
const median = xs => [...xs].sort((a,b) => a-b)[Math.floor(xs.length/2)];
const validate = scorer();
const frozen = JSON.parse(fs.readFileSync(path.join(root, 'tests/test_data/good_rules.json'), 'utf8'));
const corpus = JSON.parse(fs.readFileSync(path.join(outDir, 'corpus.json'), 'utf8'));
let pages = corpus.pages;
if (process.argv.includes('--public')) {
    pages = JSON.parse(fs.readFileSync(path.join(outDir, 'public-fetches.json'), 'utf8')).attempts.filter(r => r.success).map(r => ({ ...r, hostname: r.site }));
}
const inputFingerprint = fingerprintInputs(
    path.join(outDir, process.argv.includes('--public') ? 'public-fetches.json' : 'corpus.json'),
    path.join(root, 'tests/test_data/good_rules.json'), pages, root);
const limitArg = process.argv.find(a => a.startsWith('--limit='));
if (limitArg) pages = pages.slice(0, Number(limitArg.split('=')[1]));
const pageArg = process.argv.find(a => a.startsWith('--page-id='));
if (pageArg) pages = pages.filter(row => row.id === pageArg.slice('--page-id='.length));
const tagArg = process.argv.find(a => a.startsWith('--tag='));
if (tagArg && !/^[a-zA-Z0-9_-]+$/.test(tagArg.slice(6))) throw Error('Invalid benchmark output tag');
const tag = tagArg ? tagArg.slice(6) : (process.argv.includes('--public') ? 'public' : (process.env.LOCAL_BASELINE === '1' ? 'baseline' : 'repaired'));
const output = path.join(outDir, `${tag}-benchmark.json`);
const resume = process.argv.includes('--resume');
const previous = resume && fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : { results: [] };
const results = previous.results;
const refPath = path.join(outDir, `${tag}-references.json`);
const references = resume && fs.existsSync(refPath) ? JSON.parse(fs.readFileSync(refPath, 'utf8')) : [];
const environment = { node: process.version, jsdom: require('jsdom/package.json').version, platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0].model,
    inputs: inputFingerprint,
    timing: 'Node/JSDOM production EXTRACT_CONTEXT + reader.innerHTML assignment; DOM parse excluded; local Chrome messaging doubled; 3 repeats, median; no Chrome rendering/cloud latency',
    source: require('node:crypto').createHash('sha256').update(fs.readFileSync(sourceFile('extension/content.js'))).digest('hex'),
    protocol: require('node:crypto').createHash('sha256')
        .update(fs.readFileSync(__filename)).update(fs.readFileSync(path.join(__dirname, 'harness.cjs')))
        .update(fs.readFileSync(path.join(__dirname, 'provenance.cjs'))).digest('hex') };
if (resume && fs.existsSync(output)) assertCompatibleProvenance(previous.environment, environment);
function save() { fs.writeFileSync(output, JSON.stringify({ environment, approaches: ['fresh-per-page-ai', 'shared-reusable-rules', 'general-local-fallback'], results }, null, 2)); }
(async () => {
    for (const row of pages) {
        if (results.some(r => r.id === row.id && r.available)) continue;
        const html = fs.readFileSync(path.join(root, row.html_file), 'utf8');
        const replacementCharacters = (html.match(/\uFFFD/g) || []).length;
        const captureSource = row.source || corpus.pages.find(r => r.hostname === row.hostname)?.source;
        const fixture = frozen.find(r => captureSource?.replaceAll('\\', '/').endsWith(r.file));
        // These are authored legacy fixtures, NOT evidenced model outputs.
        const approaches = [{ name: 'general-local-fallback', rules: [] }];
        if (fixture) approaches.push({ name: 'shared-reusable-rules', rules: [fixture.rule] });
        results.push({ id: row.id, approach: 'fresh-per-page-ai', available: false, reason: 'No new provider calls authorized; no frozen per-page model rule with sufficient provenance located', ai_calls: { generation: 0, refresh: 0, retry: 0, failed: 0 } });
        if (!fixture) results.push({ id: row.id, approach: 'shared-reusable-rules', available: false, reason: 'No frozen rule fixture mapped to this capture', ai_calls: { generation: 0, refresh: 0, retry: 0, failed: 0 } });
        for (const approach of approaches) {
            let p;
            try {
                p = page(html, row.url, approach.rules);
                const doc = p.dom.window.document;
                // Independent, provisional reference anchors. Complete means these anchors only.
                const referenceRoot = doc.querySelector('main, [role="main"], article') || doc.body;
                const selector = referenceRoot?.tagName.toLowerCase() || 'none';
                const blocks = [...(referenceRoot?.querySelectorAll('h1,h2,h3,p,li') || [])]
                    .filter(el => !el.closest('nav,footer,header,script,style,[role="navigation"]'))
                    .map(el => normalize(el.textContent)).filter(text => text.length >= 15).slice(0, 30).map(text => text.slice(0, 300));
                if (!references.some(r => r.id === row.id)) references.push({ id: row.id, url: row.url, title: doc.title, source: row.source || row.html_file,
                    root: selector, anchors: blocks, replacement_characters: replacementCharacters,
                    status: 'agent-generated provisional; parent inspection pending',
                    limitation: 'First 30 heading/paragraph/list anchors, 300 characters each; not whole-page ground truth or user benefit' });
                const reader = doc.createElement('div'); // disconnected from source DOM
                const durations = [], outputs = [];
                for (let repeat = 0; repeat < 3; repeat++) {
                    const start = performance.now();
                    const response = await p.extract();
                    reader.innerHTML = response.html;
                    durations.push(performance.now() - start);
                    outputs.push(response);
                }
                const extractedText = normalize(reader.textContent);
                const retained = blocks.filter(b => extractedText.includes(b)).length;
                const response = outputs[2];
                // DOM confidence is a diagnostic, not one of the three measures.
                // The bounded public run can omit its two additional DOM parses.
                const score = process.argv.includes('--skip-score') ? null : validate(html, response.html, approach.rules[0] || {});
                results.push({ id: row.id, url: row.url, approach: approach.name, available: true,
                    rule_provenance: fixture && approach.rules.length ? `tests/test_data/good_rules.json#${fixture.id}; authored test fixture, model provenance unavailable` : null,
                    content_outcome: blocks.length && retained === blocks.length ? 'complete' : retained ? 'partial' : 'failure',
                    reference_anchors: blocks.length, retained_anchors: retained, provisional: true, used_rule: response.usedRule,
                    replacement_characters: replacementCharacters,
                    rule_failure: response.ruleFailure || false, local_delay_ms: durations, median_local_delay_ms: median(durations),
                    ai_calls: { generation: 0, refresh: 0, retry: 0, failed: 0 },
                    production_dom_score: score?.confidence ?? null, production_dom_method: score?.method ?? 'diagnostic-not-run',
                    note: approach.rules.length && !response.usedRule ? 'Shared fixture selector failed; output is local fallback, not successful shared extraction' : undefined });
            } catch (error) { results.push({ id: row.id, approach: approach.name, available: false, error: error.message }); }
            finally { p?.close(); }
            if (global.gc) global.gc();
        }
        save();
        fs.writeFileSync(path.join(outDir, `${tag}-references.json`), JSON.stringify(references, null, 2));
        console.log(`${tag}: ${row.id} (${results.filter(r => r.available).length} measured rows)`);
    }
    const cols = ['id','approach','available','content_outcome','reference_anchors','retained_anchors','used_rule','median_local_delay_ms','production_dom_score'];
    fs.writeFileSync(path.join(outDir, `${tag}-benchmark.csv`), cols.join(',') + '\n' + results.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(',')).join('\n'));
})();
