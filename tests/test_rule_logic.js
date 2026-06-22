const { JSDOM } = require('C:/Users/final/.gemini/antigravity/brain/f759781b-f06f-4249-b8e6-515daadbe27b/test_env/node_modules/jsdom');

// --- Mocks ---
let mockRules = [];
global.chrome = {
    runtime: {
        sendMessage: async (msg) => {
            if (msg.action === "GET_RULES") {
                return { rules: mockRules };
            }
            return {};
        }
    }
};

// --- Code Under Test (Copied from content.js) ---
async function tryApplyRules(document, window) {
    const hostname = window.location.hostname;
    try {
        const response = await chrome.runtime.sendMessage({ action: "GET_RULES", hostname });
        const rules = response?.rules || [];

        for (const rule of rules) {
            const mainElement = document.querySelector(rule.main);
            if (mainElement) {
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

// --- Test Runner ---
async function runTests() {
    console.log("Running V2 Rule Logic Tests...");
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`[PASS] ${message}`);
            passed++;
        } else {
            console.error(`[FAIL] ${message}`);
            failed++;
        }
    }

    // Setup JSDOM
    const html = `
        <!DOCTYPE html>
        <html>
        <body>
            <header>Header</header>
            <div id="main-content">
                <h1>Article Title</h1>
                <p>Paragraph 1</p>
                <div class="ad">Buy Now</div>
                <p>Paragraph 2</p>
            </div>
            <footer>Footer</footer>
            <div id="sidebar">Sidebar</div>
        </body>
        </html>
    `;
    const dom = new JSDOM(html, { url: "https://example.com/article" });
    const { window } = dom;
    const { document } = window;

    // Test 1: No Rules (Should return null)
    mockRules = [];
    let result = await tryApplyRules(document, window);
    assert(result === null, "Test 1: No rules should return null");

    // Test 2: Rule Match (Simple)
    mockRules = [{ main: "#main-content", name: "Test Rule" }];
    result = await tryApplyRules(document, window);
    assert(result && result.includes("Article Title"), "Test 2: Rule match should return content");
    assert(result.includes("Buy Now"), "Test 2: Rule match should include non-excluded content");

    // Test 3: Rule Match with Exclude
    mockRules = [{ main: "#main-content", exclude: [".ad"], name: "Test Rule Exclude" }];
    result = await tryApplyRules(document, window);
    assert(result && !result.includes("Buy Now"), "Test 3: Exclude should remove ads");
    assert(result.includes("Paragraph 1"), "Test 3: Should keep main content");

    // Test 4: Rule Miss (Selector not found)
    mockRules = [{ main: "#non-existent", name: "Bad Rule" }];
    result = await tryApplyRules(document, window);
    assert(result === null, "Test 4: Non-matching rule should return null");

    console.log(`\nSummary: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
