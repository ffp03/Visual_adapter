// Content Script
// Listens for requests to scrape content or extract context for LLM

function analysisSample(doc, budget = 12000) {
    // Whole-document selection precedes serialization. A late table or discussion
    // competes for the same budget as an early paragraph, never a prefix cutoff.
    const maximum = Number.isFinite(budget) ? Math.max(2000, Math.min(12000, budget)) : 12000;
    const norm = text => (text || '').replace(/\s+/g, ' ').trim();
    const skip = 'script,style,noscript,iframe,object,embed,template,input,textarea,select,option';
    const elements = [...doc.body.querySelectorAll('*')].filter(node => !node.closest(skip));
    const groups = {
        region: elements.filter(node => node.matches('main,article,[role="main"]')),
        title: elements.filter(node => node.matches('h1')),
        heading: elements.filter(node => node.matches('h1,h2,h3,h4,h5,h6')),
        table: elements.filter(node => node.matches('table')),
        code: elements.filter(node => node.matches('pre,code') && !node.parentElement.closest('pre,code')),
        image: elements.filter(node => node.matches('img,svg')),
        caption: elements.filter(node => node.matches('figcaption,caption')),
        list: elements.filter(node => node.matches('ul,ol,dl')),
        discussion: elements.filter(node => node.matches('[role="comment"],[itemprop="commentText"]')),
        navigation: elements.filter(node => node.matches('nav,[role="navigation"]')),
        prose: elements.filter(node => node.matches('p,blockquote')),
        link: elements.filter(node => node.matches('a[href]')),
        text: elements.filter(node => !node.children.length && !node.matches('svg *') && norm(node.textContent).length > 24)
    };
    const selected = new Set([doc.body]), rejected = new Set(), covered = new Set();
    const inert = doc.implementation.createHTMLDocument(''), cues = new Map();
    function cue(element) {
        if (cues.has(element)) return cues.get(element);
        const walker = doc.createTreeWalker(element, 4);
        let text = '', node;
        while ((node = walker.nextNode()) && text.length < 192) {
            if (!node.parentElement?.closest(skip)) text += ' ' + node.nodeValue.slice(0, 192);
        }
        const value = norm(text).slice(0, 96); cues.set(element, value); return value;
    }
    const totals = Object.fromEntries(Object.entries(groups).map(([kind, nodes]) => [kind, nodes.length]));
    const textTags = 'h1,h2,h3,h4,h5,h6,p,pre,code,td,th,li,dt,dd,blockquote,a,figcaption,caption,span,small';
    const ancestors = node => {
        const result = [];
        for (let current = node; current && current !== doc.body; current = current.parentElement) result.push(current);
        return result.reverse();
    };
    function build(nodes) {
        const included = new Set([doc.body]);
        for (const node of nodes) for (const ancestor of ancestors(node)) included.add(ancestor);
        const copies = new Map();
        const ordered = [...included].sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & 2 ? 1 : -1);
        for (const node of ordered) {
            const clone = inert.createElementNS(node.namespaceURI, node.localName);
            for (const key of ['id', 'class', 'role', 'alt', 'aria-label', 'itemprop']) {
                // Preserve complete structural attribute values or omit them;
                // truncating a class or ID would manufacture a nonexistent selector.
                const value = node.getAttribute(key);
                if (value && value.length <= 160) clone.setAttribute(key, value);
            }
            copies.set(node, clone);
        }
        for (const node of ordered) {
            if (node !== doc.body) copies.get(node.parentElement).appendChild(copies.get(node));
            if (nodes.has(node) && (node.matches(textTags) || !node.children.length)) {
                // A single short cue is enough to identify a role; never an article
                // body, code file, form value, destination URL or image payload.
                const text = cue(node);
                if (text) copies.get(node).insertBefore(inert.createTextNode(text), copies.get(node).firstChild);
            }
        }
        const body = copies.get(doc.body);
        body.setAttribute('data-analysis-sampled', 'structure-and-short-cues; not-complete; original-attributes-only-for-selectors');
        return body.outerHTML;
    }
    let html = build(selected);
    function add(node, kind) {
        if (selected.has(node)) { covered.add(kind); return; }
        if (rejected.has(node)) return;
        const trial = new Set(selected); trial.add(node);
        const candidate = build(trial);
        if (candidate.length > maximum) { rejected.add(node); return; }
        selected.add(node); html = candidate; covered.add(kind);
    }
    // One representative per role first, then balanced examples across document
    // positions. Large repeated lists cannot consume all of the available budget.
    const positions = nodes => [...new Set([0, Math.floor(nodes.length / 2), nodes.length - 1])].filter(i => i >= 0 && i < nodes.length);
    for (const [kind, nodes] of Object.entries(groups)) if (nodes.length) add(nodes[0], kind);
    for (const [kind, nodes] of Object.entries(groups)) for (const index of positions(nodes)) add(nodes[index], kind);
    for (const [kind, nodes] of Object.entries(groups)) {
        const parents = new Map();
        for (const node of nodes) {
            if (!parents.has(node.parentElement)) parents.set(node.parentElement, []);
            parents.get(node.parentElement).push(node);
        }
        const repeated = [...parents.values()].filter(siblings => siblings.length >= 3);
        for (const index of positions(repeated)) for (const i of positions(repeated[index])) add(repeated[index][i], kind);
    }
    // Table/list examples retain actual parent paths and valid HTML structure.
    for (const container of [...selected].filter(node => node.matches('table,ul,ol,dl'))) {
        const cells = [...container.querySelectorAll('td,th,li,dt,dd')];
        for (const index of positions(cells)) add(cells[index], container.matches('table') ? 'table' : 'list');
    }
    for (const [kind, nodes] of Object.entries(groups)) {
        for (let i = 0; i < nodes.length && i < 12; i++) add(nodes[Math.floor(i * nodes.length / Math.min(nodes.length, 12))], kind);
    }
    return { html, context: { complete: false, kind: 'balanced-structural-sample', maxCharacters: maximum, characters: html.length,
        sourceElements: elements.length, selectedElements: selected.size, roleCounts: totals,
        representedRoles: [...covered], unrepresentedRoles: Object.keys(groups).filter(kind => totals[kind] && !covered.has(kind)),
        textCueLimit: 96, cuesMayContainContent: true, requiresFullSourceValidation: true } };
}

