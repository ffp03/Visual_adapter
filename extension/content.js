// Content Script
// Listens for requests to scrape content or extract context for LLM

function analysisSample(element) {
    const sample = element.cloneNode(true);
    sample.querySelectorAll('input,textarea').forEach(node => { node.removeAttribute('value'); node.textContent = ''; });
    for (const node of [sample, ...sample.querySelectorAll('*')]) {
        for (const attribute of [...node.attributes]) {
            if (!['id', 'class', 'role', 'alt', 'aria-label', 'itemprop'].includes(attribute.name)) node.removeAttribute(attribute.name);
        }
    }
    const walker = document.createTreeWalker(sample, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        if (node.nodeValue.length > 400) node.nodeValue = node.nodeValue.slice(0, 400);
    }
    // This is an analysis sample only. Never truncate the user's reading output.
    return sample.outerHTML.slice(0, 60000);
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

                sendResponse({
                    url: window.location.href,
                    html: html || "",
                    analysisHTML: ruleApplied || outcome.lookupAvailable === false ? undefined : analysisSample(outcome.analysisRoot),
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
                    analysisContext: { complete: false, kind: 'bounded-analysis-sample', maxCharacters: 60000 },
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
