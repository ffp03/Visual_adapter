// Mock Backend Test
// Run with: node tests/backend_test.js

// Try to use global fetch (Node 18+) or fallback to node-fetch from backend
const fetch = globalThis.fetch || require('../backend/node_modules/node-fetch');

const FIREBASE_URL = "https://visual-adapter-default-rtdb.firebaseio.com/";
const SECRET = "pr6IGWkc8Wa28DqgfxMWZdZueGfKyJfoWhPf4g9V";
const TEST_HOST = "test-auto-gen_com";

async function firebase(path, method = 'GET', body = null) {
    const url = `${FIREBASE_URL}${path}.json?auth=${SECRET}`;
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(url, options);
    return res.json();
}

async function runTest() {
    console.log("--- Starting Backend Auto-Test ---");

    // 1. Clean up previous test
    console.log("1. Cleaning up...");
    await firebase(`rules/${TEST_HOST}`, 'DELETE');
    await firebase(`requests/${TEST_HOST}`, 'DELETE');

    // 2. Send Request
    console.log("2. Sending Request...");
    await firebase(`requests/${TEST_HOST}`, 'PUT', {
        url: "https://example.com",
        status: "pending",
        timestamp: Date.now()
    });

    // 3. Wait for Processing
    console.log("3. Waiting for Backend...");
    let attempts = 0;
    let rule = null;
    while (attempts < 10) {
        await new Promise(r => setTimeout(r, 2000));
        rule = await firebase(`rules/${TEST_HOST}`);
        if (rule) break;
        process.stdout.write(".");
        attempts++;
    }

    if (rule) {
        console.log("\n✅ SUCCESS: Rule generated!");
        console.log("Rule:", rule);
    } else {
        console.log("\n❌ FAILURE: Backend did not respond in time.");
        console.log("Make sure the backend is running: 'cd backend && npm install && npm start'");
    }
}

// Check if node-fetch is available (it might not be in the user's root)
try {
    runTest();
} catch (e) {
    console.error("Test script failed to run. Ensure 'node-fetch' is installed or run in an environment with fetch.");
    console.error(e);
}
