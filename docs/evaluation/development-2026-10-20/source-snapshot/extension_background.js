// Background Service Worker
// Handles Firebase integration and backend communication

import { createRuleService } from './rule-service.js';
import { getBackendURL } from './backend-config.js';

const firebaseService = createRuleService();

// Enable Side Panel on Action Click
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// Open Onboarding Wizard on Install
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({ url: 'options.html' });
    }
});

// --- Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ANALYZE_PAGE") {
        handleAnalysisRequest(request.context, sendResponse);
        return true; // Keep channel open
    }

    if (request.action === "REPORT_RULE") {
        firebaseService.reportRule(request.hostname, request.familyKey);
        sendResponse({ success: true });
        return true;
    }

    if (request.action === "GET_RULES") {
        const hostname = request.hostname;
        const lookup = firebaseService.getRules ? firebaseService.getRules(hostname)
            : firebaseService.getRule(hostname).then(rule => ({ rules: rule ? [rule] : [] }));
        lookup.then(response => sendResponse(response)).catch(() => sendResponse({ rules: [], protocol: firebaseService.protocol, lookupAvailable: false }));
        return true;
    }
});

// --- Centralized Logic ---
async function handleAnalysisRequest(context, sendResponse) {
    if (firebaseService.protocol === 2 && (context.lookupAvailable !== true || ![1, 2].includes(context.localProtocol))) return sendResponse({ success: false, protocol: 2, status: 'fallback', reason: context.lookupAvailable === false ? 'procedure-lookup-unavailable' : 'unconfirmed-procedure-lookup' });
    if (firebaseService.protocol === 2 && context.localProtocol === 1) return sendResponse({ success: false, protocol: 1, status: 'fallback', reason: 'legacy-server-does-not-support-admission' });
    if (firebaseService.protocol === 2 && context.localProtocol === 2) return handleProcedureAnalysis(context, sendResponse);
    const hostname = context.hostname;
    const html = context.analysisHTML || context.html;

    try {
        // 1. Check Firebase for existing rule first
        const existingRule = await firebaseService.getRule(hostname);

        if (existingRule) {
            // The content script has already tried this host's cached selector.
            // Keep the usable local view instead of reapplying it forever. A failed
            // selector does not authorize an automatic paid regeneration policy.
            if (context.ruleFailure) {
                sendResponse({ success: false, status: 'fallback', reason: 'cached-selector-failed' });
                return;
            }
            console.log(`Background: Found rule for ${hostname} in Firebase.`);
            sendResponse({ success: true, rule: existingRule, source: 'firebase' });
            return;
        }

        console.log(`Background: No rule for ${hostname}. Calling backend...`);

        // 2. No rule exists - call backend directly with HTML
        const BACKEND_URL = getBackendURL();

        try {
            const response = await fetch(`${BACKEND_URL}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    hostname: hostname,
                    html: html
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Backend returned ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.rule) {
                console.log(`Background: Received rule from backend for ${hostname}`);
                sendResponse({ success: true, rule: data.procedure || data.rule, source: 'backend' });

                // Notify other tabs that rule is available
                chrome.runtime.sendMessage({
                    action: 'UPDATE_RULE',
                    hostname: hostname,
                    rule: data.procedure || data.rule
                }).catch(() => {
                    // Ignore errors if no listeners
                });
            } else {
                throw new Error('Invalid response from backend');
            }

        } catch (backendError) {
            console.error(`Background: Backend error for ${hostname}:`, backendError);

            // Return error status - triggers heuristic fallback
            sendResponse({
                success: false,
                status: 'error',
                error: backendError.message
            });
        }

    } catch (error) {
        console.error("Background: Error in analysis flow", error);
        sendResponse({ error: error.message });
    }
}

async function handleProcedureAnalysis(context, sendResponse) {
    if (context.lookupAvailable === false) return sendResponse({ success: false, protocol: 2, status: 'fallback', reason: 'procedure-lookup-unavailable' });
    if (context.ruleFailure) return sendResponse({ success: false, protocol: 2, status: 'fallback', reason: 'matching-family-failed' });
    let exampleKey;
    try {
        const identity = new URL(context.url); identity.hash = '';
        if (!['http:', 'https:'].includes(identity.protocol) || identity.hostname !== context.hostname) throw Error('Identity hostname mismatch');
        exampleKey = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity.href)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    } catch { return sendResponse({ success: false, protocol: 2, status: 'fallback', reason: 'example-identity-unavailable' }); }
    const payload = { protocol: 2, hostname: context.hostname, html: context.analysisHTML || context.html,
        validationHTML: context.validationHTML, validationComplete: context.validationComplete === true,
        validationLimitation: context.validationLimitation, validationContextScope: context.validationContextScope, structuralDescriptor: context.structuralDescriptor, exampleKey };
    let body = JSON.stringify(payload);
    if (new TextEncoder().encode(body).length > 262144) {
        delete payload.validationHTML; payload.validationComplete = false; payload.validationLimitation = 'complete-context-request-exceeds-byte-bound'; body = JSON.stringify(payload);
    }
    try {
        const response = await fetch(`${getBackendURL()}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        const data = await response.json();
        sendResponse({ ...data, source: data.success ? 'local-admitted-procedure' : 'local-provisional' });
    } catch (error) { sendResponse({ success: false, protocol: 2, status: 'fallback', error: error.message }); }
}

// --- Verification System ---

/**
 * Send debug log to backend for verification
 * @param {string} hostname - Website hostname
 * @param {string} rawHTML - Original page HTML
 * @param {string} extractedHTML - Extracted HTML using the rule
 * @param {object} rule - The CSS selector rule used
 */
async function sendDebugLog(hostname, rawHTML, extractedHTML, rule) {
    const BACKEND_URL = getBackendURL();

    try {
        console.log(`[Verification] Sending debug log for ${hostname}`);

        // Trim HTML to prevent API quota issues
        const trimmedRawHTML = rawHTML.substring(0, 10000); // 10KB max
        const trimmedExtractedHTML = extractedHTML.substring(0, 20000); // 20KB max

        const response = await fetch(`${BACKEND_URL}/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                hostname,
                rawHTML: trimmedRawHTML,
                extractedHTML: trimmedExtractedHTML,
                rule
            })
        });

        if (!response.ok) {
            throw new Error(`Verification request failed: ${response.status}`);
        }

        const data = await response.json();
        console.log(`[Verification] Backend response:`, data);

        if (data.verification?.status === 'local-only') return;

        // Start polling for updates
        pollForRuleUpdates(hostname);

    } catch (error) {
        console.error(`[Verification] Failed to send debug log:`, error);
    }
}

/**
 * Poll Firebase for rule verification updates
 * @param {string} hostname - Website hostname
 */
async function pollForRuleUpdates(hostname) {
    const MAX_POLL_ATTEMPTS = 60; // 60 attempts * 5 seconds = 5 minutes
    const POLL_INTERVAL = 5000; // 5 seconds
    let attempts = 0;

    console.log(`[Verification] Starting to poll for ${hostname}`);

    const pollInterval = setInterval(async () => {
        attempts++;

        try {
            const rule = await firebaseService.getRule(hostname);

            if (!rule || !rule.verification) {
                console.log(`[Verification] No verification data yet (${attempts}/${MAX_POLL_ATTEMPTS})`);

                if (attempts >= MAX_POLL_ATTEMPTS) {
                    console.log(`[Verification] Polling timeout for ${hostname}`);
                    clearInterval(pollInterval);
                }
                return;
            }

            const verification = rule.verification;
            console.log(`[Verification] Status: ${verification.status}, Attempt: ${verification.attempts}, Confidence: ${verification.confidence}`);

            // Check if verification is complete
            if (verification.status === 'verified' || verification.status === 'failed') {
                console.log(`[Verification] Verification ${verification.status} for ${hostname}`);
                clearInterval(pollInterval);

                // If rule was updated, notify content scripts
                if (verification.status === 'verified') {
                    chrome.runtime.sendMessage({
                        action: 'RULE_UPDATED',
                        hostname: hostname,
                        rule: rule
                    }).catch(() => {
                        // Ignore errors if no listeners
                    });
                }
                return;
            }

            // Stop if max attempts reached
            if (attempts >= MAX_POLL_ATTEMPTS) {
                console.log(`[Verification] Polling timeout for ${hostname}`);
                clearInterval(pollInterval);
            }

        } catch (error) {
            console.error(`[Verification] Polling error:`, error);
            clearInterval(pollInterval);
        }
    }, POLL_INTERVAL);
}

// Listen for verification trigger from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "TRIGGER_VERIFICATION") {
        sendDebugLog(
            request.hostname,
            request.rawHTML,
            request.extractedHTML,
            request.rule
        );
        sendResponse({ success: true });
        return true;
    }
});
