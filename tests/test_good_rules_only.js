/**
 * Run performance tests on GOOD RULES ONLY (10 tests)
 * This avoids Firebase overwriting and API quota issues
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load only good rules
const goodRules = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_data/good_rules.json'), 'utf-8'));

console.log('\n' + '='.repeat(80));
console.log('TESTING GOOD RULES ONLY (10 tests)');
console.log('='.repeat(80));
console.log(`This will test ${goodRules.length} pages without Firebase overwriting`);
console.log('HTML is now trimmed to prevent API quota issues');
console.log('='.repeat(80) + '\n');

// Create temporary test file with only good rules
const tempTestData = {
    good: goodRules,
    bad: [],
    refinement: []
};

// Save temp files
fs.writeFileSync(path.join(__dirname, 'test_data/.temp_good_only.json'), JSON.stringify(goodRules, null, 2));

console.log('✓ Prepared test data');
console.log('\nStarting tests...\n');

// Run the main test script
try {
    execSync('node test_verification_performance.js', {
        cwd: __dirname,
        stdio: 'inherit'
    });
} catch (error) {
    console.error('Test execution failed:', error.message);
    process.exit(1);
}
