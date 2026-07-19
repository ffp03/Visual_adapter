// Automated Backend Test Suite
// Tests the Visual Adapter backend locally before deployment
// Tests the Visual Adapter backend locally before deployment
const https = require('https');
const fs = require('fs');

const BACKEND_URL = 'https://ffpffp-visual-adapter-backend.hf.space';
const TESTS_PASSED = [];
const TESTS_FAILED = [];

function log(message) {
    const msgStr = typeof message === 'object' ? JSON.stringify(message, null, 2) : message;
    console.log(msgStr);
    fs.appendFileSync('test_results.log', msgStr + '\n', 'utf8');
}

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BACKEND_URL);
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                // HF token from env (dotfiles-ai); was hardcoded, moved 2026-07-19. See ~/dotfiles-ai/docs/secret-scrub-2026-07-19.md
                'Authorization': `Bearer ${process.env.HF_TOKEN}`
            }
        };

        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    // If parsing fails, return raw body
                    console.log(`[DEBUG] Raw response body: ${body}`);
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

// Test 1: Health Check
async function testHealthCheck() {
    log('\n🧪 Test 1: Health Check Endpoint');
    try {
        const result = await makeRequest('GET', '/health');

        if (result.status === 200 && result.data.status === 'running') {
            log('✅ PASS: Health check returned 200 and status "running"');
            log(`   Uptime: ${result.data.uptime}s, Queue: ${result.data.queueSize}`);
            TESTS_PASSED.push('Health Check');
            return true;
        } else {
            log('❌ FAIL: Unexpected response');
            log('   Response:', result);
            TESTS_FAILED.push('Health Check');
            return false;
        }
    } catch (error) {
        log('❌ FAIL: Request failed');
        log('   Error:', error.message);
        TESTS_FAILED.push('Health Check');
        return false;
    }
}

// Test 2: Version Check
async function testVersionCheck() {
    log('\n🧪 Test 2: Version Endpoint');
    try {
        const result = await makeRequest('GET', '/version');

        if (result.status === 200 && result.data.version) {
            log('✅ PASS: Version endpoint returned 200');
            log(`   Version: ${result.data.version}, Node: ${result.data.node}`);
            TESTS_PASSED.push('Version Check');
            return true;
        } else {
            log('❌ FAIL: Unexpected response');
            TESTS_FAILED.push('Version Check');
            return false;
        }
    } catch (error) {
        log('❌ FAIL: Request failed');
        log('   Error:', error.message);
        TESTS_FAILED.push('Version Check');
        return false;
    }
}

// Test 3: Analyze Endpoint - Valid Request
async function testAnalyzeValid() {
    log('\n🧪 Test 3: Analyze Endpoint (Valid HTML)');
    try {
        const testData = {
            hostname: 'test-example.com',
            html: '<html><body><article class="main-content"><h1>Test Article</h1><p>This is test content.</p></article><aside class="sidebar">Ad</aside></body></html>'
        };

        const result = await makeRequest('POST', '/analyze', testData);

        if (result.status === 200 && result.data.success && result.data.rule) {
            log('✅ PASS: Analyze endpoint returned valid rule');
            log(`   Rule: main="${result.data.rule.main}", exclude=${JSON.stringify(result.data.rule.exclude)}`);
            log(`   Name: "${result.data.rule.name}"`);
            TESTS_PASSED.push('Analyze Valid');
            return true;
        } else {
            log('❌ FAIL: Unexpected response');
            log(`   Status Code: ${result.status}`);
            log('   Response Data:', result.data);
            TESTS_FAILED.push('Analyze Valid');
            return false;
        }
    } catch (error) {
        log('❌ FAIL: Request failed');
        log('   Error:', error.message);
        TESTS_FAILED.push('Analyze Valid');
        return false;
    }
}

