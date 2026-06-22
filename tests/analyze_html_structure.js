/**
 * Analyze MHTML files to find valid CSS selectors
 * This script inspects the HTML structure and suggests appropriate selectors
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

/**
 * Extract HTML from MHTML file
 */
function extractHTMLFromMHTML(filePath) {
    const mhtmlContent = fs.readFileSync(filePath, 'utf-8');
    const htmlMatch = mhtmlContent.match(/<!DOCTYPE html>[\s\S]*?<\/html>/i);
    return htmlMatch ? htmlMatch[0] : mhtmlContent.substring(0, 50000);
}

/**
 * Analyze HTML structure and suggest selectors
 */
function analyzeHTML(html, hostname) {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const analysis = {
        hostname,
        suggestions: {
            main: [],
            exclude: []
        },
        structure: {
            hasMain: false,
            hasArticle: false,
            hasBody: true,
            commonIds: [],
            commonClasses: [],
            dataAttributes: []
        }
    };

    // Check for semantic elements
    if (document.querySelector('main')) {
        analysis.structure.hasMain = true;
        analysis.suggestions.main.push('main');
    }
    if (document.querySelector('article')) {
        analysis.structure.hasArticle = true;
        analysis.suggestions.main.push('article');
    }

    // Find elements with IDs that might be content containers
    const contentIds = ['content', 'main-content', 'maincontent', 'page-content',
        'primary', 'wrapper', 'container', 'root', 'app'];
    contentIds.forEach(id => {
        if (document.querySelector(`#${id}`)) {
            analysis.structure.commonIds.push(`#${id}`);
            analysis.suggestions.main.push(`#${id}`);
        }
    });

    // Find elements with classes that might be content containers
    const contentClasses = ['content', 'main-content', 'page-content', 'container',
        'wrapper', 'product-list', 'search-results', 'listing'];
    contentClasses.forEach(cls => {
        if (document.querySelector(`.${cls}`)) {
            analysis.structure.commonClasses.push(`.${cls}`);
            // Only suggest if it's a significant element
            const el = document.querySelector(`.${cls}`);
            if (el && el.innerHTML.length > 1000) {
                analysis.suggestions.main.push(`.${cls}`);
            }
        }
    });

    // Check for data attributes
    const dataAttrs = ['data-testid', 'data-component', 'data-automation'];
    dataAttrs.forEach(attr => {
        const elements = document.querySelectorAll(`[${attr}]`);
        if (elements.length > 0) {
            analysis.structure.dataAttributes.push(attr);
        }
    });

    // Suggest exclusions
    const excludeSelectors = [
        { selector: 'header', exists: !!document.querySelector('header') },
        { selector: 'footer', exists: !!document.querySelector('footer') },
        { selector: 'nav', exists: !!document.querySelector('nav') },
        { selector: 'aside', exists: !!document.querySelector('aside') },
        { selector: '[role="navigation"]', exists: !!document.querySelector('[role="navigation"]') },
        { selector: '[class*="ad"]', exists: !!document.querySelector('[class*="ad"]') },
        { selector: '[id*="ad"]', exists: !!document.querySelector('[id*="ad"]') },
        { selector: 'iframe', exists: !!document.querySelector('iframe') },
        { selector: '[class*="modal"]', exists: !!document.querySelector('[class*="modal"]') },
        { selector: '[class*="popup"]', exists: !!document.querySelector('[class*="popup"]') },
        { selector: '.cookie-banner', exists: !!document.querySelector('.cookie-banner') }
    ];

    analysis.suggestions.exclude = excludeSelectors
        .filter(s => s.exists)
        .map(s => s.selector);

    return analysis;
}

/**
 * Analyze a specific MHTML file
 */
function analyzeFile(file, hostname) {
    const filePath = path.join(__dirname, 'samples', file);

    if (!fs.existsSync(filePath)) {
        return { error: `File not found: ${filePath}` };
    }

    const html = extractHTMLFromMHTML(filePath);
    return analyzeHTML(html, hostname);
}

// Files to analyze (from test data)
const filesToAnalyze = [
    { file: 'shopping/Amazon.mhtml', hostname: 'amazon.com' },
    { file: 'personal care/Sephora.mhtml', hostname: 'sephora.com' },
    { file: 'house rental/Zillow.mhtml', hostname: 'zillow.com' },
    { file: 'extra/IKEA.mhtml', hostname: 'ikea.com' },
    { file: 'food/Costco.mhtml', hostname: 'costco.com' },
    { file: 'shopping/Best Buy Canada.mhtml', hostname: 'bestbuy.ca' },
    { file: 'shopping/Etsy.mhtml', hostname: 'etsy.com' },
    { file: 'alcoholic/LCBO.mhtml', hostname: 'lcbo.com' },
    { file: 'food/Walmart.mhtml', hostname: 'walmart.com' },
    { file: 'clothing/Macy.mhtml', hostname: 'macys.com' }
];

console.log('\n' + '='.repeat(80));
console.log('HTML STRUCTURE ANALYSIS');
console.log('='.repeat(80));
console.log('Analyzing MHTML files to find valid CSS selectors\n');

const results = {};

filesToAnalyze.forEach(({ file, hostname }) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Analyzing: ${hostname}`);
    console.log(`File: ${file}`);
    console.log(`${'='.repeat(80)}`);

    const analysis = analyzeFile(file, hostname);

    if (analysis.error) {
        console.log(`❌ ${analysis.error}`);
        return;
    }

    results[hostname] = analysis;

    console.log('\n📊 Structure:');
    console.log(`   Has <main>: ${analysis.structure.hasMain ? '✓' : '✗'}`);
    console.log(`   Has <article>: ${analysis.structure.hasArticle ? '✓' : '✗'}`);
    console.log(`   Common IDs: ${analysis.structure.commonIds.join(', ') || 'none'}`);
    console.log(`   Common Classes: ${analysis.structure.commonClasses.slice(0, 5).join(', ') || 'none'}`);
    console.log(`   Data Attributes: ${analysis.structure.dataAttributes.join(', ') || 'none'}`);

    console.log('\n🎯 Suggested Main Selectors:');
    if (analysis.suggestions.main.length > 0) {
        analysis.suggestions.main.slice(0, 5).forEach(s => console.log(`   - ${s}`));
    } else {
        console.log('   ⚠️  No good selectors found - may need to use body');
    }

    console.log('\n🚫 Suggested Exclusions:');
    if (analysis.suggestions.exclude.length > 0) {
        analysis.suggestions.exclude.slice(0, 10).forEach(s => console.log(`   - ${s}`));
    } else {
        console.log('   ℹ️  No common exclusion elements found');
    }
});

// Save results
const outputPath = path.join(__dirname, 'test_data/html_analysis.json');
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.log('\n' + '='.repeat(80));
console.log('ANALYSIS COMPLETE');
console.log('='.repeat(80));
console.log(`\n✓ Results saved to: ${outputPath}`);
console.log('\n💡 Use these suggestions to update test data files with valid selectors');
console.log('='.repeat(80) + '\n');
