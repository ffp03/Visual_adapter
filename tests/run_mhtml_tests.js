const fs = require('fs');
const path = require('path');
// Adjust these paths if necessary to match your actual install location
const { JSDOM } = require('C:/Users/final/.gemini/antigravity/brain/f759781b-f06f-4249-b8e6-515daadbe27b/test_env/node_modules/jsdom');
const { Readability, isProbablyReaderable } = require('C:/Users/final/.gemini/antigravity/brain/f759781b-f06f-4249-b8e6-515daadbe27b/test_env/node_modules/@mozilla/readability');

const SAMPLES_DIR = path.join(__dirname, 'samples');
const OUTPUT_DIR = path.join(__dirname, 'output');
const API_KEY = 'AIzaSyCtqVqdtc9pOtgE7nENRzwt1s3RAs3q5sI'; // Dev Key

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

// --- Helper: Decode Quoted-Printable ---
function decodeQuotedPrintable(input) {
    return input
        .replace(/=\r\n/g, '') // Soft line breaks
        .replace(/=\n/g, '')   // Soft line breaks
        .replace(/=([0-9A-F]{2})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// --- Helper: Extract HTML from MHTML ---
function extractHtmlFromMhtml(mhtmlContent) {
    // 1. Try to find the HTML part using boundary
    const boundaryMatch = mhtmlContent.match(/boundary="(.+?)"/);
    if (boundaryMatch) {
        const boundary = boundaryMatch[1];
        const parts = mhtmlContent.split(boundary);
        const htmlPart = parts.find(p => p.includes('Content-Type: text/html'));
        if (htmlPart) {
            // Strip headers (find first double newline)
            const contentStart = htmlPart.indexOf('\r\n\r\n');
            if (contentStart !== -1) {
                return decodeQuotedPrintable(htmlPart.substring(contentStart + 4));
            }
            const contentStart2 = htmlPart.indexOf('\n\n');
            if (contentStart2 !== -1) {
                return decodeQuotedPrintable(htmlPart.substring(contentStart2 + 2));
            }
        }
    }

    // 2. Fallback: Regex for <html> tag
    const htmlMatch = mhtmlContent.match(/<html[\s\S]*<\/html>/i);
    if (htmlMatch) {
        return decodeQuotedPrintable(htmlMatch[0]);
    }

    // 3. Last resort: return whole content decoded
    return decodeQuotedPrintable(mhtmlContent);
}

// --- Helper: Call Gemini API ---
async function callGemini(prompt) {
    // Using gemini-2.5-flash as requested by user
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    const payload = {
        contents: [{
            parts: [{ text: prompt }]
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        }
        return `/* Error: No response from Gemini */ \n /* ${JSON.stringify(data)} */`;
    } catch (error) {
        return `/* Error calling Gemini: ${error.message} */`;
    }
}

// --- Logic: Extract Used CSS ---
function extractUsedCSS(doc) {
    let usedRules = [];
    Array.from(doc.styleSheets).forEach(sheet => {
        try {
            Array.from(sheet.cssRules).forEach(rule => {
                if (rule.type === 1) { // CSSStyleRule
                    try {
                        if (doc.querySelector(rule.selectorText)) {
                            usedRules.push(rule.cssText);
                        }
                    } catch (e) {
                        // Ignore invalid selectors
                    }
                }
            });
        } catch (e) {
            // Access denied or other error
        }
    });
    return usedRules.join('\n');
}

// --- Logic: Extract Skeleton ---
function extractSkeleton(node) {
    if (node.nodeType === 3) { // Text node
        return node.textContent.trim() ? '[Text]' : '';
    }
    if (node.nodeType !== 1) return ''; // Skip comments etc.

    // Clone element without children
    const clone = node.cloneNode(false);

    // Remove non-essential attributes
    const keepAttrs = ['id', 'class', 'role', 'aria-label'];
    Array.from(clone.attributes).forEach(attr => {
        if (!keepAttrs.includes(attr.name)) {
            clone.removeAttribute(attr.name);
        }
    });

    // Recursively process children
    let childHTML = '';
    node.childNodes.forEach(child => {
        childHTML += extractSkeleton(child);
    });

    clone.innerHTML = childHTML;
    return clone.outerHTML;
}

// --- Main Processing Logic ---
async function processSample(filePath) {
    const filename = path.basename(filePath);
    console.log(`\nProcessing ${filename}...`);

    const content = fs.readFileSync(filePath, 'utf8');
    const html = extractHtmlFromMhtml(content);

    // Create JSDOM
    const dom = new JSDOM(html, { url: "http://localhost" });
    const doc = dom.window.document;

    // 1. Check Compatibility
    // FORCE LLM for ALL files as per user request
    const readerable = false; // Forced to false to test LLM on everything

    console.log(`> Is Probably Readerable? ${isProbablyReaderable(doc)} (Ignored, forcing LLM)`);

    let outputHTML = '';

    if (readerable) {
        // --- Compatible: Local Adaptation ---
        console.log(`> Mode: Compatible (Article). Applying Local Reader Theme.`);
        const reader = new Readability(doc);
        const article = reader.parse();

        if (article) {
            outputHTML = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Reader View: ${article.title}</title>
                    <style>
                        body {
                            background-color: #000000;
                            color: #FFFF00; /* Yellow on Black */
                            font-family: sans-serif;
                            font-size: 24px;
                            line-height: 1.6;
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 20px;
                        }
                        a { color: #4da6ff; }
                        img { max-width: 100%; height: auto; }
                    </style>
                </head>
                <body>
                    <h1>${article.title}</h1>
                    <div class="byline">${article.byline || ''}</div>
                    <hr>
                    <div class="content">${article.content}</div>
                </body>
                </html>
            `;
        } else {
            outputHTML = "<h1>Error parsing article content</h1>";
        }

    } else {
        // --- Non-Compatible: App/Complex ---
        console.log(`> Mode: Non-Compatible (App). Extracting CSS & Calling Gemini.`);

        // 1. Skeleton
        const skeleton = extractSkeleton(doc.body).substring(0, 5000); // Limit length

        // 2. Used CSS
        const usedCSS = extractUsedCSS(doc).substring(0, 5000); // Limit length

        // 3. Prompt
        const prompt = `
            You are an assistive technology AI.
            I have a complex web application. I need a CSS stylesheet to enforce a "High Contrast" theme (Yellow text on Black background, Font Size 24px) on this structure.
            
            Here is the HTML Skeleton (Structure only):
            \`\`\`html
            ${skeleton}
            \`\`\`
            
            Here is the CSS currently used on the page (for context):
            \`\`\`css
            ${usedCSS}
            \`\`\`
            
            Instructions:
            1. Return ONLY a valid CSS stylesheet.
            2. Target the standard elements (body, div, nav, button, input) and the specific classes found in the skeleton.
            3. Ensure background is #000000 and text is #FFFF00.
            4. Ensure font-size is at least 24px.
            5. Do NOT explain. Just output the CSS.
        `;

        console.log(`> Sending request to Gemini...`);
        const generatedCSS = await callGemini(prompt);
        console.log(`> Received CSS from Gemini (${generatedCSS.length} chars).`);

        // Inject CSS into original HTML (simplified)
        outputHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    /* Original CSS (Optional, maybe skipped to force override) */
                </style>
                <style>
                    /* Gemini Generated Overlay */
                    ${generatedCSS.replace(/```css/g, '').replace(/```/g, '')}
                </style>
            </head>
            <body>
                <!-- Original Content (Simulated) -->
                ${html}
            </body>
            </html>
        `;
    }

    fs.writeFileSync(path.join(OUTPUT_DIR, `test_${filename}.html`), outputHTML);
    console.log(`> Saved output to test_${filename}.html`);
}

// --- Recursive MHTML Finder ---
function findMhtmlFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            findMhtmlFiles(filePath, fileList);
        } else if (file.endsWith('.mhtml') || file.endsWith('.mht')) {
            fileList.push(filePath);
        }
    });
    return fileList;
}

// --- Run ---
const files = findMhtmlFiles(SAMPLES_DIR);
console.log(`Found ${files.length} samples.`);

(async () => {
    for (const file of files) {
        await processSample(file);
    }
})();
