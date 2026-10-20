// Content Script
// Listens for requests to scrape content or extract context for LLM

// --- Rule Matching ---
const clutterSelectors = ['script', 'style', 'link', 'noscript', 'iframe', 'svg', 'footer', 'nav', '[role="banner"]', '[role="navigation"]', '.ads', '#ads', '.popup', '.modal'];

function removeClutter(element) {
    clutterSelectors.forEach(selector => element.querySelectorAll(selector).forEach(node => node.remove()));
}

function resolveReadingURLs(element) {
    for (const node of element.querySelectorAll('a[href],img[src],source[src],video[src],audio[src],video[poster]')) {
        const attribute = node.hasAttribute('href') ? 'href' : node.hasAttribute('src') ? 'src' : 'poster';
        const value = node.getAttribute(attribute);
        if (!value || (attribute === 'href' && value.startsWith('#'))) continue;
        try {
            const url = new URL(value, document.baseURI);
            if (['http:', 'https:', 'mailto:', 'tel:', 'data:', 'blob:'].includes(url.protocol)) node.setAttribute(attribute, url.href);
            else node.removeAttribute(attribute);
        } catch { node.removeAttribute(attribute); }
    }
    for (const node of element.querySelectorAll('[srcset]')) {
        const value = node.getAttribute('srcset');
        if (value.trim().startsWith('data:')) continue;
        node.setAttribute('srcset', value.split(',').map(candidate => {
            const [url, ...descriptor] = candidate.trim().split(/\s+/);
            try { return [new URL(url, document.baseURI).href, ...descriptor].join(' '); }
            catch { return ''; }
        }).filter(Boolean).join(', '));
    }
}

function normalizedText(value) {
    return value.replace(/\s+/g, ' ').trim();
}

function analysisSample(element) {
    const sample = element.cloneNode(true);
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
    const hostname = window.location.hostname;
    // We need to wrap sendMessage in a promise if we want to use await cleanly here, 
    // or just use the callback style. Chrome's sendMessage returns a promise in MV3 but 
    // sometimes it's flaky if the background script isn't ready.
    try {
        const response = await chrome.runtime.sendMessage({ action: "GET_RULES", hostname });
        const rules = response?.rules || [];
        outcome.ruleFailure = rules.length > 0;

        for (const rule of rules) {
            const mainElement = document.querySelector(rule.main);
            if (mainElement) {
                console.log("Visual Adapter: Matched cached rule:", rule.name);
                // Clone and clean using the rule
                const clone = mainElement.cloneNode(true);
                removeClutter(clone);
                if (rule.exclude) {
                    rule.exclude.forEach(sel => {
                        clone.querySelectorAll(sel).forEach(el => el.remove());
                    });
                }
                const text = normalizedText(clone.textContent || '');
                const blocks = outcome.referenceBlocks || [];
                const retained = blocks.filter(block => text.includes(block)).length;
                const titleRetained = !outcome.referenceTitle || [...clone.querySelectorAll('h1')].some(heading =>
                    (!outcome.referenceTitleId || heading.id === outcome.referenceTitleId) && normalizedText(heading.textContent) === outcome.referenceTitle);
                if (!text || !titleRetained
                    || (outcome.referenceComments || []).some(comment => !text.includes(comment))
                    || (blocks.length && retained < Math.ceil(blocks.length / 2))) {
                    outcome.ruleRejected = 'substantive-content-loss';
                    continue;
                }
                resolveReadingURLs(clone);
                return ['TABLE', 'UL', 'OL'].includes(clone.tagName) ? clone.outerHTML : clone.innerHTML;
            }
        }
    } catch (e) {
        console.warn("Visual Adapter: Failed to fetch rules", e);
    }
    return null; // No rule matched
}

// --- Main Extraction (Fallback) ---
function extractMainContent(outcome = {}) {
    console.log('Visual Adapter: Preparing local reading fallback.');
    // Clone only the selected content, rather than the entire document and its
    // stylesheets/scripts. Ignore apparent article containers inside navigation.
    const article = [...document.querySelectorAll('article, [role="main"], main, .post-content, .article-body, #content')]
        .find(element => !element.closest(clutterSelectors.join(',')));
    const original = article || document.body;
    if (!original) return '';
    const content = original.cloneNode(true);
    removeClutter(content);
    resolveReadingURLs(content);
    // A body-level h1 can be site branding outside the actual content container.
    outcome.referenceTitle = article ? normalizedText(content.querySelector('h1')?.textContent || '') : '';
    outcome.referenceTitleId = article ? content.querySelector('h1')?.id : undefined;
    const paragraphs = [...content.querySelectorAll('p,pre,tr,blockquote,[itemprop="text"]')]
        .filter(node => node.tagName !== 'TR' || (!node.querySelector('tr') && !node.querySelector('p,pre,blockquote,[itemprop="text"]')))
        .map(node => normalizedText(node.textContent))
        .filter(text => text.length >= 80).map(text => text.slice(0, 180));
    const indices = paragraphs.length > 9
        ? [0, 1, 2, Math.floor(paragraphs.length / 2), paragraphs.length - 3, paragraphs.length - 2, paragraphs.length - 1]
        : paragraphs.map((_, index) => index);
    outcome.referenceBlocks = [...new Set(indices.map(index => paragraphs[index]))];
    const comments = [...content.querySelectorAll('.commtext,[role="comment"],[itemprop="commentText"]')]
        .map(node => normalizedText(node.textContent)).filter(text => text.length >= 20).map(text => text.slice(0, 180));
    outcome.referenceComments = comments.length ? [comments[0], comments[Math.floor(comments.length / 2)], comments.at(-1)] : [];
    // Preserve the real container for selector generation; innerHTML loses its ID/classes.
    outcome.analysisRoot = content;
    return content.innerHTML;
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "EXTRACT_CONTEXT") {
        (async () => {
            try {
                // 1. Try Cached Rules
                const outcome = {};
                const fallback = extractMainContent(outcome);
                let html = await tryApplyRules(outcome);
                let usedRule = !!html;

                // 2. If no rule, use Heuristic
                if (!html) {
                    html = fallback;
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
                    analysisHTML: usedRule ? undefined : analysisSample(outcome.analysisRoot),
                    hostname: window.location.hostname,
                    usedRule: usedRule,
                    ruleFailure: !usedRule && !!outcome.ruleFailure,
                    ruleRejected: outcome.ruleRejected,
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
