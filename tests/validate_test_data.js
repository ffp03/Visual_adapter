/**
 * Validate Test Datasets
 * Applies each rule to its corresponding page and shows the extracted content
 * This allows manual verification that rules are correctly categorized as good/bad/refinable
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Load test datasets
const goodRules = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_data/good_rules.json'), 'utf-8'));
const badRules = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_data/bad_rules.json'), 'utf-8'));
const refinementCases = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_data/refinement_cases.json'), 'utf-8'));

/**
 * Extract HTML from MHTML file
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

        // Find main element
        const mainElement = document.querySelector(rule.main);
        if (!mainElement) {
            return {
                success: false,
                error: `Main selector "${rule.main}" not found`,
                content: null,
                stats: null
            };
        }

        // Clone the element
        const clone = mainElement.cloneNode(true);
        const originalSize = clone.innerHTML.length;

        // Remove excluded elements
        let excludedCount = 0;
        if (rule.exclude && rule.exclude.length > 0) {
            rule.exclude.forEach(selector => {
                try {
                    const elements = clone.querySelectorAll(selector);
                    excludedCount += elements.length;
                    elements.forEach(el => el.remove());
                } catch (e) {
                    // Invalid selector, skip
                }
            });
        }

        const extractedHTML = clone.innerHTML;
        const finalSize = extractedHTML.length;

        // Get text content for preview
        const textContent = clone.textContent.trim();
        const preview = textContent.substring(0, 500);

        // Calculate stats
        const stats = {
            originalSize,
            finalSize,
            reductionPercent: ((originalSize - finalSize) / originalSize * 100).toFixed(1),
            excludedElements: excludedCount,
            textLength: textContent.length,
            hasImages: clone.querySelectorAll('img').length > 0,
            hasLinks: clone.querySelectorAll('a').length > 0,
            hasParagraphs: clone.querySelectorAll('p').length > 0
        };

        return {
            success: true,
            content: extractedHTML,
            preview,
            stats
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            content: null,
            stats: null
        };
    }
}

/**
 * Validate a single test case
 */
function validateTestCase(testCase, category) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${category}] ${testCase.id}: ${testCase.name}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`File: ${testCase.file}`);
    console.log(`Hostname: ${testCase.hostname}`);
    console.log(`Category: ${testCase.category}`);

    // Load HTML
    const filePath = path.join(__dirname, 'samples', testCase.file);
    if (!fs.existsSync(filePath)) {
        console.log(`❌ ERROR: File not found: ${filePath}`);
        return { valid: false, reason: 'File not found' };
    }

    const html = extractHTMLFromMHTML(filePath);
    console.log(`\n📄 HTML Size: ${(html.length / 1024).toFixed(1)}KB`);

    // Apply rule
    const rule = testCase.rule || testCase.initialRule;
    console.log(`\n🎯 Rule:`);
    console.log(`   Main: ${rule.main}`);
    console.log(`   Exclude: ${rule.exclude ? rule.exclude.length : 0} selectors`);
    if (rule.exclude && rule.exclude.length > 0) {
        console.log(`   Exclusions: ${rule.exclude.slice(0, 3).join(', ')}${rule.exclude.length > 3 ? '...' : ''}`);
    }

    const result = applyRule(html, rule);

    if (!result.success) {
        console.log(`\n❌ EXTRACTION FAILED: ${result.error}`);
        return { valid: false, reason: result.error };
    }

    // Show stats
    console.log(`\n📊 Extraction Stats:`);
    console.log(`   Original Size: ${(result.stats.originalSize / 1024).toFixed(1)}KB`);
    console.log(`   Final Size: ${(result.stats.finalSize / 1024).toFixed(1)}KB`);
    console.log(`   Reduction: ${result.stats.reductionPercent}%`);
    console.log(`   Excluded Elements: ${result.stats.excludedElements}`);
    console.log(`   Text Length: ${result.stats.textLength} chars`);
    console.log(`   Has Images: ${result.stats.hasImages ? '✓' : '✗'}`);
    console.log(`   Has Links: ${result.stats.hasLinks ? '✓' : '✗'}`);
    console.log(`   Has Paragraphs: ${result.stats.hasParagraphs ? '✓' : '✗'}`);

    // Show preview
    console.log(`\n📝 Content Preview (first 500 chars):`);
    console.log(`   ${result.preview.replace(/\n/g, ' ').substring(0, 500)}...`);

    // Analyze quality
    console.log(`\n🔍 Quality Analysis:`);

    const issues = [];
    const strengths = [];

    // Check for common issues
    if (result.stats.textLength < 100) {
        issues.push('Very little text content extracted');
    }
    if (result.stats.reductionPercent < 10) {
        issues.push('Minimal content reduction (may include too much)');
    }
    if (result.stats.reductionPercent > 90) {
        issues.push('Excessive content reduction (may exclude too much)');
    }
    if (!result.stats.hasParagraphs && result.stats.textLength > 500) {
        issues.push('No paragraph tags (might be extracting navigation/lists)');
    }
    if (result.preview.toLowerCase().includes('sign in') ||
        result.preview.toLowerCase().includes('log in') ||
        result.preview.toLowerCase().includes('menu')) {
        issues.push('May include navigation/login elements');
    }

    // Check for strengths
    if (result.stats.textLength > 500 && result.stats.hasParagraphs) {
        strengths.push('Good amount of paragraph content');
    }
    if (result.stats.reductionPercent >= 20 && result.stats.reductionPercent <= 70) {
        strengths.push('Reasonable content reduction');
    }
    if (result.stats.excludedElements > 0) {
        strengths.push(`Successfully excluded ${result.stats.excludedElements} elements`);
    }

    if (strengths.length > 0) {
        console.log(`   ✅ Strengths:`);
        strengths.forEach(s => console.log(`      - ${s}`));
    }

    if (issues.length > 0) {
        console.log(`   ⚠️  Potential Issues:`);
        issues.forEach(i => console.log(`      - ${i}`));
    }

    // Compare with expected
    console.log(`\n🎯 Expected Result:`);
    console.log(`   Status: ${testCase.expected.status}`);
    if (testCase.expected.minConfidence) {
        console.log(`   Min Confidence: ${(testCase.expected.minConfidence * 100).toFixed(0)}%`);
    }
    if (testCase.expected.maxConfidence) {
        console.log(`   Max Confidence: ${(testCase.expected.maxConfidence * 100).toFixed(0)}%`);
    }
    console.log(`   Reason: ${testCase.expected.reason}`);

    // Verdict
    console.log(`\n💡 Manual Review Needed:`);
    if (category === 'GOOD' && issues.length > 0) {
        console.log(`   ⚠️  This is marked as GOOD but has ${issues.length} issue(s)`);
        console.log(`   👉 Review if this should be moved to BAD or REFINEMENT`);
    } else if (category === 'BAD' && issues.length === 0) {
        console.log(`   ⚠️  This is marked as BAD but looks okay`);
        console.log(`   👉 Review if this should be moved to GOOD`);
    } else if (category === 'REFINEMENT') {
        console.log(`   ℹ️  This should improve with refinement`);
        console.log(`   👉 Verify the initial rule is indeed problematic`);
    } else {
        console.log(`   ✓ Classification appears correct`);
    }

    return {
        valid: true,
        stats: result.stats,
        issues,
        strengths
    };
}

