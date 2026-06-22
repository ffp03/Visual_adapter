/**
 * Phase 1: HTML Structure Analysis
 * 
 * Analyzes HTML to find available selectors BEFORE generating rules.
 * This is client-side (0 tokens) and provides context for rule generation.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Load test data
const goodRules = require('./test_data/good_rules.json');
const badRules = require('./test_data/bad_rules.json');

/**
 * Load MHTML file and extract HTML content
 */
function loadMHTML(filePath) {
    try {
        // Files are in samples folder, not test_data
        const fullPath = path.join(__dirname, 'samples', filePath);
        const content = fs.readFileSync(fullPath, 'utf8');

        // MHTML format: find HTML content after Content-Type: text/html
        const htmlMatch = content.match(/Content-Type: text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--)/);
        if (htmlMatch) {
            return htmlMatch[1];
        }

        // Fallback: return entire content if not MHTML
        return content;
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error.message);
        return '';
    }
}

/**
 * Analyze HTML structure to find available selectors
 */
function analyzeHTMLStructure(html) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const analysis = {
        semanticElements: [],
        idBasedContainers: [],
        classBasedContainers: [],
        noiseElements: [],
        bodyLocation: {
            start: html.indexOf('<body'),
            end: html.indexOf('</body>')
        },
        stats: {
            totalElements: doc.querySelectorAll('*').length,
            totalText: doc.body?.textContent?.length || 0
        }
    };

    // Find semantic elements (best option)
    ['main', 'article', '[role="main"]'].forEach(selector => {
        try {
            const el = doc.querySelector(selector);
            if (el) {
                analysis.semanticElements.push({
                    selector,
                    textLength: el.textContent.length,
                    childCount: el.children.length,
                    score: 100
                });
            }
        } catch (e) {
            // Invalid selector, skip
        }
    });

    // Find ID-based containers (good option)
    ['#content', '#main', '#article', '#post', '#primary', '#main-content'].forEach(selector => {
        try {
            const el = doc.querySelector(selector);
            if (el) {
                analysis.idBasedContainers.push({
                    selector,
                    textLength: el.textContent.length,
                    childCount: el.children.length,
                    score: 80
                });
            }
        } catch (e) {
            // Invalid selector, skip
        }
    });

    // Find class-based containers (okay option)
    ['.content', '.main', '.article', '.post', '.primary', '.main-content'].forEach(selector => {
        try {
            const el = doc.querySelector(selector);
            if (el) {
                analysis.classBasedContainers.push({
                    selector,
                    textLength: el.textContent.length,
                    childCount: el.children.length,
                    score: 60
                });
            }
        } catch (e) {
            // Invalid selector, skip
        }
    });

    // Find noise elements (for exclusions)
    ['header', 'nav', 'footer', 'aside', '[role="banner"]', '[role="navigation"]', '[role="complementary"]'].forEach(selector => {
        try {
            if (doc.querySelector(selector)) {
                analysis.noiseElements.push(selector);
            }
        } catch (e) {
            // Invalid selector, skip
        }
    });

    return analysis;
}

/**
 * Test Phase 1 with all MHTML files
 */
