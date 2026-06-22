try {
    require('dotenv').config();
} catch (e) {
    // dotenv not installed, will use environment variables directly
}

const http = require('http');
const fetch = globalThis.fetch;

// ===== ENVIRONMENT VARIABLE VALIDATION =====
const REQUIRED_ENV_VARS = ['GEMINI_API_KEY'];
const missing = REQUIRED_ENV_VARS.filter(key => !process.env[key]);

if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    console.error('Please set the following in your .env file or environment:');
    missing.forEach(key => console.error(`  - ${key}`));
    console.error('\nExample .env file:');
    console.error('GEMINI_API_KEY=your_api_key_here');
    console.error('FIREBASE_SECRET=your_firebase_secret');
    console.error('FIREBASE_URL=https://your-project.firebaseio.com/');
    process.exit(1);
}

const FIREBASE_SECRET = process.env.FIREBASE_SECRET || "pr6IGWkc8Wa28DqgfxMWZdZueGfKyJfoWhPf4g9V";

// ===== API KEY ROTATION SYSTEM =====
const API_KEYS = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2 || 'AIzaSyBKDu9-eDNCTEcL8YAeOFhI3ntb3HFjzj8',
    process.env.GEMINI_API_KEY_3 || 'AIzaSyAK1Ei_kyL5GPjX8Ng2nM5HYamOWiyhrl4'
].filter(key => key); // Remove any undefined keys

let currentKeyIndex = 0;
let keyUsageCount = {};
let keyQuotaErrors = {};

// Initialize usage tracking
API_KEYS.forEach((key, index) => {
    keyUsageCount[index] = 0;
    keyQuotaErrors[index] = 0;
});

function getCurrentApiKey() {
    return API_KEYS[currentKeyIndex];
}

function rotateApiKey() {
    const previousIndex = currentKeyIndex;
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.log(`[API] Rotated from Key ${previousIndex + 1} to Key ${currentKeyIndex + 1}`);
    return getCurrentApiKey();
}

function markKeyQuotaError(keyIndex) {
    keyQuotaErrors[keyIndex]++;
    console.log(`[API] Key ${keyIndex + 1} quota error (total: ${keyQuotaErrors[keyIndex]})`);
}

function getKeyStats() {
    return {
        totalKeys: API_KEYS.length,
        currentKey: currentKeyIndex + 1,
        usage: Object.entries(keyUsageCount).map(([idx, count]) => ({
            key: parseInt(idx) + 1,
            calls: count,
            quotaErrors: keyQuotaErrors[idx]
        })),
        totalCalls: Object.values(keyUsageCount).reduce((a, b) => a + b, 0),
        totalQuotaErrors: Object.values(keyQuotaErrors).reduce((a, b) => a + b, 0)
    };
}

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const FIREBASE_URL = process.env.FIREBASE_URL || "https://visual-adapter-default-rtdb.firebaseio.com/";
const PORT = process.env.PORT || 7860; // Hugging Face Spaces default port

console.log(`[API] Rotation enabled with ${API_KEYS.length} keys`);

// ===== STRUCTURED LOGGING =====
function log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...data
    };
    const str = JSON.stringify(logEntry);
    if (level === 'ERROR') {
        console.error(str);
    } else {
        console.log(str);
    }
}

log('INFO', 'Starting Visual Adapter Backend', { version: '3.0' });
log('INFO', 'Environment variables loaded', {
    firebaseUrl: FIREBASE_URL,
    apiKeys: API_KEYS.length,
    currentKey: currentKeyIndex + 1,
    port: PORT
});

// ===== RATE LIMITING =====
const PROCESSING_QUEUE = new Set();
const MAX_CONCURRENT = 3; // Process max 3 requests at a time
const TIMEOUT_MS = 60000; // 60 seconds timeout

process.on('uncaughtException', (err) => {
    console.error('===== UNCAUGHT EXCEPTION =====');
    console.error(err.message);
    console.error(err.stack);
    console.error('==============================');
    process.exit(1);
});