/**
 * Main validation function
 */
async function validateAllDatasets() {
    console.log('\n' + '='.repeat(80));
    console.log('TEST DATASET VALIDATION');
    console.log('='.repeat(80));
    console.log('This script applies each rule to its page and shows the extracted content');
    console.log('Review the output to verify rules are correctly categorized\n');

    const results = {
        good: [],
        bad: [],
        refinement: []
    };

    // Validate Good Rules
    console.log('\n\n' + '█'.repeat(80));
    console.log('VALIDATING GOOD RULES (Should extract clean, relevant content)');
    console.log('█'.repeat(80));

    for (const testCase of goodRules) {
        const result = validateTestCase(testCase, 'GOOD');
        results.good.push({ id: testCase.id, ...result });

        // Pause between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Validate Bad Rules
    console.log('\n\n' + '█'.repeat(80));
    console.log('VALIDATING BAD RULES (Should extract poor/wrong content)');
    console.log('█'.repeat(80));

    for (const testCase of badRules) {
        const result = validateTestCase(testCase, 'BAD');
        results.bad.push({ id: testCase.id, ...result });

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Validate Refinement Cases
    console.log('\n\n' + '█'.repeat(80));
    console.log('VALIDATING REFINEMENT CASES (Should show room for improvement)');
    console.log('█'.repeat(80));

    for (const testCase of refinementCases) {
        const result = validateTestCase(testCase, 'REFINEMENT');
        results.refinement.push({ id: testCase.id, ...result });

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(80));

    const goodValid = results.good.filter(r => r.valid).length;
    const badValid = results.bad.filter(r => r.valid).length;
    const refineValid = results.refinement.filter(r => r.valid).length;

    console.log(`\nGood Rules: ${goodValid}/${goodRules.length} successfully extracted`);
    console.log(`Bad Rules: ${badValid}/${badRules.length} successfully extracted`);
    console.log(`Refinement Cases: ${refineValid}/${refinementCases.length} successfully extracted`);

    // Issues found
    const goodWithIssues = results.good.filter(r => r.issues && r.issues.length > 0);
    const badWithoutIssues = results.bad.filter(r => r.issues && r.issues.length === 0);

    if (goodWithIssues.length > 0) {
        console.log(`\n⚠️  ${goodWithIssues.length} GOOD rules have potential issues:`);
        goodWithIssues.forEach(r => console.log(`   - ${r.id}`));
    }

    if (badWithoutIssues.length > 0) {
        console.log(`\n⚠️  ${badWithoutIssues.length} BAD rules look okay:`);
        badWithoutIssues.forEach(r => console.log(`   - ${r.id}`));
    }

    console.log('\n💡 Review the output above to verify each rule is correctly categorized');
    console.log('='.repeat(80) + '\n');

    // Save summary
    const summaryPath = path.join(__dirname, 'test_data/validation_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
    console.log(`✓ Detailed summary saved to: ${summaryPath}\n`);
}

// Run validation
validateAllDatasets().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
