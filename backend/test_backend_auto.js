const { spawn } = require('child_process');
const http = require('http');
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

// Configuration
const PORT = 7860;
const BASE_URL = `http://localhost:${PORT}`;
const FIREBASE_URL = "https://visual-adapter-default-rtdb.firebaseio.com/";
const TEST_HOSTNAME = 'auto-test.example.com';

// ANSI Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function log(msg, type = 'INFO') {
    const color = type === 'PASS' ? GREEN : (type === 'FAIL' ? RED : RESET);
    console.log(`${color}[${type}] ${msg}${RESET}`);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkHealth() {
    try {
        const res = await fetch(`${BASE_URL}/health`);
        return res.ok;
    } catch (e) {
        return false;
    }
}

async function waitForServer(maxAttempts = 30) {
    log('Waiting for server to start...');
    for (let i = 0; i < maxAttempts; i++) {
        if (await checkHealth()) {
            log('Server is up!', 'PASS');
            return true;
        }
        await sleep(1000);
    }
    log('Server failed to start', 'FAIL');
    return false;
}

async function testAnalyzeEndpoint() {
    log('Testing /analyze endpoint...');
    const html = `
        <html>
            <body>
                <div class="main-content">
                    <h1>Test Article Title</h1>
                    <p>This is the main content of the test article.</p>
                </div>
                <div class="sidebar">Ad content</div>
            </body>
        </html>
    `;

    try {
        const res = await fetch(`${BASE_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostname: TEST_HOSTNAME, html })
        });

        if (!res.ok) {
            log(`Analyze request failed with status ${res.status}`, 'FAIL');
            const text = await res.text();
            console.log('Response:', text);
            return null;
        }

        const data = await res.json();
        if (data.success && data.rule) {
            log('Analyze request successful', 'PASS');
            console.log('Generated Rule:', JSON.stringify(data.rule, null, 2));
            return data.rule;
        } else {
            log('Analyze response missing success or rule', 'FAIL');
            console.log('Response:', data);
            return null;
        }
    } catch (e) {
        log(`Analyze test error: ${e.message}`, 'FAIL');
        return null;
    }
}

async function verifyFirebase(expectedRule) {
    log('Verifying Firebase persistence...');
    
    try {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: FIREBASE_URL
            });
        }

        const db = admin.database();
        const safeHostname = TEST_HOSTNAME.replace(/\./g, '_');
        const snapshot = await db.ref(`rules/${safeHostname}`).once('value');
        const savedRule = snapshot.val();

        if (!savedRule) {
            log('Rule not found in Firebase', 'FAIL');
            return false;
        }

        // Simple comparison of key fields
        if (savedRule.main === expectedRule.main) {
            log('Firebase data matches generated rule', 'PASS');
            return true;
        } else {
            log('Firebase data mismatch', 'FAIL');
            console.log('Expected:', expectedRule);
            console.log('Found:', savedRule);
            return false;
        }

    } catch (e) {
        log(`Firebase verification error: ${e.message}`, 'FAIL');
        return false;
    }
}

async function run() {
    log('Starting Backend Test Suite');

    // 1. Start Backend
    const serverProcess = spawn('node', ['index.js'], {
        cwd: __dirname,
        stdio: 'inherit', // Pipe output to see server logs
        env: { ...process.env, PORT: PORT.toString() }
    });

    let exitCode = 0;

    try {
        // 2. Wait for Health Check
        if (!await waitForServer()) throw new Error('Server startup failed');

        // 3. Test /analyze
        const rule = await testAnalyzeEndpoint();
        if (!rule) throw new Error('Analyze test failed');

        // 4. Verify Firebase
        if (!await verifyFirebase(rule)) throw new Error('Firebase verification failed');

        log('ALL TESTS PASSED', 'PASS');

    } catch (e) {
        log(e.message, 'FAIL');
        exitCode = 1;
    } finally {
        // 5. Cleanup
        log('Stopping server...');
        serverProcess.kill();
        // Allow time for cleanup
        await sleep(1000);
        process.exit(exitCode);
    }
}

run();
