const https = require('https');

// Configuration
const LIVE_URL = 'https://ffpffp-visual-adapter-backend.hf.space';
const TEST_HOSTNAME = 'live-auto-test.example.com';

// ANSI Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function log(msg, type = 'INFO') {
    const color = type === 'PASS' ? GREEN : (type === 'FAIL' ? RED : RESET);
    console.log(`${color}[${type}] ${msg}${RESET}`);
}

async function fetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: data });
                }
            });
        });
        req.on('error', reject);
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

async function run() {
    log(`Starting Live Backend Test against ${LIVE_URL}`);

    try {
        // 1. Health Check
        log('Testing Health Check...');
        const health = await fetchJson(`${LIVE_URL}/health`);
        if (health.ok && health.data.status === 'running') {
            log('Health check passed', 'PASS');
            console.log('Version:', health.data.version);
        } else {
            throw new Error(`Health check failed: ${health.status} ${JSON.stringify(health.data)}`);
        }

        // 2. Analyze Endpoint
        log('Testing /analyze endpoint...');
        const html = `
            <html>
                <body>
                    <article class="post">
                        <h1>Live Test Article</h1>
                        <div class="content">This is a test on the live server.</div>
                    </article>
                </body>
            </html>
        `;

        const analyze = await fetchJson(`${LIVE_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostname: TEST_HOSTNAME, html })
        });

        if (analyze.ok && analyze.data.success) {
            log('Analyze request successful', 'PASS');
            console.log('Generated Rule:', JSON.stringify(analyze.data.rule, null, 2));
        } else {
            throw new Error(`Analyze request failed: ${analyze.status} ${JSON.stringify(analyze.data)}`);
        }

        log('ALL LIVE TESTS PASSED', 'PASS');

    } catch (e) {
        log(e.message, 'FAIL');
        process.exit(1);
    }
}

run();