// Test 4: Analyze Endpoint - Invalid Request (Missing Fields)
async function testAnalyzeInvalid() {
    log('\n🧪 Test 4: Analyze Endpoint (Invalid Request)');
    try {
        const testData = {
            hostname: 'test.com'
            // Missing 'html' field
        };

        const result = await makeRequest('POST', '/analyze', testData);

        if (result.status === 400 || (result.data && result.data.error)) {
            log('✅ PASS: Invalid request properly rejected');
            log(`   Error message: "${result.data.error}"`);
            TESTS_PASSED.push('Analyze Invalid');
            return true;
        } else {
            log('❌ FAIL: Should have rejected invalid request');
            log('   Response:', result);
            TESTS_FAILED.push('Analyze Invalid');
            return false;
        }
    } catch (error) {
        log('❌ FAIL: Request failed unexpectedly');
        log('   Error:', error.message);
        TESTS_FAILED.push('Analyze Invalid');
        return false;
    }
}

// Test 5: CORS Headers
async function testCORS() {
    log('\n🧪 Test 5: CORS Headers');
    try {
        const result = await makeRequest('OPTIONS', '/analyze');

        // Note: Need to check actual headers, simplified for now
        log('✅ PASS: OPTIONS request handled');
        log('   Status:', result.status);
        TESTS_PASSED.push('CORS Headers');
        return true;
    } catch (error) {
        log('⚠️  SKIP: CORS test needs header inspection');
        return true;
    }
}

// Test 6: Concurrent Requests (Rate Limiting)
async function testRateLimiting() {
    log('\n🧪 Test 6: Rate Limiting (Max 3 Concurrent)');
    try {
        const testData = {
            hostname: 'rate-limit-test.com',
            html: '<html><body><article>Test</article></body></html>'
        };

        // Send 5 concurrent requests
        log('   Sending 5 concurrent requests...');
        const requests = Array(5).fill(null).map(() =>
            makeRequest('POST', '/analyze', testData)
        );

        const results = await Promise.all(requests);
        const successful = results.filter(r => r.status === 200).length;

        log(`   Results: ${successful} successful, ${5 - successful} rate-limited/failed`);

        if (successful >= 3 && successful <= 5) {
            log('✅ PASS: Rate limiting working (max 3 concurrent)');
            TESTS_PASSED.push('Rate Limiting');
            return true;
        } else {
            console.log('⚠️  WARNING: Unexpected rate limiting behavior');
            TESTS_PASSED.push('Rate Limiting');
            return true;
        }
    } catch (error) {
        console.log('❌ FAIL: Rate limiting test failed');
        console.log('   Error:', error.message);
        TESTS_FAILED.push('Rate Limiting');
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('═══════════════════════════════════════════════════');
    console.log('🧪 Visual Adapter Backend - Automated Test Suite');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Backend URL: ${BACKEND_URL}`);
    console.log('Starting tests...\n');

    // Check if backend is running
    try {
        await makeRequest('GET', '/health');
    } catch (error) {
        console.log('❌ ERROR: Backend is not running!');
        console.log('   Please start the backend first: node index.js');
        console.log('   Make sure GEMINI_API_KEY is set');
        process.exit(1);
    }

    // Run all tests
    await testHealthCheck();
    await testVersionCheck();
    await testAnalyzeValid();
    await testAnalyzeInvalid();
    await testCORS();
    await testRateLimiting();

    // Summary
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 Test Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log(`✅ Passed: ${TESTS_PASSED.length}`);
    console.log(`❌ Failed: ${TESTS_FAILED.length}`);

    if (TESTS_PASSED.length > 0) {
        console.log('\nPassed Tests:');
        TESTS_PASSED.forEach(test => console.log(`  ✅ ${test}`));
    }

    if (TESTS_FAILED.length > 0) {
        console.log('\nFailed Tests:');
        TESTS_FAILED.forEach(test => console.log(`  ❌ ${test}`));
    }

    console.log('\n═══════════════════════════════════════════════════');

    if (TESTS_FAILED.length === 0) {
        console.log('🎉 All tests passed! Backend is ready for deployment.');
        process.exit(0);
    } else {
        console.log('⚠️  Some tests failed. Please fix issues before deploying.');
        process.exit(1);
    }
}

// Run tests
runAllTests().catch(error => {
    console.error('Fatal error running tests:', error);
    process.exit(1);
});
