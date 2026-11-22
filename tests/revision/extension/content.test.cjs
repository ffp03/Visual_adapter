'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs'), path = require('node:path');
const core = require('../../../extension/procedure-core.js');
const ROOT = path.resolve(__dirname, '../../..');
const { build } = require('../../../extension/reader-frame.js');
test('reader srcdoc strips consent-targeting labels, controls and page ids while retaining text and theme CSS', () => {
    const host = new JSDOM('<button id="send-generate">Send and generate</button>');
    try {
        const css = fs.readFileSync(path.join(ROOT, 'extension/sidepanel.css'), 'utf8');
        const markup = '<h1 id="send-generate">Article</h1><p><label for="send-generate" id="label-id">Read the rest</label></p>'
            + '<form><input value="secret"><button>Send</button><select><option>Value</option></select><textarea>secret</textarea></form>';
        const srcdoc = build(markup, host.window.document, css, { theme: 'white-black', fontSize: 24 });
        const result = new JSDOM(srcdoc);
        try {
            assert.equal(result.window.document.querySelectorAll('label,[for],form,input,button,select,textarea').length, 0);
            assert.equal(result.window.document.querySelectorAll('#reader-view [id]').length, 0);
            assert.equal(result.window.document.querySelectorAll('[id]').length, 1, 'Only the trusted style wrapper has an id');
            assert.match(result.window.document.body.textContent, /Read the rest/);
            assert.equal(result.window.document.body.className, 'theme-white-black');
            assert.equal(result.window.document.body.style.getPropertyValue('--font-size'), '24px');
            assert.ok(result.window.document.querySelector('style').textContent.includes(css.replace(/\r\n/g, '\n')));
            assert.equal(host.window.document.getElementById('send-generate').textContent, 'Send and generate');
        } finally { result.window.close(); }
    } finally { host.window.close(); }
});
test('content script preserves v2 application and basic bypass; rejected v3 never generates', async () => {
    const dom = new JSDOM('<body><main class="reading"><h1>Saved article</h1><p>This is substantial reading material which the existing v2 preservation guard must keep in full. The reader needs every sentence from the original article for complete understanding of this page.</p></main></body>',
        { url: 'https://example.test/articles/third', runScripts: 'outside-only' });
    try {
        // JSDOM has no layout-derived innerText; real Chromium does.
        Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
        let listener, currentRules;
        const actions = [];
        dom.window.chrome = { runtime: {
            sendMessage: async request => { actions.push(request.action); return { protocol: 3, rules: currentRules, lookupAvailable: true }; },
            onMessage: { addListener: fn => { listener = fn; } }
        } };
        for (const name of ['procedure-core.js', 'procedure-v3.js', 'content.js']) dom.window.eval(fs.readFileSync(path.join(ROOT, 'extension', name), 'utf8'));
        const procedure = core.compile(dom.window.document, { main: 'main.reading', exclude: [], name: 'Existing v2' });
        assert.equal(procedure.schemaVersion, 2); currentRules = [procedure];
        const extract = basicView => new Promise(resolve => listener({ action: 'EXTRACT_CONTEXT', basicView }, {}, resolve));
        const saved = await extract(false);
        assert.equal(saved.ruleApplied, true); assert.equal(saved.procedureDelivered, true);
        assert.ok(saved.html.includes('Saved article'));
        const basic = await extract(true); assert.equal(basic.ruleApplied, false); assert.equal(basic.delivery, 'fallback');
        currentRules = [{ schemaVersion: 3, name: 'Stale v3', applicability: { hostname: 'example.test', anchors: [{ selector: '#missing', min: 1, max: 1 }] },
            regions: [{ selector: '#missing', role: 'body', multiple: false, required: true }], exclude: [], reveal: [],
            provenance: { model: 'scripted', inductionPages: 2, createdAt: '2026-11-21T00:00:00Z' } }];
        const rejected = await extract(false); assert.equal(rejected.ruleApplied, false); assert.equal(rejected.delivery, 'fallback');
        assert.ok(actions.every(action => action === 'GET_RULES'));
    } finally { dom.window.close(); }
});
