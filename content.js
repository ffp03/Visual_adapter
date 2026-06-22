// Content Script
// Listens for requests to scrape content or extract context for LLM

// --- Rule Matching ---
async function tryApplyRules() {
    const hostname = window.location.hostname;
    // We need to wrap sendMessage in a promise if we want to use await cleanly here, 
    // or just use the callback style. Chrome's sendMessage returns a promise in MV3 but 
    // sometimes it's flaky if the background script isn't ready.
    try {
        const response = await chrome.runtime.sendMessage({ action: "GET_RULES", hostname });
        const rules = response?.rules || [];

        for (const rule of rules) {
            const mainElement = document.querySelector(rule.main);
            if (mainElement) {
                console.log("Visual Adapter: Matched cached rule:", rule.name);
                // Clone and clean using the rule
                const clone = mainElement.cloneNode(true);
                if (rule.exclude) {
                    rule.exclude.forEach(sel => {
                        clone.querySelectorAll(sel).forEach(el => el.remove());
                    });
                }
                return clone.innerHTML;
            }
        }
    } catch (e) {
        console.warn("Visual Adapter: Failed to fetch rules", e);
    }
    return null; // No rule matched
}

// --- Main Extraction (Fallback) ---
function extractMainContent() {
    console.log("Visual Adapter: No rule matched, using heuristic extraction.");
    const clone = document.cloneNode(true);

    // Remove clutter
    const clutterSelectors = ['script', 'style', 'link', 'noscript', 'iframe', 'svg', 'footer', 'nav', '[role="banner"]', '[role="navigation"]', '.ads', '#ads', '.popup', '.modal'];
    clutterSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Try to find semantic main content
    const article = clone.querySelector('article, [role="main"], main, .post-content, .article-body, #content');
    if (article) return article.innerHTML;

    // Fallback to body
    return clone.body ? clone.body.innerHTML : "";
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "EXTRACT_CONTEXT") {
        (async () => {
            try {
                // 1. Try Cached Rules
                let html = await tryApplyRules();
                let usedRule = !!html;

                // 2. If no rule, use Heuristic
                if (!html) {
                    html = extractMainContent();
                }

                // Limit length to avoid token limits
                if (html && html.length > 50000) {
                    html = html.substring(0, 50000) + "... [Truncated]";
                }

                sendResponse({
                    url: window.location.href,
                    html: html || "",
                    hostname: window.location.hostname,
                    usedRule: usedRule,
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
