// ===== RULE VERIFICATION SYSTEM =====
const VERIFICATION_CONFIDENCE_THRESHOLD = 0.8;
const MAX_REFINEMENT_ATTEMPTS = 5;

/**
 * Verify if a rule correctly extracts content
 */
async function verifyRule(rawHTML, extractedHTML, rule) {
    const prompt = `
You are a content extraction validator. Compare the original HTML with the extracted content.

ORIGINAL HTML (truncated to 5000 chars):
${rawHTML.substring(0, 5000)}

EXTRACTED HTML (truncated to 10000 chars):
${extractedHTML.substring(0, 10000)}

EXTRACTION RULE USED:
Main selector: ${rule.main}
Exclude selectors: ${rule.exclude ? rule.exclude.join(', ') : 'none'}

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
        log('INFO', 'Verification complete', {
            isValid: result.isValid,
            confidence: result.confidence
        });
        return result;
    } catch (error) {
        log('ERROR', 'Verification failed', { error: error.message });
        return {
            isValid: false,
            confidence: 0,
            missingContent: [],
            includedNoise: [],
            recommendation: `Verification error: ${error.message}`
        };
    }
}

/**
 * Generate an improved rule based on verification feedback
 */
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
 * Start verification process for a rule (runs asynchronously in background)
 */
async function startVerification(hostname, rule, rawHTML, extractedHTML) {
    const safeHostname = hostname.replace(/\./g, '_');

    try {
        // Initialize verification status in Firebase
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

            // Update attempt count
            await db.ref(`rules/${safeHostname}/verification/attempts`).set(attempt);
            await db.ref(`rules/${safeHostname}/verification/lastUpdated`).set(Date.now());

            log('INFO', `Verification attempt ${attempt}/${MAX_REFINEMENT_ATTEMPTS}`, { hostname });

            // Verify the rule
            const verificationResult = await verifyRule(rawHTML, extractedHTML, currentRule);

            // Log history
            await db.ref(`rules/${safeHostname}/verification/history`).push({
                attempt,
                status: verificationResult.isValid ? 'verified' : 'failed',
                confidence: verificationResult.confidence,
                reason: verificationResult.recommendation,
                timestamp: Date.now()
            });

            // Check if verification passed
            if (verificationResult.isValid && verificationResult.confidence >= VERIFICATION_CONFIDENCE_THRESHOLD) {
                // Success!
                await db.ref(`rules/${safeHostname}/verification`).update({
                    status: 'verified',
                    confidence: verificationResult.confidence,
                    lastUpdated: Date.now()
                });

                log('SUCCESS', 'Rule verified', {
                    hostname,
                    attempt,
                    confidence: verificationResult.confidence
                });
                return;
            }

            // If this was the last attempt, mark as failed
            if (attempt >= MAX_REFINEMENT_ATTEMPTS) {
                await db.ref(`rules/${safeHostname}/verification`).update({
                    status: 'failed',
                    confidence: verificationResult.confidence,
                    lastUpdated: Date.now()
                });

                log('WARN', 'Verification failed after max attempts', {
                    hostname,
                    attempts: attempt
                });
                return;
            }

            // Refine the rule
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
        }

    } catch (error) {
        log('ERROR', 'Verification process failed', {
            hostname,
            error: error.message,
            stack: error.stack
        });

        // Mark as failed in Firebase
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
