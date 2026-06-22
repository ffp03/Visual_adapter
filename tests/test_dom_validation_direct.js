/**
 * Direct DOM Validation Test
 * Tests the DOM validation function directly without Firebase
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Load test cases
const testCases = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'test_data', 'dom_validation_cases.json'), 'utf8')
);

console.log('\n================================================================================');
console.log('P0: DOM VALIDATION TEST (Direct)');
console.log('================================================================================\n');

// Copy the DOM validation logic from backend
function validateExtractionDOM(rawHTML, extractedHTML, rule) {
    try {
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

        // Determine method
        const method = (confidence >= 0.7 || confidence <= 0.3) ? 'dom-only' : 'llm-verified';

        return {
            isValid: confidence >= 0.6,
            confidence: parseFloat(confidence.toFixed(2)),
            method,
            metrics: {
                textRatio: parseFloat(textRatio.toFixed(3)),
                paragraphRatio: parseFloat(paragraphRatio.toFixed(3)),
                headingRatio: parseFloat(headingRatio.toFixed(3)),
                hasNav,
                hasAds,
                hasScripts
            },
            issues,
            strengths
        };

    } catch (error) {
        return {
            isValid: false,
            confidence: 0,
            method: 'error',
            error: error.message
        };
    }
}

function runTests() {
    const results = {
        total: testCases.length,
        passed: 0,
        failed: 0,
        tokensSaved: 0,
        tokensUsed: 0,
        details: []
    };

    for (const testCase of testCases) {
        console.log(`\nTesting: ${testCase.id} - ${testCase.name}`);
        console.log(`Expected: confidence=${testCase.expectedDOMConfidence}, method=${testCase.expectedDOMMethod}`);

        const result = validateExtractionDOM(
            testCase.rawHTML,
            testCase.extractedHTML,
            testCase.rule
        );

        console.log(`Actual:   confidence=${result.confidence}, method=${result.method}`);

        // Validate results
        const confidenceMatch = Math.abs(result.confidence - testCase.expectedDOMConfidence) <= 0.15;
        const methodMatch = result.method === testCase.expectedDOMMethod;

        // Calculate tokens
        const tokensUsed = result.method === 'dom-only' ? 0 : 4300;
        const tokensSaved = result.method === 'dom-only' ? 4300 : 0;

        results.tokensUsed += tokensUsed;
        results.tokensSaved += tokensSaved;

        const testPassed = confidenceMatch && methodMatch;
        if (testPassed) {
            results.passed++;
            console.log(`✅ PASS`);
        } else {
            results.failed++;
            console.log(`❌ FAIL`);
            if (!confidenceMatch) {
                console.log(`   Confidence mismatch: expected ${testCase.expectedDOMConfidence}, got ${result.confidence} (diff: ${Math.abs(result.confidence - testCase.expectedDOMConfidence).toFixed(2)})`);
            }
            if (!methodMatch) {
                console.log(`   Method mismatch: expected ${testCase.expectedDOMMethod}, got ${result.method}`);
            }
        }

        console.log(`   Tokens: ${tokensUsed} used, ${tokensSaved} saved`);
        console.log(`   Metrics: text=${(result.metrics.textRatio * 100).toFixed(1)}%, para=${(result.metrics.paragraphRatio * 100).toFixed(1)}%, heading=${(result.metrics.headingRatio * 100).toFixed(1)}%`);
        if (result.issues.length > 0) {
            console.log(`   Issues: ${result.issues.join('; ')}`);
        }
        if (result.strengths.length > 0) {
            console.log(`   Strengths: ${result.strengths.join('; ')}`);
        }

        results.details.push({
            id: testCase.id,
            passed: testPassed,
            actualConfidence: result.confidence,
            expectedConfidence: testCase.expectedDOMConfidence,
            actualMethod: result.method,
            expectedMethod: testCase.expectedDOMMethod,
            tokensUsed,
            tokensSaved,
            metrics: result.metrics
        });
    }

    // Print summary
    console.log('\n================================================================================');
    console.log('TEST SUMMARY');
    console.log('================================================================================');
    console.log(`Total tests: ${results.total}`);
    console.log(`Passed: ${results.passed} (${((results.passed / results.total) * 100).toFixed(1)}%)`);
    console.log(`Failed: ${results.failed}`);
    console.log(`\nToken Usage:`);
    console.log(`  Tokens used: ${results.tokensUsed}`);
    console.log(`  Tokens saved: ${results.tokensSaved}`);
    const totalTokens = results.tokensUsed + results.tokensSaved;
    console.log(`  Savings: ${totalTokens > 0 ? ((results.tokensSaved / totalTokens) * 100).toFixed(1) : 0}%`);
    console.log(`\nSuccess Criteria:`);
    const accuracyPass = results.passed >= results.total * 0.8;
    const savingsPass = totalTokens > 0 && results.tokensSaved >= totalTokens * 0.8;
    console.log(`  ✓ Accuracy ≥80%: ${accuracyPass ? '✅ PASS' : '❌ FAIL'} (${((results.passed / results.total) * 100).toFixed(1)}%)`);
    console.log(`  ✓ Token savings ≥80%: ${savingsPass ? '✅ PASS' : '❌ FAIL'} (${totalTokens > 0 ? ((results.tokensSaved / totalTokens) * 100).toFixed(1) : 0}%)`);

    // Save results
    fs.writeFileSync(
        path.join(__dirname, 'dom_validation_test_results.json'),
        JSON.stringify(results, null, 2)
    );
    console.log(`\n📊 Results saved to: dom_validation_test_results.json`);

    return results;
}

// Run tests
runTests();
