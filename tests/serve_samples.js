const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const SAMPLES_DIR = path.join(__dirname, 'samples');

const server = http.createServer((req, res) => {
    // Decode URL to handle spaces and special chars
    const filePath = path.join(SAMPLES_DIR, decodeURIComponent(req.url));

    // Prevent directory traversal
    if (!filePath.startsWith(SAMPLES_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        let contentType = 'text/html';
        if (ext === '.mhtml') contentType = 'multipart/related';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Serving files from: ${SAMPLES_DIR}`);
});
