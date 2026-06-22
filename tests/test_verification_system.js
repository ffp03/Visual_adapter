/**
 * Test Script for Rule Verification System (v3.1)
 * Tests the verification system on 10 diverse test pages
 * NOW WITH REAL CONTENT EXTRACTION!
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BACKEND_URL = 'http://localhost:7860';

// Selected 10 diverse test pages
const TEST_PAGES = [
    { file: 'samples/shopping/Amazon.mhtml', hostname: 'amazon.com', category: 'E-commerce' },
    { file: 'samples/food/Walmart.mhtml', hostname: 'walmart.com', category: 'Retail' },
    { file: 'samples/clothing/Macy.mhtml', hostname: 'macys.com', category: 'Fashion' },
    { file: 'samples/personal care/Sephora.mhtml', hostname: 'sephora.com', category: 'Beauty' },
    { file: 'samples/food/Costco.mhtml', hostname: 'costco.com', category: 'Wholesale' },
    { file: 'samples/shopping/Best Buy Canada.mhtml', hostname: 'bestbuy.ca', category: 'Electronics' },
    { file: 'samples/house rental/Zillow.mhtml', hostname: 'zillow.com', category: 'Real Estate' },
    { file: 'samples/alcoholic/LCBO.mhtml', hostname: 'lcbo.com', category: 'Liquor' },
    { file: 'samples/extra/IKEA.mhtml', hostname: 'ikea.com', category: 'Furniture' },
    { file: 'samples/shopping/Etsy.mhtml', hostname: 'etsy.com', category: 'Marketplace' }
];

const results = [];

async function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(BACKEND_URL + path);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

/**
 * Apply CSS selector rule to HTML and extract content
 * @param {string} html - Original HTML
 * @param {object} rule - CSS selector rule
 * @returns {string} Extracted HTML
 */
function applyRule(html, rule) {
    try {
        const dom = new JSDOM(html);
        const document = dom.window.document;

        // Find main element
        const mainElement = document.querySelector(rule.main);
        if (!mainElement) {
            console.log(`  ⚠️  Main selector "${rule.main}" not found, using body`);
            return document.body ? document.body.innerHTML : html.substring(0, 5000);
        }

        // Clone the element
        const clone = mainElement.cloneNode(true);

        // Remove excluded elements
        if (rule.exclude && rule.exclude.length > 0) {
            rule.exclude.forEach(selector => {
                try {
                    const elements = clone.querySelectorAll(selector);
                    elements.forEach(el => el.remove());
                } catch (e) {
                    // Invalid selector, skip
                }
            });
        }

        return clone.innerHTML;
    } catch (error) {
        console.log(`  ⚠️  Error applying rule: ${error.message}`);
        return html.substring(0, 5000); // Return truncated HTML as fallback
    }
}