async function testPhase1() {
    const allRules = [...goodRules, ...badRules];

    const results = {
        total: allRules.length,
        foundSemantic: 0,
        foundIdBased: 0,
        foundClassBased: 0,
        foundNoise: 0,
        correctMatch: 0,
        details: []
    };

    console.log('\n================================================================================');
    console.log('PHASE 1: HTML STRUCTURE ANALYSIS');
    console.log('================================================================================\n');
    console.log('Analyzing HTML to find available selectors (0 tokens, client-side)\n');

    for (const testCase of allRules) {
        const mhtmlPath = testCase.file;
        const rawHTML = loadMHTML(mhtmlPath);

        if (!rawHTML) {
            console.log(`❌ ${testCase.id}: Failed to load file`);
            continue;
        }

        // Analyze structure
        const structure = analyzeHTMLStructure(rawHTML);

        // Check what was found
        const hasSemantic = structure.semanticElements.length > 0;
        const hasIdBased = structure.idBasedContainers.length > 0;
        const hasClassBased = structure.classBasedContainers.length > 0;
        const hasNoise = structure.noiseElements.length > 0;

        if (hasSemantic) results.foundSemantic++;
        if (hasIdBased) results.foundIdBased++;
        if (hasClassBased) results.foundClassBased++;
        if (hasNoise) results.foundNoise++;

        // Check if analysis found the selector used in the rule
        const ruleMain = testCase.rule.main;
        const allFound = [
            ...structure.semanticElements.map(s => s.selector),
            ...structure.idBasedContainers.map(s => s.selector),
            ...structure.classBasedContainers.map(s => s.selector)
        ];

        // Check if any found selector matches or is in the rule's main selector
        const foundCorrect = allFound.some(s => {
            const ruleSelectors = ruleMain.split(',').map(r => r.trim());
            return ruleSelectors.some(r => r.includes(s) || s.includes(r));
        });

        if (foundCorrect) results.correctMatch++;

        // Display results
        const icons = [
            hasSemantic ? '✅ semantic' : '   semantic',
            hasIdBased ? '✅ ID' : '   ID',
            hasClassBased ? '✅ class' : '   class',
            hasNoise ? '✅ noise' : '   noise',
            foundCorrect ? '🎯' : '  '
        ];

        console.log(`${testCase.id.padEnd(10)} ${icons.join('  ')}`);

        // Save analysis for next phase
        testCase.structureAnalysis = structure;

        results.details.push({
            id: testCase.id,
            hasSemantic,
            hasIdBased,
            hasClassBased,
            hasNoise,
            foundCorrect,
            semanticCount: structure.semanticElements.length,
            idCount: structure.idBasedContainers.length,
            classCount: structure.classBasedContainers.length,
            noiseCount: structure.noiseElements.length
        });
    }

    console.log('\n================================================================================');
    console.log('PHASE 1 RESULTS');
    console.log('================================================================================');
    console.log(`Total analyzed: ${results.total}`);
    console.log(`\nSelector Discovery:`);
    console.log(`  Semantic elements: ${results.foundSemantic}/${results.total} (${(results.foundSemantic / results.total * 100).toFixed(1)}%)`);
    console.log(`  ID-based containers: ${results.foundIdBased}/${results.total} (${(results.foundIdBased / results.total * 100).toFixed(1)}%)`);
    console.log(`  Class-based containers: ${results.foundClassBased}/${results.total} (${(results.foundClassBased / results.total * 100).toFixed(1)}%)`);
    console.log(`  Noise elements: ${results.foundNoise}/${results.total} (${(results.foundNoise / results.total * 100).toFixed(1)}%)`);
    console.log(`\nAccuracy:`);
    console.log(`  Matched actual rule selector: ${results.correctMatch}/${results.total} (${(results.correctMatch / results.total * 100).toFixed(1)}%)`);

    console.log(`\nSuccess Criteria:`);
    const semanticPass = results.foundSemantic >= results.total * 0.6;
    const idClassPass = (results.foundIdBased + results.foundClassBased) >= results.total * 0.8;
    const noisePass = results.foundNoise >= results.total * 0.9;
    const matchPass = results.correctMatch >= results.total * 0.7;

    console.log(`  ✓ Find semantic in ≥60%: ${semanticPass ? '✅ PASS' : '❌ FAIL'} (${(results.foundSemantic / results.total * 100).toFixed(1)}%)`);
    console.log(`  ✓ Find ID/class in ≥80%: ${idClassPass ? '✅ PASS' : '❌ FAIL'} (${((results.foundIdBased + results.foundClassBased) / results.total * 100).toFixed(1)}%)`);
    console.log(`  ✓ Find noise in ≥90%: ${noisePass ? '✅ PASS' : '❌ FAIL'} (${(results.foundNoise / results.total * 100).toFixed(1)}%)`);
    console.log(`  ✓ Match actual selector ≥70%: ${matchPass ? '✅ PASS' : '❌ FAIL'} (${(results.correctMatch / results.total * 100).toFixed(1)}%)`);

    const allPass = semanticPass && idClassPass && noisePass && matchPass;
    console.log(`\n${allPass ? '✅ PHASE 1 PASSED' : '⚠️  PHASE 1 NEEDS TUNING'}`);

    // Save enriched test data for Phase 2
    const outputPath = path.join(__dirname, 'phase1_results.json');
    fs.writeFileSync(outputPath, JSON.stringify(allRules, null, 2));
    console.log(`\n📊 Results saved to: phase1_results.json`);
    console.log(`   Token cost: 0 (client-side analysis)`);
    console.log(`\n✅ Ready for Phase 2: Rule Generation`);

    return results;
}

// Run Phase 1
testPhase1().catch(console.error);
