const https = require('https');

const SPACE_ID = 'ffpffp/visual-adapter-backend';
// HF token from env (dotfiles-ai -> ~/.env.shared); was hardcoded, moved 2026-07-19.
// See ~/dotfiles-ai/docs/secret-scrub-2026-07-19.md
const TOKEN = process.env.HF_TOKEN;

function getLogs() {
    const options = {
        hostname: 'huggingface.co',
        path: `/api/spaces/${SPACE_ID}/runtime`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${TOKEN}`
        }
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            try {
                console.log(body);
            } catch (e) {
                console.log(body);
            }
        });
    });

    req.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
    });

    req.end();
}

getLogs();
