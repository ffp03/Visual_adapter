const fs = require('fs');
const https = require('https');
const path = require('path');

const SAMPLES_DIR = path.join(__dirname, 'samples');
if (!fs.existsSync(SAMPLES_DIR)) {
    fs.mkdirSync(SAMPLES_DIR);
}

const urls = [
    { name: 'wikipedia_ai.html', url: 'https://en.wikipedia.org/wiki/Artificial_intelligence' },
    { name: 'example.html', url: 'https://example.com' }
];

urls.forEach(site => {
    console.log(`Downloading ${site.url}...`);
    https.get(site.url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            fs.writeFileSync(path.join(SAMPLES_DIR, site.name), data);
            console.log(`Saved ${site.name}`);
        });
    }).on('error', (err) => {
        console.error(`Error downloading ${site.url}:`, err.message);
    });
});
