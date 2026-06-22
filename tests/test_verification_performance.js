/**
 * Automated Performance Test Runner for Rule Verification System
 * 
 * This script:
 * 1. Loads all test datasets (good/bad/refinement)
 * 2. Applies each rule to its corresponding page
 * 3. Sends rules for verification via backend
 * 4. Monitors Firebase for verification results
 * 5. Calculates performance metrics
 * 6. Generates comprehensive report
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BACKEND_URL = 'http://localhost:7860';
const FIREBASE_CHECK_INTERVAL = 10000; // 10 seconds
const MAX_WAIT_TIME = 360000; // 6 minutes

// Load test datasets
const goodRules = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_data/good_rules.json'), 'utf-8'));
const badRules = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_data/bad_rules.json'), 'utf-8'));
const refinementCases = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_data/refinement_cases.json'), 'utf-8'));

/**
 * Make HTTP request
 */
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

/**
 * Extract HTML from MHTML
 */
function extractHTMLFromMHTML(filePath) {
    const mhtmlContent = fs.readFileSync(filePath, 'utf-8');
    const htmlMatch = mhtmlContent.match(/<!DOCTYPE html>[\s\S]*?<\/html>/i);
    return htmlMatch ? htmlMatch[0] : mhtmlContent.substring(0, 50000);
}

/**
 * Apply CSS selector rule to HTML
 */
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

/**
 * Check Firebase for verification status
 */
async function checkFirebaseStatus(hostname) {
    // This would normally use Firebase SDK, but for now we'll simulate
    // In real implementation, this would query Firebase Realtime Database
    return { status: 'pending', attempts: 0, confidence: 0 };
}

/**
 * Run a single test case
 */
async function runTestCase(testCase, category) {
    const startTime = Date.now();
    const result = {
        id: testCase.id,
        category,
        hostname: testCase.hostname,
        file: testCase.file,
        success: false,
        error: null,
        metrics: {
            ruleApplicationTime: 0,
            verificationTriggerTime: 0,
            totalTime: 0
        },
        verification: null,
        expected: testCase.expected
    };

    try {
        // Load HTML
        const filePath = path.join(__dirname, 'samples', testCase.file);
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const html = extractHTMLFromMHTML(filePath);

        // Apply rule
        const ruleStart = Date.now();
        const rule = testCase.rule || testCase.initialRule;
        const extraction = applyRule(html, rule);
        result.metrics.ruleApplicationTime = Date.now() - ruleStart;

        if (!extraction.success) {
            throw new Error(`Rule application failed: ${extraction.error}`);
        }

        // Trigger verification
        const verifyStart = Date.now();

        // Trim HTML to prevent API quota issues
        const trimmedRawHTML = html.substring(0, 10000); // 10KB max
        const trimmedExtractedHTML = extraction.content.substring(0, 20000); // 20KB max

        const verifyResponse = await makeRequest('POST', '/verify', {
            hostname: testCase.hostname,
            rawHTML: trimmedRawHTML,
            extractedHTML: trimmedExtractedHTML,
            rule: rule
        });
        result.metrics.verificationTriggerTime = Date.now() - verifyStart;

        if (verifyResponse.status !== 200 || !verifyResponse.data.success) {
            throw new Error(`Verification trigger failed: ${JSON.stringify(verifyResponse.data)}`);
        }

        result.success = true;
        result.verification = {
            triggered: true,
            status: 'pending'
        };

    } catch (error) {
        result.error = error.message;
    }

    result.metrics.totalTime = Date.now() - startTime;
    return result;
}

/**
 * Calculate performance metrics
 */
function calculateMetrics(results) {
    const metrics = {
        accuracy: {
            totalTests: results.length,
            successful: 0,
            failed: 0,
            truePositives: 0,
            trueNegatives: 0,
            falsePositives: 0,
            falseNegatives: 0
        },
        performance: {
            avgRuleApplicationTime: 0,
            avgVerificationTriggerTime: 0,
            avgTotalTime: 0,
            minTime: Infinity,
            maxTime: 0
        },
        byCategory: {
            good: { total: 0, successful: 0, failed: 0 },
            bad: { total: 0, successful: 0, failed: 0 },
            refinement: { total: 0, successful: 0, failed: 0 }
        }
    };

    let totalRuleTime = 0;
    let totalVerifyTime = 0;
    let totalTime = 0;

    results.forEach(r => {
        // Count by category
        metrics.byCategory[r.category].total++;
        if (r.success) {
            metrics.byCategory[r.category].successful++;
            metrics.accuracy.successful++;
        } else {
            metrics.byCategory[r.category].failed++;
            metrics.accuracy.failed++;
        }

        // Performance metrics
        if (r.metrics) {
            totalRuleTime += r.metrics.ruleApplicationTime;
            totalVerifyTime += r.metrics.verificationTriggerTime;
            totalTime += r.metrics.totalTime;

            metrics.performance.minTime = Math.min(metrics.performance.minTime, r.metrics.totalTime);
            metrics.performance.maxTime = Math.max(metrics.performance.maxTime, r.metrics.totalTime);
        }
    });

    // Calculate averages
    const successfulCount = metrics.accuracy.successful;
    if (successfulCount > 0) {
        metrics.performance.avgRuleApplicationTime = totalRuleTime / successfulCount;
        metrics.performance.avgVerificationTriggerTime = totalVerifyTime / successfulCount;
        metrics.performance.avgTotalTime = totalTime / successfulCount;
    }

    return metrics;
}

/**
 * Generate report
 */