// ===== FIREBASE SETUP =====
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
try {
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Production: Load from environment variable string
        try {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            log('INFO', 'Loaded Firebase credentials from environment variable');
        } catch (e) {
            log('ERROR', 'Failed to parse FIREBASE_SERVICE_ACCOUNT JSON', { error: e.message });
            process.exit(1);
        }
    } else {
        // Local: Load from file
        try {
            serviceAccount = require('./service-account.json');
            log('INFO', 'Loaded Firebase credentials from local file');
        } catch (e) {
            log('WARN', 'No Firebase credentials found (env or local file). Database features will fail.');
        }
    }

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: FIREBASE_URL
        });
        log('INFO', 'Firebase Admin SDK initialized');
    }
} catch (error) {
    log('ERROR', 'Failed to initialize Firebase Admin SDK', { error: error.message });
}

async function saveRuleToFirebase(hostname, rule) {
    if (!admin.apps.length) {
        log('WARN', 'Firebase not initialized, skipping save', { hostname });
        return;
    }

    try {
        const db = admin.database();
        // Sanitize hostname for Firebase path (replace . with _)
        const safeHostname = hostname.replace(/\./g, '_');
        await db.ref(`rules/${safeHostname}`).set(rule);
        log('INFO', 'Rule saved to Firebase', { hostname });
    } catch (error) {
        throw new Error(`Firebase save failed: ${error.message}`);
    }
}

