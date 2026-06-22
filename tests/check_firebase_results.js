/**
 * Check Firebase for verification results
 * Reads the verification status from Firebase for all test pages
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load service account
const serviceAccount = require('../backend/service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://visual-adapter-default-rtdb.firebaseio.com/'
});

const db = admin.database();

// Test hostnames
const TEST_HOSTNAMES = [
    'amazon.com',
    'walmart.com',
    'macys.com',
    'sephora.com',
    'costco.com',
    'bestbuy.ca',
    'zillow.com',
    'lcbo.com',
    'ikea.com',
    'etsy.com'
];

async function checkVerificationStatus() {
    console.log('\n' + '='.repeat(80));
    console.log('FIREBASE VERIFICATION RESULTS');
    console.log('='.repeat(80));
    console.log(`Checking ${TEST_HOSTNAMES.length} test pages...\n`);

    const results = [];

    for (const hostname of TEST_HOSTNAMES) {
        const safeHostname = hostname.replace(/\./g, '_');

        try {
            // Get rule data from Firebase
            const snapshot = await db.ref(`rules/${safeHostname}`).once('value');
            const ruleData = snapshot.val();

            if (!ruleData) {
                console.log(`❌ ${hostname}: No data in Firebase`);
                results.push({
                    hostname,
                    found: false,
                    error: 'No data in Firebase'
                });
                continue;
            }

            const verification = ruleData.verification || {};
            const status = verification.status || 'unknown';
            const attempts = verification.attempts || 0;
            const confidence = verification.confidence || 0;

            // Format output
            const statusIcon = status === 'verified' ? '✅' :
                status === 'failed' ? '❌' :
                    status === 'pending' ? '⏳' : '❓';

            console.log(`${statusIcon} ${hostname}:`);
            console.log(`   Status: ${status}`);
            console.log(`   Attempts: ${attempts}`);
            console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);

            if (ruleData.main) {
                console.log(`   Rule: ${ruleData.main}`);
            }

            if (verification.history && verification.history.length > 0) {
                console.log(`   History: ${Object.keys(verification.history).length} entries`);
            }

            console.log('');

            results.push({
                hostname,
                found: true,
                status,
                attempts,
                confidence,
                rule: {
                    main: ruleData.main,
                    exclude: ruleData.exclude,
                    name: ruleData.name
                },
                verification: verification
            });

        } catch (error) {
            console.log(`❌ ${hostname}: Error - ${error.message}\n`);
            results.push({
                hostname,
                found: false,
                error: error.message
            });
        }
    }

    // Summary
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));

    const verified = results.filter(r => r.status === 'verified').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const pending = results.filter(r => r.status === 'pending').length;
    const notFound = results.filter(r => !r.found).length;

    console.log(`Total: ${TEST_HOSTNAMES.length}`);
    console.log(`✅ Verified: ${verified}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏳ Pending: ${pending}`);
    console.log(`❓ Not Found: ${notFound}`);

    if (verified > 0) {
        const avgConfidence = results
            .filter(r => r.status === 'verified')
            .reduce((sum, r) => sum + r.confidence, 0) / verified;
        console.log(`\nAverage Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    }

    // Save results
    const outputPath = path.join(__dirname, 'firebase_verification_results.json');
    fs.writeFileSync(outputPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: {
            total: TEST_HOSTNAMES.length,
            verified,
            failed,
            pending,
            notFound
        },
        results
    }, null, 2));

    console.log(`\n✓ Results saved to: ${outputPath}`);
    console.log('='.repeat(80) + '\n');

    process.exit(0);
}

checkVerificationStatus().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
