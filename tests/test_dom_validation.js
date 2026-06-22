/**
 * Test DOM-based validation (P0)
 * 
 * Tests the validateExtractionDOM function to ensure:
 * 1. Accurate confidence scoring
 * 2. Correct method selection (DOM-only vs LLM)
 * 3. Token savings (80%+ use DOM only)
 */

const fs = require('fs');
const path = require('path');

// Load test cases
const testCases = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'test_data', 'dom_validation_cases.json'), 'utf8')
);

console.log('\n================================================================================');
console.log('P0: DOM VALIDATION TEST');
console.log('================================================================================\n');

async function testDOMValidation() {
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
        console.log(`Expected confidence: ${testCase.expectedDOMConfidence}`);
        console.log(`Expected method: ${testCase.expectedDOMMethod}`);

        try {
            // Call backend verification endpoint
            const response = await fetch('http://localhost:7860/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hostname: testCase.hostname,
                    rawHTML: testCase.rawHTML,
                    extractedHTML: testCase.extractedHTML,
                    rule: testCase.rule
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            const result = await response.json();
            console.log(`✓ Verification triggered`);

            // Wait for verification to complete (check Firebase)
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second wait

            // Check Firebase for results
            const fbResponse = await fetch(`https://visual-adapter-default-rtdb.firebaseio.com/rules/${testCase.hostname.replace(/\\./g, '_')}/verification.json`);
            const verification = await fbResponse.json();

            if (!verification) {
                console.log(`⚠ No verification results yet, skipping...`);
                continue;
            }

            const actualConfidence = verification.confidence || 0;
            const actualMethod = verification.method || 'unknown';

            // Validate results
            const confidenceMatch = Math.abs(actualConfidence - testCase.expectedDOMConfidence) <= 0.15;
            const methodMatch = actualMethod === testCase.expectedDOMMethod;

            // Calculate tokens
            const tokensUsed = actualMethod === 'dom-only' ? 0 : 4300;
            const tokensSaved = actualMethod === 'dom-only' ? 4300 : 0;

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
                    console.log(`   Expected confidence: ${testCase.expectedDOMConfidence}, got: ${actualConfidence}`);
                }
                if (!methodMatch) {
                    console.log(`   Expected method: ${testCase.expectedDOMMethod}, got: ${actualMethod}`);
                }
            }

            console.log(`   Confidence: ${actualConfidence.toFixed(2)}`);
            console.log(`   Method: ${actualMethod}`);
            console.log(`   Tokens: ${tokensUsed} (saved: ${tokensSaved})`);

            results.details.push({
                id: testCase.id,
                passed: testPassed,
                actualConfidence,
                expectedConfidence: testCase.expectedDOMConfidence,
                actualMethod,
                expectedMethod: testCase.expectedDOMMethod,
                tokensUsed,
                tokensSaved
            });

        } catch (error) {
            console.log(`❌ ERROR: ${error.message}`);
            results.failed++;
            results.details.push({
                id: testCase.id,
                passed: false,
                error: error.message
            });
        }
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
    console.log(`  Savings: ${((results.tokensSaved / (results.tokensUsed + results.tokensSaved)) * 100).toFixed(1)}%`);
    console.log(`\nSuccess Criteria:`);
    console.log(`  ✓ Accuracy ≥80%: ${results.passed >= results.total * 0.8 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  ✓ Token savings ≥80%: ${results.tokensSaved >= (results.tokensUsed + results.tokensSaved) * 0.8 ? '✅ PASS' : '❌ FAIL'}`);

    // Save results
    fs.writeFileSync(
        path.join(__dirname, 'dom_validation_test_results.json'),
        JSON.stringify(results, null, 2)
    );
    console.log(`\n📊 Results saved to: dom_validation_test_results.json`);

    return results;
}

// Run tests
testDOMValidation().catch(console.error);
