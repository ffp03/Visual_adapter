const fetch = globalThis.fetch || require('../backend/node_modules/node-fetch');

const FIREBASE_URL = "https://visual-adapter-default-rtdb.firebaseio.com/";
const SECRET = "pr6IGWkc8Wa28DqgfxMWZdZueGfKyJfoWhPf4g9V";
const LOCAL_SERVER = "http://localhost:8080";

// Helper to interact with Firebase
async function firebase(path, method = 'GET', body = null) {
    const url = `${FIREBASE_URL}${path}.json?auth=${SECRET}`;
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(url, options);
    return res.json();
}

// Test cases - using a few files from the samples directory
const TEST_FILES = [
    "clothing/Disney Store.mhtml",
    "clothing/Macy.mhtml"
];

async function runTest() {
    console.log("--- Starting Realistic Integration Test ---");

    for (const file of TEST_FILES) {
        const safeName = file.replace(/[^a-zA-Z0-9]/g, '_'); // Sanitize for Firebase key
        const fileUrl = `${LOCAL_SERVER}/${encodeURIComponent(file).replace(/%2F/g, '/')}`; // Encode path but keep slashes

        console.log(`\nTesting: ${file}`);
        console.log(`URL: ${fileUrl}`);
        console.log(`Key: ${safeName}`);

        // 1. Cleanup
        await firebase(`rules/${safeName}`, 'DELETE');
        await firebase(`requests/${safeName}`, 'DELETE');

        // 2. Send Request
        await firebase(`requests/${safeName}`, 'PUT', {
            url: fileUrl,
            status: "pending",
            timestamp: Date.now()
        });

        // 3. Wait for Result
        process.stdout.write("Waiting for backend...");
        let attempts = 0;
        let success = false;
        while (attempts < 30) { // Wait up to 60s (Gemini can be slow)
            await new Promise(r => setTimeout(r, 2000));
            const rule = await firebase(`rules/${safeName}`);
            const req = await firebase(`requests/${safeName}`);

            if (rule) {
                console.log("\n✅ SUCCESS: Rule generated!");
                console.log(JSON.stringify(rule, null, 2));
                success = true;
                break;
            }

            if (req && req.status === 'failed') {
                console.log("\n❌ FAILED: Backend reported error.");
                console.log("Error:", req.error);
                break;
            }

            process.stdout.write(".");
            attempts++;
        }

        if (!success && attempts >= 30) {
            console.log("\n❌ TIMEOUT: Backend did not respond in time.");
        }
    }
}

runTest().catch(console.error);
