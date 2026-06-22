/**
 * Quick test: 1 good rule + 1 bad rule
 * Tests API key rotation with minimal load
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BACKEND_URL = 'http://localhost:7860';

// Load test datasets
const goodRules = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_data/good_rules.json'), 'utf-8'));
const badRules = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_data/bad_rules.json'), 'utf-8'));

// Select first valid test from each
const testCases = [
    { ...goodRules[0], category: 'good' },
    { ...badRules[0], category: 'bad' }
];

async function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(BACKEND_URL + path);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method,
            headers: { 'Content-Type': 'application/json' }
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
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

function extractHTMLFromMHTML(filePath) {
    const mhtmlContent = fs.readFileSync(filePath, 'utf-8');
    const htmlMatch = mhtmlContent.match(/<!DOCTYPE html>[\s\S]*?<\/html>/i);
    return htmlMatch ? htmlMatch[0] : mhtmlContent.substring(0, 50000);
}

function applyRule(html, rule) {
    try {
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const mainElement = document.querySelector(rule.main);

        if (!mainElement) {
            return { success: false, error: `Selector "${rule.main}" not found` };
        }

        const clone = mainElement.cloneNode(true);

        if (rule.exclude && rule.exclude.length > 0) {
            rule.exclude.forEach(selector => {
                try {
                    const elements = clone.querySelectorAll(selector);
                    elements.forEach(el => el.remove());
                } catch (e) { }
            });
        }

        return { success: true, content: clone.innerHTML };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function runTest(testCase) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing: ${testCase.id} (${testCase.category})`);
    console.log(`Hostname: ${testCase.hostname}`);
    console.log(`File: ${testCase.file}`);
    console.log('='.repeat(80));

    try {
        // Load HTML
        const filePath = path.join(__dirname, 'samples', testCase.file);
        const html = extractHTMLFromMHTML(filePath);
        console.log(`✓ Loaded HTML (${(html.length / 1024).toFixed(1)}KB)`);

        // Apply rule
        const rule = testCase.rule || testCase.initialRule;
        const extraction = applyRule(html, rule);

        if (!extraction.success) {
            console.log(`✗ Rule application failed: ${extraction.error}`);
            return { success: false, error: extraction.error };
        }

        console.log(`✓ Applied rule (extracted ${(extraction.content.length / 1024).toFixed(1)}KB)`);

        // Trim HTML
        const trimmedRawHTML = html.substring(0, 10000);
        const trimmedExtractedHTML = extraction.content.substring(0, 20000);
        console.log(`✓ Trimmed HTML (raw: ${(trimmedRawHTML.length / 1024).toFixed(1)}KB, extracted: ${(trimmedExtractedHTML.length / 1024).toFixed(1)}KB)`);

        // Trigger verification
        console.log('\nTriggering verification...');
        const verifyResponse = await makeRequest('POST', '/verify', {
            hostname: testCase.hostname,
            rawHTML: trimmedRawHTML,
            extractedHTML: trimmedExtractedHTML,
            rule: rule
        });

        if (verifyResponse.status === 200 && verifyResponse.data.success) {
            console.log('✓ Verification triggered successfully');
            console.log(`  Status: ${verifyResponse.data.verification.status}`);
            return { success: true };
        } else {
            console.log(`✗ Verification failed: ${JSON.stringify(verifyResponse.data)}`);
            return { success: false, error: 'Verification trigger failed' };
        }

    } catch (error) {
        console.log(`✗ Test failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function main() {
    console.log('\n' + '='.repeat(80));
    console.log('QUICK TEST: 1 Good Rule + 1 Bad Rule');
    console.log('='.repeat(80));
    console.log(`Backend: ${BACKEND_URL}`);
    console.log(`Tests: ${testCases.length}`);
    console.log('='.repeat(80));

    // Check backend
    console.log('\nChecking backend health...');
    try {
        const health = await makeRequest('GET', '/health');
        if (health.status === 200) {
            console.log('✓ Backend is running');
            console.log(`  API Keys: ${health.data.apiKeys || 'N/A'}`);
        }
    } catch (error) {
        console.error('✗ Cannot connect to backend');
        process.exit(1);
    }

    // Run tests
    const results = [];
    for (const testCase of testCases) {
        const result = await runTest(testCase);
        results.push({ ...testCase, ...result });
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    const successful = results.filter(r => r.success).length;
    console.log(`✓ Successful: ${successful}/${results.length}`);
    console.log(`✗ Failed: ${results.length - successful}/${results.length}`);

    results.forEach(r => {
        const status = r.success ? '✓' : '✗';
        console.log(`  ${status} ${r.id} (${r.category}): ${r.hostname}`);
        if (r.error) {
            console.log(`     Error: ${r.error}`);
        }
    });

    console.log('\n💡 Wait 5-6 minutes, then check Firebase for verification results');
    console.log('   cd ../backend && node check_firebase_results.js\n');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