async function callGemini(prompt) {
    if (API_KEYS.length === 0) throw new Error("No API keys available");

    let lastError = null;
    let attempts = 0;
    const maxAttempts = API_KEYS.length; // Try all keys once

    while (attempts < maxAttempts) {
        const currentKey = getCurrentApiKey();
        const keyIndex = currentKeyIndex;

        try {
            console.log(`[API] Calling Gemini with Key ${keyIndex + 1} (attempt ${attempts + 1}/${maxAttempts})`);
            keyUsageCount[keyIndex]++;

            const response = await fetch(`${GEMINI_URL}?key=${currentKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });

            const data = await response.json();

            // Check for quota error
            if (data.error && data.error.message && data.error.message.includes('quota')) {
                console.log(`[API] Quota exceeded for Key ${keyIndex + 1}, rotating...`);
                markKeyQuotaError(keyIndex);
                lastError = new Error(data.error.message);
                rotateApiKey();
                attempts++;
                continue;
            }

            // Other errors
            if (data.error) {
                throw new Error(data.error.message);
            }

            // Success!
            const text = data.candidates[0].content.parts[0].text;
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            console.log(`[API] Success with Key ${keyIndex + 1}`);
            return jsonMatch ? jsonMatch[0] : text;

        } catch (error) {
            console.log(`[API] Error with Key ${keyIndex + 1}: ${error.message}`);
            lastError = error;

            // If it's a quota error, rotate and try next key
            if (error.message.includes('quota')) {
                markKeyQuotaError(keyIndex);
                rotateApiKey();
                attempts++;
                continue;
            }

            // For other errors, throw immediately
            throw error;
        }
    }

    // All keys exhausted
    console.log(`[API] All ${API_KEYS.length} keys exhausted`);
    console.log(`[API] Stats:`, getKeyStats());
    throw lastError || new Error('All API keys failed');
}

// ===== RULE VERIFICATION SYSTEM =====
const VERIFICATION_CONFIDENCE_THRESHOLD = 0.8;
const MAX_REFINEMENT_ATTEMPTS = 5;

/**
 * DOM-based validation using metrics (0 tokens, instant)
 */
function validateExtractionDOM(rawHTML, extractedHTML, rule) {
    try {
        const { JSDOM } = require('jsdom');

        const rawDom = new JSDOM(rawHTML);
        const extractedDom = new JSDOM(extractedHTML);

        const rawDoc = rawDom.window.document;
        const extractedDoc = extractedDom.window.document;

        // Extract metrics
        const rawText = rawDoc.body?.textContent?.trim() || '';
        const extractedText = extractedDoc.body?.textContent?.trim() || '';

        const rawParagraphs = rawDoc.querySelectorAll('p').length;
        const extractedParagraphs = extractedDoc.querySelectorAll('p').length;

        const rawHeadings = rawDoc.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
        const extractedHeadings = extractedDoc.querySelectorAll('h1, h2, h3, h4, h5, h6').length;

        // Check for noise elements
        const hasNav = extractedDoc.querySelector('nav, header, footer, [role="navigation"], [role="banner"]') !== null;
        const hasAds = extractedDoc.querySelector('[class*="ad"], [id*="ad"], [class*="advertisement"]') !== null;
        const hasScripts = extractedDoc.querySelectorAll('script').length > 0;

        // Calculate ratios
        const textRatio = rawText.length > 0 ? extractedText.length / rawText.length : 0;
        const paragraphRatio = rawParagraphs > 0 ? extractedParagraphs / rawParagraphs : 0;
        const headingRatio = rawHeadings > 0 ? extractedHeadings / rawHeadings : 0;

        // Calculate confidence score
        let confidence = 0;
        const issues = [];
        const strengths = [];

        // Text ratio scoring (30-70% is ideal)
        if (textRatio >= 0.3 && textRatio <= 0.7) {
            confidence += 0.35;
            strengths.push(`Good text ratio: ${(textRatio * 100).toFixed(1)}%`);
        } else if (textRatio >= 0.2 && textRatio <= 0.8) {
            confidence += 0.20;
            strengths.push(`Acceptable text ratio: ${(textRatio * 100).toFixed(1)}%`);
        } else if (textRatio < 0.2) {
            issues.push(`Too little text extracted: ${(textRatio * 100).toFixed(1)}%`);
        } else {
            issues.push(`Too much text extracted: ${(textRatio * 100).toFixed(1)}%`);
        }

        // Paragraph ratio scoring (50%+ is good)
        if (paragraphRatio >= 0.5) {
            confidence += 0.25;
            strengths.push(`Good paragraph coverage: ${(paragraphRatio * 100).toFixed(1)}%`);
        } else if (paragraphRatio >= 0.3) {
            confidence += 0.15;
        } else {
            issues.push(`Missing paragraphs: only ${(paragraphRatio * 100).toFixed(1)}%`);
        }

        // Heading ratio scoring (50%+ is good)
        if (headingRatio >= 0.5) {
            confidence += 0.20;
            strengths.push(`Good heading coverage: ${(headingRatio * 100).toFixed(1)}%`);
        } else if (headingRatio >= 0.3) {
            confidence += 0.10;
        } else {
            issues.push(`Missing headings: only ${(headingRatio * 100).toFixed(1)}%`);
        }

        // Penalty for noise
        if (hasNav) {
            confidence -= 0.15;
            issues.push('Contains navigation/header/footer elements');
        }
        if (hasAds) {
            confidence -= 0.10;
            issues.push('Contains advertisement elements');
        }
        if (hasScripts) {
            confidence -= 0.05;
            issues.push('Contains script tags');
        }

        // Bonus for clean extraction
        if (!hasNav && !hasAds && !hasScripts) {
            confidence += 0.10;
            strengths.push('Clean extraction (no nav/ads/scripts)');
        }

        // Clamp confidence to 0-1
        confidence = Math.max(0, Math.min(1, confidence));

        const result = {
            isValid: confidence >= 0.6,
            confidence: parseFloat(confidence.toFixed(2)),
            method: 'dom-metrics',
            metrics: {
                textRatio: parseFloat(textRatio.toFixed(3)),
                paragraphRatio: parseFloat(paragraphRatio.toFixed(3)),
                headingRatio: parseFloat(headingRatio.toFixed(3)),
                hasNav,
                hasAds,
                hasScripts,
                rawTextLength: rawText.length,
                extractedTextLength: extractedText.length
            },
            issues,
            strengths,
            recommendation: issues.length > 0
                ? `Address: ${issues.join('; ')}`
                : 'Extraction looks good'
        };

        log('INFO', 'DOM validation complete', {
            confidence: result.confidence,
            isValid: result.isValid,
            issueCount: issues.length
        });

        return result;

    } catch (error) {
        log('ERROR', 'DOM validation failed', { error: error.message });
        return {
            isValid: false,
            confidence: 0,
            method: 'dom-metrics-error',
            metrics: {},
            issues: [`DOM validation error: ${error.message}`],
            strengths: [],
            recommendation: 'Use LLM verification as fallback'
        };
    }
}


async function verifyRule(rawHTML, extractedHTML, rule) {
    // Try DOM-based validation first (0 tokens, instant)
    const domResult = validateExtractionDOM(rawHTML, extractedHTML, rule);

    // If DOM validation is confident (high or low), use it
    if (domResult.confidence >= 0.7 || domResult.confidence <= 0.3) {
        log('INFO', 'Using DOM validation result', {
            confidence: domResult.confidence,
            method: 'dom-only'
        });
        return {
            ...domResult,
            missingContent: domResult.issues,
            includedNoise: domResult.issues.filter(i => i.includes('Contains'))
        };
    }

    // For borderline cases (0.3-0.7), use LLM verification
    log('INFO', 'DOM validation borderline, using LLM verification', {
        domConfidence: domResult.confidence
    });

    const prompt = `
You are a content extraction validator. Compare the original HTML with the extracted content.

ORIGINAL HTML (truncated to 5000 chars):
${rawHTML.substring(0, 5000)}

EXTRACTED HTML (truncated to 10000 chars):
${extractedHTML.substring(0, 10000)}

EXTRACTION RULE USED:
Main selector: ${rule.main}
Exclude selectors: ${rule.exclude ? rule.exclude.join(', ') : 'none'}

DOM METRICS (for reference):
- Text ratio: ${(domResult.metrics.textRatio * 100).toFixed(1)}%
- Paragraph ratio: ${(domResult.metrics.paragraphRatio * 100).toFixed(1)}%
- Has navigation: ${domResult.metrics.hasNav}
- Has ads: ${domResult.metrics.hasAds}

TASK:
1. Determine if the extracted content captures the main article/content accurately
2. Check if important text, headings, or paragraphs are missing
3. Verify that ads, navigation, and sidebars are properly excluded
4. Assign a confidence score (0.0 - 1.0)

RESPOND WITH JSON:
{
  "isValid": true/false,
  "confidence": 0.0-1.0,
  "missingContent": ["description of missing elements"],
  "includedNoise": ["description of unwanted elements"],
  "recommendation": "specific suggestion for improvement"
}
`;

    try {
        const resultJson = await callGemini(prompt);
        const result = JSON.parse(resultJson);
        log('INFO', 'LLM verification complete', {
            isValid: result.isValid,
            confidence: result.confidence,
            method: 'llm-verified'
        });
        return {
            ...result,
            method: 'llm-verified',
            domConfidence: domResult.confidence
        };
    } catch (error) {
        log('ERROR', 'LLM verification failed, using DOM result', { error: error.message });
        // Fallback to DOM result
        return {
            ...domResult,
            missingContent: domResult.issues,
            includedNoise: domResult.issues.filter(i => i.includes('Contains')),
            method: 'dom-fallback'
        };
    }
}

async function refineRule(previousRule, verificationResult, htmlContext) {
    const prompt = `
The previous extraction rule failed verification. Generate an improved rule.

PREVIOUS RULE:
Main: ${previousRule.main}
Exclude: ${previousRule.exclude ? previousRule.exclude.join(', ') : 'none'}

FAILURE REASON:
${verificationResult.recommendation}

MISSING CONTENT:
${verificationResult.missingContent.join(', ')}

UNWANTED CONTENT:
${verificationResult.includedNoise.join(', ')}

HTML CONTEXT (truncated):
${htmlContext.substring(0, 30000)}

Generate a NEW, IMPROVED rule that addresses these issues.

RESPOND WITH JSON:
{
  "main": "improved CSS selector",
  "exclude": ["array", "of", "selectors"],
  "name": "descriptive name"
}
`;

    try {
        const ruleJson = await callGemini(prompt);
        const rule = JSON.parse(ruleJson);
        log('INFO', 'Refined rule generated', { rule });
        return rule;
    } catch (error) {
        log('ERROR', 'Refinement failed', { error: error.message });
        throw error;
    }
}

/**
 * Re-extract HTML using a refined rule (for testing in refinement loop)
 */
async function reExtractHTML(rawHTML, rule) {
    try {
        const { JSDOM } = require('jsdom');

        log('INFO', 'Re-extracting HTML with refined rule', {
            mainSelector: rule.main,
            excludeCount: rule.exclude ? rule.exclude.length : 0
        });

        const dom = new JSDOM(rawHTML);
        const document = dom.window.document;

        // Find main element - try each selector if main is a comma-separated list
        let mainElement = null;
        const mainSelectors = rule.main.split(',').map(s => s.trim());

        for (const selector of mainSelectors) {
            try {
                mainElement = document.querySelector(selector);
                if (mainElement) {
                    log('INFO', 'Main selector matched', { selector, tagName: mainElement.tagName });
                    break;
                }
            } catch (e) {
                log('WARN', 'Invalid main selector', { selector, error: e.message });
            }
        }

        if (!mainElement) {
            log('WARN', 'No main selector matched', {
                triedSelectors: mainSelectors.length,
                selectors: mainSelectors.slice(0, 3)
            });
            return rawHTML.substring(0, 20000); // Fallback
        }

        // Clone the element
        const clone = mainElement.cloneNode(true);

        // Remove excluded elements with detailed logging
        let totalExcludedCount = 0;
        const exclusionResults = [];

        if (rule.exclude && rule.exclude.length > 0) {
            rule.exclude.forEach(selector => {
                try {
                    const elements = clone.querySelectorAll(selector);
                    const count = elements.length;

                    if (count > 0) {
                        // Remove elements
                        elements.forEach(el => {
                            try {
                                el.remove();
                            } catch (removeError) {
                                log('WARN', 'Failed to remove element', {
                                    selector,
                                    error: removeError.message
                                });
                            }
                        });

                        totalExcludedCount += count;
                        exclusionResults.push({ selector, count });
                    }
                } catch (e) {
                    log('WARN', 'Invalid exclusion selector', { selector, error: e.message });
                }
            });
        }

        const extracted = clone.innerHTML;
        const reductionPercent = ((1 - extracted.length / rawHTML.length) * 100).toFixed(1);

        log('INFO', 'Re-extraction complete', {
            originalLength: rawHTML.length,
            extractedLength: extracted.length,
            reductionPercent,
            totalExcludedElements: totalExcludedCount,
            topExclusions: exclusionResults.slice(0, 5).map(r => `${r.selector}(${r.count})`)
        });

        // Log warning if no elements were excluded
        if (totalExcludedCount === 0 && rule.exclude && rule.exclude.length > 0) {
            log('WARN', 'No elements excluded despite having exclusion rules', {
                exclusionRuleCount: rule.exclude.length,
                sampleRules: rule.exclude.slice(0, 3)
            });
        }

        // Trim to reasonable size for verification
        return extracted.substring(0, 20000);

    } catch (error) {
        log('ERROR', 'Re-extraction failed', {
            error: error.message,
            stack: error.stack
        });
        // Fallback to original extraction
        return rawHTML.substring(0, 20000);
    }
}


async function startVerification(hostname, rule, rawHTML, extractedHTML) {
    const safeHostname = hostname.replace(/\./g, '_');
    try {
        const db = admin.database();
        await db.ref(`rules/${safeHostname}/verification`).set({
            status: 'pending',
            attempts: 0,
            confidence: 0,
            lastUpdated: Date.now(),
            history: []
        });

        log('INFO', 'Starting verification', { hostname });
        let currentRule = rule;
        let attempt = 0;

        while (attempt < MAX_REFINEMENT_ATTEMPTS) {
            attempt++;
            await db.ref(`rules/${safeHostname}/verification/attempts`).set(attempt);
            await db.ref(`rules/${safeHostname}/verification/lastUpdated`).set(Date.now());
            log('INFO', `Verification attempt ${attempt}/${MAX_REFINEMENT_ATTEMPTS}`, { hostname });

            const verificationResult = await verifyRule(rawHTML, extractedHTML, currentRule);
            await db.ref(`rules/${safeHostname}/verification/history`).push({
                attempt,
                status: verificationResult.isValid ? 'verified' : 'failed',
                confidence: verificationResult.confidence,
                reason: verificationResult.recommendation,
                timestamp: Date.now()
            });

            if (verificationResult.isValid && verificationResult.confidence >= VERIFICATION_CONFIDENCE_THRESHOLD) {
                await db.ref(`rules/${safeHostname}/verification`).update({
                    status: 'verified',
                    confidence: verificationResult.confidence,
                    lastUpdated: Date.now()
                });
                log('SUCCESS', 'Rule verified', { hostname, attempt, confidence: verificationResult.confidence });
                return;
            }

            if (attempt >= MAX_REFINEMENT_ATTEMPTS) {
                await db.ref(`rules/${safeHostname}/verification`).update({
                    status: 'failed',
                    confidence: verificationResult.confidence,
                    lastUpdated: Date.now()
                });
                log('WARN', 'Verification failed after max attempts', { hostname, attempts: attempt });
                return;
            }

            log('INFO', 'Refining rule', { hostname, attempt });
            currentRule = await refineRule(currentRule, verificationResult, rawHTML);

            // Save refined rule to Firebase
            await db.ref(`rules/${safeHostname}`).update({
                main: currentRule.main,
                exclude: currentRule.exclude,
                name: currentRule.name,
                updatedAt: Date.now()
            });
            log('INFO', 'Refined rule saved', { hostname, attempt, rule: currentRule });

            // **NEW: Re-extract HTML with refined rule to test if it actually works**
            log('INFO', 'Re-extracting HTML with refined rule', { hostname, attempt });
            extractedHTML = await reExtractHTML(rawHTML, currentRule);
            log('INFO', 'Re-extraction complete, will verify in next iteration', {
                hostname,
                attempt,
                newExtractedLength: extractedHTML.length
            });
        }
    } catch (error) {
        log('ERROR', 'Verification process failed', { hostname, error: error.message, stack: error.stack });
        try {
            const db = admin.database();
            await db.ref(`rules/${safeHostname}/verification`).update({
                status: 'failed',
                error: error.message,
                lastUpdated: Date.now()
            });
        } catch (fbError) {
            log('ERROR', 'Failed to update Firebase verification status', { error: fbError.message });
        }
    }
}


async function watchRequests() {
    try {
        const requests = await firebaseDb('requests');
        if (!requests) return;

        const now = Date.now();

        for (const [hostname, req] of Object.entries(requests)) {
            // Skip if already processing
            if (PROCESSING_QUEUE.has(hostname)) {
                continue;
            }

            // Rate limit: max concurrent requests
            if (PROCESSING_QUEUE.size >= MAX_CONCURRENT) {
                log('WARN', 'Rate limit reached', {
                    queueSize: PROCESSING_QUEUE.size,
                    maxConcurrent: MAX_CONCURRENT
                });
                break;
            }

            // Check for expired requests (timeout)
            if (req.timestamp && (now - req.timestamp) > TIMEOUT_MS) {
                log('WARN', 'Request expired (timeout)', {
                    hostname,
                    age: Math.round((now - req.timestamp) / 1000) + 's'
                });
                await firebaseDb(`requests/${hostname}`, 'PATCH', {
                    status: 'expired',
                    error: 'Request timeout - backend did not process within 60s'
                });
                continue;
            }

            if (req.status === 'pending') {
                log('INFO', 'Processing request', { hostname });
                PROCESSING_QUEUE.add(hostname);

                // Process asynchronously and remove from queue when done
                processRequest(hostname, req).finally(() => {
                    PROCESSING_QUEUE.delete(hostname);
                });
            }
        }
    } catch (e) {
        log('ERROR', 'Watcher error', { error: e.message, stack: e.stack });
    }
}

async function processRequest(hostname, req) {
    await firebaseDb(`requests/${hostname}`, 'PATCH', { status: 'processing' });

    try {
        // Get HTML from the request (sent by frontend)
        const fullHtml = req.html;
        if (!fullHtml) {
            throw new Error("No HTML provided in request");
        }

        log('INFO', 'Processing HTML', { hostname, htmlLength: fullHtml.length });
        const htmlContext = fullHtml.substring(0, 30000);

        const prompt = `
            You are an expert web scraper and accessibility assistant.
            Task: Analyze the following HTML structure and identify the CSS selectors to extract the main content and remove noise.
            
            Input: A simplified HTML skeleton of a webpage.
            
            Output: A JSON object with the following keys:
            - "main": (String) The specific CSS selector for the main article or content container (e.g., "article", ".post-body", "#main-content").
            - "exclude": (Array of Strings) CSS selectors for elements to remove (ads, sidebars, navs, popups).
            - "name": (String) A short descriptive name for this page type (e.g., "Article", "Homepage").
            
            Rules:
            1. The "main" selector MUST capture BOTH the headline/title AND the main article body text. Do not select just the header.
            2. If they are siblings, find the nearest common ancestor wrapper.
            3. CRITICAL: The "main" selector MUST be a CONTAINER element (div, article, section, main), NOT individual elements like "h1, p, figcaption".
            4. NEVER select individual element types (h1, p, span, figcaption). Always select a wrapper/container.
            5. Look for data-attributes that indicate text content (e.g., [data-component="text-block"], .article-body, .post-content).
            6. If the article has video players or media blocks, select ONLY the text containers, NOT the entire article wrapper.
            7. NEVER include figcaption if it's part of a video/media block. Only include figcaption if it's for static images within the article text.
            8. "exclude" should aggressively target:
               - Video players (e.g., ".video-player", ".media-player", "figure", "[data-component*='video']", "[class*='player']", "smp-toucan-player")
               - Embedded iframes and widgets
               - Ads, sidebars, navigation, popups
               - Social share buttons
               - Related articles/recommendations
               - Any element with "video", "player", "media" in class or data attributes
            9. Return ONLY the raw JSON string. No markdown formatting.
            
            HTML Context:
            ${htmlContext}
        `;

        const ruleJson = await callGemini(prompt);
        const rule = JSON.parse(ruleJson);

        log('SUCCESS', 'Rule generated', { hostname, rule });
        await firebaseDb(`rules/${hostname}`, 'PUT', rule);
        await firebaseDb(`requests/${hostname}`, 'PATCH', { status: 'completed' });
    } catch (error) {
        log('ERROR', 'Processing failed', { hostname, error: error.message, stack: error.stack });
        await firebaseDb(`requests/${hostname}`, 'PATCH', { status: 'failed', error: error.message });
    }
}

// ===== HTTP SERVER (Required for Hugging Face Spaces) =====
const server = http.createServer(async (req, res) => {
    // CORS headers for extension requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Health check endpoint
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'running',
            service: 'Visual Adapter Backend',
            version: '3.0',
            uptime: Math.round(process.uptime()),
            firebase: FIREBASE_URL,
            queueSize: PROCESSING_QUEUE.size,
            maxConcurrent: MAX_CONCURRENT
        }));
        return;
    }

    // Version endpoint
    if (req.url === '/version') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            version: '3.0.0',
            node: process.version,
            uptime: Math.round(process.uptime())
        }));
        return;
    }

    // POST /analyze - Direct HTML processing endpoint
    if (req.url === '/analyze' && req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
            // Prevent memory issues with huge payloads
            if (body.length > 10 * 1024 * 1024) { // 10MB limit
                req.connection.destroy();
            }
        });

        req.on('end', async () => {
            try {
                const { hostname, html } = JSON.parse(body);

                if (!hostname || !html) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing hostname or html' }));
                    return;
                }

                log('INFO', 'Received analyze request', { hostname, htmlLength: html.length });

                // Check if already processing this hostname
                if (PROCESSING_QUEUE.has(hostname)) {
                    res.writeHead(429, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Already processing request for this hostname',
                        status: 'processing'
                    }));
                    return;
                }

                // Check rate limit
                if (PROCESSING_QUEUE.size >= MAX_CONCURRENT) {
                    res.writeHead(429, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Server busy, please try again',
                        queueSize: PROCESSING_QUEUE.size
                    }));
                    return;
                }

                // Process the request
                PROCESSING_QUEUE.add(hostname);

                try {
                    const htmlContext = html.substring(0, 30000);

                    const prompt = `
                        You are an expert web scraper and accessibility assistant.
                        Task: Analyze the following HTML structure and identify the CSS selectors to extract the main content and remove noise.
                        
                        Input: A simplified HTML skeleton of a webpage.
                        
                        Output: A JSON object with the following keys:
                        - "main": (String) The specific CSS selector for the main article or content container (e.g., "article", ".post-body", "#main-content").
                        - "exclude": (Array of Strings) CSS selectors for elements to remove (ads, sidebars, navs, popups).
                        - "name": (String) A short descriptive name for this page type (e.g., "Article", "Homepage").
                        
                        Rules:
                        1. The "main" selector MUST capture BOTH the headline/title AND the main article body text. Do not select just the header.
                        2. If they are siblings, find the nearest common ancestor wrapper.
                        3. CRITICAL: The "main" selector MUST be a CONTAINER element (div, article, section, main), NOT individual elements like "h1, p, figcaption".
                        4. NEVER select individual element types (h1, p, span, figcaption). Always select a wrapper/container.
                        5. Look for data-attributes that indicate text content (e.g., [data-component="text-block"], .article-body, .post-content).
                        6. If the article has video players or media blocks, select ONLY the text containers, NOT the entire article wrapper.
                        7. NEVER include figcaption if it's part of a video/media block. Only include figcaption if it's for static images within the article text.
                        8. "exclude" should aggressively target:
                           - Video players (e.g., ".video-player", ".media-player", "figure", "[data-component*='video']", "[class*='player']", "smp-toucan-player")
                           - Embedded iframes and widgets
                           - Ads, sidebars, navigation, popups
                           - Social share buttons
                           - Related articles/recommendations
                           - Any element with "video", "player", "media" in class or data attributes
                        9. Return ONLY the raw JSON string. No markdown formatting.
                        
                        HTML Context:
                        ${htmlContext}
                    `;

                    const ruleJson = await callGemini(prompt);
                    const rule = JSON.parse(ruleJson);

                    log('SUCCESS', 'Rule generated', { hostname, rule });

                    // Save rule to Firebase
                    // Save rule to Firebase
                    await saveRuleToFirebase(hostname, rule);

                    // Return rule to extension
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        rule,
                        source: 'generated'
                    }));

                } catch (error) {
                    log('ERROR', 'Processing failed', { hostname, error: error.message });
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Failed to process HTML',
                        message: error.message
                    }));
                } finally {
                    PROCESSING_QUEUE.delete(hostname);
                }

            } catch (error) {
                log('ERROR', 'Invalid request', { error: error.message });
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });

        return;
    }

    // POST /verify - Verify and refine a rule
    if (req.url === '/verify' && req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > 10 * 1024 * 1024) { // 10MB limit
                req.connection.destroy();
            }
        });

        req.on('end', async () => {
            try {
                const { hostname, rawHTML, extractedHTML, rule } = JSON.parse(body);

                if (!hostname || !rawHTML || !extractedHTML || !rule) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Missing required fields: hostname, rawHTML, extractedHTML, rule'
                    }));
                    return;
                }

                log('INFO', 'Received verification request', {
                    hostname,
                    rawHTMLLength: rawHTML.length,
                    extractedHTMLLength: extractedHTML.length
                });

                // Start verification in background (don't wait)
                startVerification(hostname, rule, rawHTML, extractedHTML).catch(error => {
                    log('ERROR', 'Background verification failed', {
                        hostname,
                        error: error.message
                    });
                });

                // Return immediately
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    verification: {
                        status: 'pending',
                        message: 'Verification started in background'
                    }
                }));

            } catch (error) {
                log('ERROR', 'Invalid verification request', { error: error.message });
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });

        return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
    log('INFO', 'HTTP server started', { port: PORT });
    log('INFO', 'Health check available', { url: `http://localhost:${PORT}/health` });
    log('INFO', 'Analyze endpoint available', { url: `http://localhost:${PORT}/analyze` });
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGTERM', () => {
    log('INFO', 'SIGTERM received, shutting down gracefully...');
    server.close(() => {
        log('INFO', 'HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    log('INFO', 'SIGINT received, shutting down gracefully...');
    server.close(() => {
        log('INFO', 'HTTP server closed');
        process.exit(0);
    });
});
