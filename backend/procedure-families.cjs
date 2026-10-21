// Private, local-only v2 admission namespace. Evidence keys are prototype identifiers,
// not trusted attestations. No runner call occurs during deterministic admission.
const fs = require('node:fs'), path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { JSDOM } = require('jsdom');
const core = require('../extension/procedure-core');
const digest = value => createHash('sha256').update(value).digest('hex');
function createFamilies({ directory, provider, model, generate, cleanHTML }) {
    const cache = path.join(directory, 'procedures-v2'), archive = path.join(cache, 'archive');
    fs.mkdirSync(archive, { recursive: true });
    const jobs = new Map(), revisions = new Map();
    const prefix = host => digest(host) + '-';
    const file = (host, family) => path.join(cache, prefix(host) + family + '.json');
    function entries(host) {
        return fs.readdirSync(cache).filter(name => name.startsWith(prefix(host)) && name.endsWith('.json')).flatMap(name => {
            try { const entry = JSON.parse(fs.readFileSync(path.join(cache, name), 'utf8')); return entry.hostname === host && entry.provider === provider && entry.model === model && entry.descriptor?.version === core.descriptorVersion ? [entry] : []; } catch { return []; }
        });
    }
    function retireFile(target) {
        if (fs.existsSync(target)) fs.renameSync(target, path.join(archive, path.basename(target) + '-' + randomUUID()));
    }
    function save(entry) {
        const target = file(entry.hostname, entry.familyKey), temp = target + '.' + randomUUID() + '.tmp';
        fs.writeFileSync(temp, JSON.stringify(entry, null, 2)); retireFile(target); fs.renameSync(temp, target);
    }
    const pending = (reason, familyKey, count = 0) => ({ success: false, protocol: 2, status: 'pending', admission: 'provisional', reason, familyKey, examples: count });
    const admitted = entry => ({ success: true, protocol: 2, status: 'admitted', admission: 'admitted', familyKey: entry.familyKey, rule: entry.procedure, procedure: entry.procedure, examples: entry.examples.length, source: 'local-admitted-procedure' });
    async function analyze(host, data) {
        if (data.validationComplete !== true || typeof data.validationHTML !== 'string') return pending(data.validationLimitation || 'complete-validation-context-required');
        if (!/^[a-f0-9]{64}$/.test(data.exampleKey || '')) throw Error('A one-way example identity is required');
        const cleaned = cleanHTML(data.validationHTML), dom = new JSDOM(cleaned);
        let inventory, familyKey, contentKey;
        try {
            inventory = core.inspect(dom.window.document);
            if (!inventory.roles.length || inventory.unsupported.length) return pending('unusable-or-unsupported-reading-context');
            const relative = [...dom.window.document.querySelectorAll('[href],[src],[poster],[srcset]')].some(node =>
                ['href', 'src', 'poster'].some(attribute => { const value = node.getAttribute(attribute); return value && !/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(value); })
                || (node.hasAttribute('srcset') && !node.getAttribute('srcset').includes('data:') && node.getAttribute('srcset').split(',').some(candidate => !/^https?:/i.test(candidate.trim()))));
            if (relative) return pending('resolved-validation-destinations-required');
            if (data.structuralDescriptor && JSON.stringify(data.structuralDescriptor) !== JSON.stringify(inventory.descriptor)) return pending('validation-scaffold-mismatch');
            familyKey = digest(JSON.stringify(inventory.descriptor));
            // Destination / URL differences alone cannot manufacture a new example.
            contentKey = digest(JSON.stringify({ text: dom.window.document.body.textContent.replace(/\s+/g, ' ').trim(), tags: [...dom.window.document.body.querySelectorAll('*')].map(node => node.tagName) }));
            const key = host + ':' + familyKey;
            if (jobs.has(key)) {
                const waitingRevision = revisions.get(key) || 0;
                await jobs.get(key);
                if ((revisions.get(key) || 0) !== waitingRevision) return pending('family-retired-during-generation', familyKey);
                return analyze(host, data);
            }
            const revision = revisions.get(key) || 0;
            const job = (async () => {
                let entry = entries(host).find(entry => entry.familyKey === familyKey);
                if (entry?.status === 'admitted') return admitted(entry);
                if (entry?.status === 'failed') return { success: false, protocol: 2, status: 'fallback', familyKey, reason: entry.failure };
                if (entry) {
                    if (entry.examples.some(example => example.exampleKey === data.exampleKey || example.contentKey === contentKey)) return pending('distinct-identity-and-content-required', familyKey, entry.examples.length);
                    const result = core.apply(dom.window.document, entry.procedure, inventory);
                    if (!result.accepted) { entry.status = 'failed'; entry.failure = result.reason; save(entry); return { success: false, protocol: 2, status: 'fallback', familyKey, reason: result.reason }; }
                    entry.examples.push({ exampleKey: data.exampleKey, contentKey }); entry.status = 'admitted'; entry.admittedAt = new Date().toISOString(); save(entry);
                    return admitted(entry);
                }
                let generated;
                try {
                    generated = await generate('v2:' + key, data.html);
                    if ((revisions.get(key) || 0) !== revision) return pending('family-retired-during-generation', familyKey);
                    const procedure = core.compile(dom.window.document, generated.rule, inventory);
                    procedure.familyKey = familyKey; procedure.context.completeSourceValidation = true;
                    procedure.context.scope = 'client-sanitized-reading-dom'; procedure.context.wholeWebpageVerified = false;
                    entry = { schemaVersion: 2, hostname: host, familyKey, descriptor: inventory.descriptor, provider, model,
                        status: 'provisional', modelCandidate: generated.rule, procedure,
                        examples: [{ exampleKey: data.exampleKey, contentKey }], requestId: generated.localRequestId,
                        providerRequestId: generated.requestId || null, usage: generated.usage || null, createdAt: new Date().toISOString() };
                    save(entry); return pending('second-distinct-valid-example-required', familyKey, 1);
                } catch (error) {
                    if (error.status === 429) throw error;
                    if ((revisions.get(key) || 0) === revision) save({ schemaVersion: 2, hostname: host, familyKey, descriptor: inventory.descriptor, provider, model, status: 'failed', failure: error.message, examples: [] });
                    throw error;
                }
            })();
            jobs.set(key, job);
            try { return await job; } finally { jobs.delete(key); }
        } finally { dom.window.close(); }
    }
    function report(host, familyKey) {
        if (familyKey && !/^[a-f0-9]{64}$/.test(familyKey)) throw Error('Invalid family identity');
        const keys = new Set(entries(host).filter(entry => !familyKey || entry.familyKey === familyKey).map(entry => host + ':' + entry.familyKey));
        for (const key of jobs.keys()) if (key.startsWith(host + ':') && (!familyKey || key === host + ':' + familyKey)) keys.add(key);
        for (const key of keys) { revisions.set(key, (revisions.get(key) || 0) + 1); retireFile(file(host, key.slice(host.length + 1))); }
    }
    return { analyze, report, list: host => entries(host).filter(entry => entry.status === 'admitted').map(entry => entry.procedure) };
}
module.exports = { createFamilies };