async function tryApplyRules(outcome = {}) {
    try {
        const response = await chrome.runtime.sendMessage({ action: "GET_RULES", hostname: window.location.hostname });
        const rules = response?.rules || [];
        outcome.localProtocol = response?.protocol;
        outcome.lookupAvailable = response?.lookupAvailable;
        outcome.ruleFailure = false;
        outcome.inventory = PreservationCore.inspect(document);
        for (const rule of rules) {
            const result = rule.schemaVersion === 2
                ? PreservationCore.apply(document, rule, outcome.inventory) : PreservationCore.applyLegacy(document, rule, outcome.inventory);
            if (!result.accepted) {
                if (result.reason === 'structural-scope-mismatch') {
                    outcome.ruleRejectionDetail = result.reason;
                    (outcome.incompatibleFamilies ||= []).push(rule.familyKey || null);
                    continue;
                }
                outcome.ruleFailure = true;
                outcome.ruleRejected = 'substantive-content-loss';
                outcome.ruleRejectionDetail = result.reason;
                outcome.rejectedCoverage = result.coverage;
                continue;
            }
            outcome.coverage = result.coverage;
            outcome.procedureDelivered = rule.schemaVersion === 2;
            outcome.compilationAdjusted = !!rule.compilationAdjusted;
            outcome.pureModelSelection = rule.schemaVersion === 2 ? !!rule.pureModelSelection : null;
            outcome.addedRegions = rule.addedRegions || [];
            outcome.supplementation = !!rule.supplementation;
            outcome.modelSelectionSuperseded = !!rule.modelSelectionSuperseded;
            outcome.delivery = rule.schemaVersion === 2 ? (rule.supplementation ? 'supplemented-procedure' : 'validated-procedure') : 'legacy-rule';
            outcome.procedureAdjustments = rule.schemaVersion === 2 ? rule.adjustments || [] : [];
            return result.html;
        }
    } catch (error) {
        outcome.ruleRejectionDetail = error.message;
        outcome.lookupAvailable = false;
    }
    return null;
}

