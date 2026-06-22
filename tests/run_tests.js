const fs = require('fs');
const path = require('path');

const SAMPLES_DIR = path.join(__dirname, 'samples');
const OUTPUT_DIR = path.join(__dirname, 'output');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

// Mock Adaptation Engine (simulating background.js logic)
function mockAnalyzePage(html) {
    // Simple heuristic: if length > 5000, assume complex -> CSS only
    // Otherwise -> Simplified
    const mode = html.length > 50000 ? 'css-only' : 'simplified';

    if (mode === 'simplified') {
        return {
            mode: 'simplified',
            html: `<div class="adapted-content"><h1>Adapted Content</h1><p>This is a simplified version of the content.</p></div>`,
            css: `body { font-size: 24px; color: yellow; background: black; }`
        };
    } else {
        return {
            mode: 'css-only',
            html: html, // Return original
            css: `body { font-size: 24px; color: yellow; background: black; }`
        };
    }
}

// Run Tests
fs.readdir(SAMPLES_DIR, (err, files) => {
    if (err) {
        console.error("Could not list samples directory.", err);
        return;
    }

    files.forEach(file => {
        const content = fs.readFileSync(path.join(SAMPLES_DIR, file), 'utf8');
        console.log(`Processing ${file}...`);

        const result = mockAnalyzePage(content);

        const outputHtml = `
            <html>
            <head><style>${result.css}</style></head>
            <body>
                <h2>Test Result: ${result.mode}</h2>
                ${result.html}
            </body>
            </html>
        `;

        fs.writeFileSync(path.join(OUTPUT_DIR, `test_${file}`), outputHtml);
        console.log(`Generated test_${file}`);
    });
});