function generateReport(results, metrics) {
    const report = [];

    report.push('='.repeat(80));
    report.push('RULE VERIFICATION SYSTEM - PERFORMANCE TEST REPORT');
    report.push('='.repeat(80));
    report.push(`Test Date: ${new Date().toISOString()}`);
    report.push(`Total Tests: ${metrics.accuracy.totalTests}`);
    report.push('');

    // Summary
    report.push('SUMMARY');
    report.push('-'.repeat(80));
    report.push(`✓ Successful: ${metrics.accuracy.successful} (${(metrics.accuracy.successful / metrics.accuracy.totalTests * 100).toFixed(1)}%)`);
    report.push(`✗ Failed: ${metrics.accuracy.failed} (${(metrics.accuracy.failed / metrics.accuracy.totalTests * 100).toFixed(1)}%)`);
    report.push('');

    // By Category
    report.push('RESULTS BY CATEGORY');
    report.push('-'.repeat(80));
    Object.entries(metrics.byCategory).forEach(([cat, stats]) => {
        const successRate = stats.total > 0 ? (stats.successful / stats.total * 100).toFixed(1) : 0;
        report.push(`${cat.toUpperCase()}: ${stats.successful}/${stats.total} (${successRate}%)`);
    });
    report.push('');

    // Performance
    report.push('PERFORMANCE METRICS');
    report.push('-'.repeat(80));
    report.push(`Avg Rule Application: ${metrics.performance.avgRuleApplicationTime.toFixed(0)}ms`);
    report.push(`Avg Verification Trigger: ${metrics.performance.avgVerificationTriggerTime.toFixed(0)}ms`);
    report.push(`Avg Total Time: ${metrics.performance.avgTotalTime.toFixed(0)}ms`);
    report.push(`Min Time: ${metrics.performance.minTime}ms`);
    report.push(`Max Time: ${metrics.performance.maxTime}ms`);
    report.push('');

    // Detailed Results
    report.push('DETAILED RESULTS');
    report.push('-'.repeat(80));

    ['good', 'bad', 'refinement'].forEach(category => {
        const categoryResults = results.filter(r => r.category === category);
        report.push(`\n${category.toUpperCase()} RULES:`);

        categoryResults.forEach(r => {
            const status = r.success ? '✓' : '✗';
            report.push(`  ${status} ${r.id}: ${r.hostname}`);
            if (r.error) {
                report.push(`     Error: ${r.error}`);
            }
            if (r.metrics && r.success) {
                report.push(`     Time: ${r.metrics.totalTime}ms`);
            }
        });
    });

    report.push('');
    report.push('='.repeat(80));
    report.push('NOTE: Verification results will be available in Firebase after 5-6 minutes');
    report.push('Run check_firebase_results.js to see final verification status');
    report.push('='.repeat(80));

    return report.join('\n');
}

/**
 * Main test runner
 */
async function runPerformanceTests() {
    console.log('\n' + '='.repeat(80));
    console.log('RULE VERIFICATION SYSTEM - PERFORMANCE TEST RUNNER');
    console.log('='.repeat(80));
    console.log(`Backend: ${BACKEND_URL}`);
    console.log(`Total Tests: ${goodRules.length + badRules.length + refinementCases.length}`);
    console.log('='.repeat(80) + '\n');

    // Check backend health
    console.log('Checking backend health...');
    try {
        const health = await makeRequest('GET', '/health');
        if (health.status === 200) {
            console.log('✓ Backend is running\n');
        } else {
            throw new Error('Backend health check failed');
        }
    } catch (error) {
        console.error('✗ Cannot connect to backend:', error.message);
        console.error('\nPlease start the backend first:');
        console.error('  cd backend');
        console.error('  node index.js');
        process.exit(1);
    }

    const allResults = [];

    // Run Good Rules tests
    console.log('Testing GOOD RULES...');
    for (const testCase of goodRules) {
        process.stdout.write(`  ${testCase.id}...`);
        const result = await runTestCase(testCase, 'good');
        allResults.push(result);
        console.log(result.success ? ' ✓' : ' ✗');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Delay between tests
    }

    // Run Bad Rules tests
    console.log('\nTesting BAD RULES...');
    for (const testCase of badRules) {
        process.stdout.write(`  ${testCase.id}...`);
        const result = await runTestCase(testCase, 'bad');
        allResults.push(result);
        console.log(result.success ? ' ✓' : ' ✗');
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Run Refinement tests
    console.log('\nTesting REFINEMENT CASES...');
    for (const testCase of refinementCases) {
        process.stdout.write(`  ${testCase.id}...`);
        const result = await runTestCase(testCase, 'refinement');
        allResults.push(result);
        console.log(result.success ? ' ✓' : ' ✗');
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Calculate metrics
    console.log('\nCalculating metrics...');
    const metrics = calculateMetrics(allResults);

    // Generate report
    const report = generateReport(allResults, metrics);
    console.log('\n' + report);

    // Save results
    const resultsPath = path.join(__dirname, 'test_data/performance_test_results.json');
    fs.writeFileSync(resultsPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        metrics,
        results: allResults
    }, null, 2));

    const reportPath = path.join(__dirname, 'test_data/performance_test_report.txt');
    fs.writeFileSync(reportPath, report);

    console.log(`\n✓ Results saved to: ${resultsPath}`);
    console.log(`✓ Report saved to: ${reportPath}`);
    console.log('\n💡 Wait 5-6 minutes, then run:');
    console.log('   cd ../backend && node check_firebase_results.js');
    console.log('   to see final verification results\n');
}

// Run tests
runPerformanceTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