function extractMainContent(outcome = {}) {
    const inventory = outcome.inventory || PreservationCore.inspect(document);
    outcome.inventory = inventory;
    const fallback = PreservationCore.fallback(document, inventory);
    outcome.coverage = fallback.coverage;
    outcome.delivery = 'fallback';
    // Analysis remains bounded and distinct from full local validation.
    outcome.analysisRoot = inventory.roots.length === 1 ? inventory.roots[0] : (() => {
        const wrapper = document.createElement('div');
        inventory.roots.forEach(root => wrapper.appendChild(root.cloneNode(true)));
        return wrapper;
    })();
    return fallback.html;
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "EXTRACT_CONTEXT") {
        (async () => {
            try {
                // 1. Try Cached Rules
                const outcome = {};
                let html = await tryApplyRules(outcome);
                const ruleApplied = !!html;
                const usedRule = ruleApplied;

                // 2. If no rule, use Heuristic
                if (!html) {
                    html = extractMainContent(outcome);
                }

                const localContext = {};
                if (outcome.localProtocol === 2 && outcome.lookupAvailable !== false && !ruleApplied) {
                    try { Object.assign(localContext, PreservationCore.validationContext(document, outcome.inventory)); }
                    catch { localContext.validationComplete = false; localContext.validationLimitation = 'reading-context-preparation-unavailable'; }
                }
                const verificationContext = {};
                if (request.includeRawHTML) {
                    // The verifier's model prompt accepts 5,000 original-context characters.
                    // Send a complete body that fits; a head/prefix-only sample can falsely
                    // reject a working rule and trigger destructive refinement.
                    const rawBody = document.body?.outerHTML || '';
                    if (rawBody && rawBody.length <= 5000) {
                        verificationContext.rawHTML = rawBody;
                    } else {
                        verificationContext.verificationContextUnavailable = 'complete-body-exceeds-verifier-bound';
                    }
                }

                const analysis = ruleApplied || outcome.lookupAvailable === false ? null : analysisSample(document);
                sendResponse({
                    url: window.location.href,
                    html: html || "",
                    analysisHTML: analysis?.html,
                    hostname: window.location.hostname,
                    usedRule: usedRule,
                    ruleFailure: !ruleApplied && !!outcome.ruleFailure,
                    ruleApplied,
                    procedureDelivered: !!outcome.procedureDelivered,
                    ruleOnly: usedRule,
                    ruleRejected: outcome.ruleRejected,
                    ruleRejectionDetail: outcome.ruleRejectionDetail,
                    incompatibleFamilies: outcome.incompatibleFamilies || [],
                    delivery: outcome.delivery,
                    taskScope: 'reading',
                    applicationFunctionalityVerified: false,
                    coverage: outcome.coverage,
                    rejectedCoverage: outcome.rejectedCoverage,
                    procedureAdjustments: outcome.procedureAdjustments || [],
                    supplementation: !!outcome.supplementation,
                    modelSelectionSuperseded: !!outcome.modelSelectionSuperseded,
                    noFallback: ruleApplied,
                    runtimeSupplementation: false,
                    supplementationStage: outcome.supplementation ? 'compilation' : null,
                    compilationAdjusted: !!outcome.compilationAdjusted,
                    pureModelSelection: outcome.pureModelSelection ?? null,
                    addedRegions: outcome.addedRegions || [],
                    validationContext: 'full-live-source-dom',
                    analysisContext: analysis?.context,
                    localProtocol: outcome.localProtocol,
                    lookupAvailable: outcome.lookupAvailable,
                    ...localContext,
                    ...verificationContext,
                    originalLength: document.body.innerText.length // Metadata to detect extraction failure
                });
            } catch (e) {
                console.error("Extraction error:", e);
                sendResponse({ error: e.message });
            }
        })();
        return true; // Keep channel open for async response
    }

    if (request.action === "APPLY_CSS") {
        // Legacy/No-op
        sendResponse({ success: true });
    }
});