async function testPage(testPage) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing: ${testPage.hostname} (${testPage.category})`);
    console.log(`${'='.repeat(80)}`);

    const result = {
        hostname: testPage.hostname,
        category: testPage.category,
        success: false,
        ruleGenerated: false,
        verificationTriggered: false,
        verificationStatus: null,
        error: null
    };

    try {
        // Read MHTML file
        const filePath = path.join(__dirname, testPage.file);

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const mhtmlContent = fs.readFileSync(filePath, 'utf-8');

        // Extract HTML from MHTML
        const htmlMatch = mhtmlContent.match(/<!DOCTYPE html>[\s\S]*?<\/html>/i);
        const html = htmlMatch ? htmlMatch[0] : mhtmlContent.substring(0, 50000);

        console.log(`✓ Loaded test file (${(html.length / 1024).toFixed(1)}KB)`);

        // Step 1: Generate rule via /analyze endpoint
        console.log('\n[Step 1] Generating rule...');
        const analyzeResponse = await makeRequest('POST', '/analyze', {
            hostname: testPage.hostname,
            html: html
        });

        if (analyzeResponse.status === 200 && analyzeResponse.data.success) {
            result.ruleGenerated = true;
            const rule = analyzeResponse.data.rule;
            console.log(`✓ Rule generated:`);
            console.log(`  Main: ${rule.main}`);
            console.log(`  Exclude: ${rule.exclude ? rule.exclude.length : 0} selectors`);
            console.log(`  Name: ${rule.name}`);

            // Step 2: Apply rule to extract REAL content
            console.log('\n[Step 2] Applying rule to extract content...');
            const extractedHTML = applyRule(html, rule);
            console.log(`✓ Extracted ${(extractedHTML.length / 1024).toFixed(1)}KB of content`);

            // Step 3: Trigger verification with REAL extracted content
            console.log('\n[Step 3] Triggering verification...');

            const verifyResponse = await makeRequest('POST', '/verify', {
                hostname: testPage.hostname,
                rawHTML: html,
                extractedHTML: extractedHTML,
                rule: rule
            });

            if (verifyResponse.status === 200 && verifyResponse.data.success) {
                result.verificationTriggered = true;
                console.log(`✓ Verification started in background`);

                // Step 4: Wait for verification
                console.log('\n[Step 4] Waiting for verification (30 seconds)...');

                await new Promise(resolve => setTimeout(resolve, 30000));

                result.verificationStatus = 'pending';
                console.log(`✓ Verification process initiated`);

                result.success = true;
            } else {
                throw new Error(`Verification failed: ${JSON.stringify(verifyResponse.data)}`);
            }

        } else {
            throw new Error(`Rule generation failed: ${JSON.stringify(analyzeResponse.data)}`);
        }

    } catch (error) {
        result.error = error.message;
        console.error(`✗ Error: ${error.message}`);
    }

    results.push(result);
    return result;
}

async function runTests() {
    console.log('\n' + '='.repeat(80));
    console.log('RULE VERIFICATION SYSTEM - TEST SUITE (WITH REAL EXTRACTION)');
    console.log('='.repeat(80));
    console.log(`Testing ${TEST_PAGES.length} diverse web pages`);
    console.log(`Backend: ${BACKEND_URL}`);
    console.log('='.repeat(80));

    // Check backend health
    console.log('\nChecking backend health...');
    try {
        const healthResponse = await makeRequest('GET', '/health');
        if (healthResponse.status === 200) {
            console.log('✓ Backend is running');
            console.log(`  Version: ${healthResponse.data.version}`);
            console.log(`  Uptime: ${healthResponse.data.uptime}s`);
        } else {
            console.error('✗ Backend health check failed');
            process.exit(1);
        }
    } catch (error) {
        console.error('✗ Cannot connect to backend:', error.message);
        console.error('\nPlease start the backend first:');
        console.error('  cd backend');
        console.error('  node index.js');
        process.exit(1);
    }

    // Run tests
    for (let i = 0; i < TEST_PAGES.length; i++) {
        await testPage(TEST_PAGES[i]);

        // Wait between tests to avoid overwhelming the backend
        if (i < TEST_PAGES.length - 1) {
            console.log('\nWaiting 5 seconds before next test...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));

    const successful = results.filter(r => r.success).length;
    const rulesGenerated = results.filter(r => r.ruleGenerated).length;
    const verificationsTriggered = results.filter(r => r.verificationTriggered).length;

    console.log(`\nTotal Tests: ${results.length}`);
    console.log(`Successful: ${successful} (${(successful / results.length * 100).toFixed(0)}%)`);
    console.log(`Rules Generated: ${rulesGenerated}`);
    console.log(`Verifications Triggered: ${verificationsTriggered}`);

    console.log('\nDetailed Results:');
    results.forEach((r, i) => {
        const status = r.success ? '✓' : '✗';
        console.log(`${i + 1}. ${status} ${r.hostname} (${r.category})`);
        if (r.error) {
            console.log(`   Error: ${r.error}`);
        }
    });

    // Save results to file
    const reportPath = path.join(__dirname, 'verification_test_results_v2.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: {
            total: results.length,
            successful,
            rulesGenerated,
            verificationsTriggered
        },
        results
    }, null, 2));

    console.log(`\n✓ Results saved to: ${reportPath}`);
    console.log('='.repeat(80));
    console.log('\n💡 TIP: Run "node ../backend/check_firebase_results.js" after 5 minutes');
    console.log('   to see the final verification results in Firebase!');
    console.log('='.repeat(80) + '\n');
}

// Run tests
runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
