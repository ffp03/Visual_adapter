'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const { chromium } = require('playwright-core');
const { createLocalServer } = require('../../../backend/local-ai.cjs');
const { LayoutFakeRunner } = require('../../../backend/layout-fake-runner.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + server.address().port)));
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
test('unpacked extension: consent, payload disclosure, P4 admission, runtime use, basic switch and report', { timeout: 90000 }, async t => {
    const directory = path.join(ROOT, 'workspace/local-ai/wp-d1-browser', crypto.randomUUID());
    const extension = path.join(directory, 'extension'); fs.mkdirSync(directory, { recursive: true });
    // Real extension files; only the loopback port changes in this isolated copy.
    fs.cpSync(path.join(ROOT, 'extension'), extension, { recursive: true, filter: source => !source.includes(path.sep + 'archive') });
    process.env.LOCAL_AI_FAKE_RUNNER = '1';
    const runner = new LayoutFakeRunner({ actions: [{ action: 'query', selector: 'main.reading' }] });
    const backend = createLocalServer({ runner, directory: path.join(directory, 'backend'), runtimeRoot: directory });
    const backendURL = await listen(backend); t.after(() => close(backend));
    const requests = [];
    backend.prependListener('request', req => requests.push(req.url));
    const config = path.join(extension, 'backend-config.js');
    fs.writeFileSync(config, fs.readFileSync(config, 'utf8').replaceAll('http://127.0.0.1:7861', backendURL));
    const site = http.createServer((req, res) => {
        const seed = req.url.includes('beta') ? 'Beta' : req.url.includes('gamma') ? 'Gamma' : 'Alpha';
        res.writeHead(200, { 'Content-Type': 'text/html' });
        const tag = req.url.includes('broken') ? 'article' : 'main';
        res.end(`<!doctype html><html><body><nav>Site navigation repeated every time</nav><${tag} class="reading"><h1>${seed} story</h1><p>${seed} substantive unique article about accessible layouts with enough words to preserve all of the useful reading content. Further explanation shows the complete paragraph is preserved by both the saved rule and the basic reader.</p><p><label for="send-generate" id="page-label">Read the rest</label></p><input value="private"></${tag}><footer>Repeated footer</footer></body></html>`);
    });
    const siteURL = await listen(site); t.after(() => close(site));
    const context = await chromium.launchPersistentContext(path.join(directory, 'chrome-profile'), {
        executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: process.env.BROWSER_HEADLESS === '1',
        viewport: { width: 420, height: 900 },
        ignoreDefaultArgs: ['--disable-extensions'],
        args: ['--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check']
    });
    t.after(() => context.close());
    // Branded Chrome no longer accepts --load-extension. Its CDP Extensions
    // domain loads unpacked files into this fresh test profile instead.
    const cdp = await context.browser().newBrowserCDPSession();
    await cdp.send('Extensions.loadUnpacked', { path: extension });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).hostname;
    // The install handler opens the setup page in a new tab; on some browsers it becomes the active
    // tab after the site page opens. Close it so the panel reads the site tab, as a user would.
    const setup = context.pages().find(p => p.url().endsWith('/options.html')) ||
        await context.waitForEvent('page', { predicate: p => p.url().endsWith('/options.html'), timeout: 5000 }).catch(() => null);
    if (setup) await setup.close();
    const errors = [];
    const panel = await context.newPage(); panel.on('pageerror', error => errors.push(error.message));
    const reading = panel.frameLocator('#reader-frame');
    // Exercise the production panel in an extension tab; Chrome's native sidebar
    // shell is not automated. Browser runtime, worker, content scripts and API
    // messaging are real, with no injected chrome mocks.
    await panel.goto('chrome-extension://' + extensionId + '/sidepanel.html');
    const page = await context.newPage(); await page.goto(siteURL + '/alpha'); await page.bringToFront();
    // A native sidebar does not become the active browser tab. Dispatch refresh
    // without focusing this test's extension tab to preserve that condition.
    await panel.locator('#refresh-btn').evaluate(button => button.click());
    try { await panel.waitForFunction(() => !document.getElementById('send-generate').disabled, null, { timeout: 8000 }); }
    catch (error) { t.diagnostic(JSON.stringify({ status: await panel.locator('#layout-status').textContent(), errors,
        tabs: await worker.evaluate(() => chrome.tabs.query({ active: true })) })); throw error; }
    assert.equal(await panel.locator('#payload-characters').textContent(), '0');
    assert.match(await panel.locator('#provider-model').textContent(), /scripted.*layout-fixture/);
    assert.equal(requests.filter(r => ['/generate', '/generation/send', '/analyze'].includes(r)).length, 0);
    assert.equal(fs.readdirSync(path.join(directory, 'workspace/local-ai/runtime-examples')).length, 0);
    await panel.locator('#send-generate').click();
    await panel.waitForFunction(() => document.getElementById('layout-status').textContent.includes('second distinct page'));
    assert.equal(fs.readdirSync(path.join(directory, 'workspace/local-ai/runtime-examples')).length, 1);
    await page.goto(siteURL + '/beta');
    await panel.waitForFunction(() => !document.getElementById('send-generate').disabled);
    const disclosedCharacters = Number(await panel.locator('#payload-characters').textContent());
    const disclosedMaximum = Number(await panel.locator('#maximum-characters').textContent());
    const disclosedSample = await panel.locator('#cue-sample').textContent();
    assert.ok(disclosedCharacters > 0); assert.ok(disclosedMaximum >= disclosedCharacters * 6);
    assert.equal(runner.calls.length, 0);
    assert.equal(requests.filter(r => r === '/generate').length, 1, 'Second-page preview is not a generation request');
    assert.equal(fs.readdirSync(path.join(directory, 'workspace/local-ai/runtime-examples')).length, 1);
    assert.equal(requests.filter(r => r === '/generation/send').length, 0);
    // Review-2: clicking page-derived reading text must not activate the live
    // consent button, even while a compatible example makes that button ready.
    assert.equal(await panel.locator('#reader-frame').getAttribute('sandbox'), '');
    assert.equal(await panel.locator('#reader-frame').evaluate(frame => frame.contentDocument === null), true);
    await reading.getByText('Read the rest', { exact: true }).click({ position: { x: 8, y: 8 } });
    await panel.waitForTimeout(200); // Allow a wrongly activated message to reach the local route.
    assert.equal(requests.filter(r => r === '/generate').length, 1);
    assert.equal(runner.calls.length, 0);
    assert.equal(await reading.locator('label,[for],input,button,select,textarea').count(), 0);
    assert.equal(await reading.locator('#reader-view [id]').count(), 0);
    assert.equal(await reading.locator('body').evaluate(() => { try { void window.parent.document; return false; } catch { return true; } }), true);
    await panel.locator('.theme-btn[data-theme="white-black"]').click();
    await reading.locator('body.theme-white-black').waitFor();
    assert.equal(await reading.locator('body').evaluate(n => getComputedStyle(n).color), 'rgb(255, 255, 255)');
    assert.equal(await reading.locator('body').evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(0, 0, 0)');
    await panel.locator('#font-increase').click();
    await panel.waitForFunction(() => document.getElementById('font-display').textContent === '22px');
    await reading.locator('body[style*="22px"]').waitFor();
    assert.equal(await reading.locator('#reader-view').evaluate(n => getComputedStyle(n).fontSize), '22px');
    await panel.locator('.theme-btn[data-theme="black-white"]').click();
    // This single click covers query plus submit: no per-turn consent dialog.
    await panel.locator('#send-generate').click();
    await panel.waitForFunction(() => document.getElementById('layout-status').textContent === 'Saved reading rule applied.');
    await panel.waitForFunction(() => document.getElementById('payload-count').textContent === '2');
    const payload = JSON.stringify(runner.calls[0]);
    assert.equal(disclosedCharacters, payload.length);
    assert.ok(JSON.parse(payload).messages[1].content.includes(disclosedSample));
    assert.equal(runner.calls.length, 2);
    assert.ok(runner.calls.reduce((n, p) => n + JSON.stringify(p).length, 0) <= disclosedMaximum);
    assert.equal(await panel.locator('#sent-payloads > details').count(), 2);
    for (let i = 0; i < runner.calls.length; i++) {
        const receipt = panel.locator('#sent-payloads > details').nth(i);
        const serialized = JSON.stringify(runner.calls[i]);
        assert.equal(await receipt.locator('pre').last().textContent(), serialized);
        assert.equal(await receipt.locator('p').textContent(), 'SHA-256: ' + sha(serialized));
        assert.match(await receipt.locator('summary').first().textContent(), new RegExp(serialized.length + ' characters'));
    }
    assert.equal(await panel.locator('#basic-view').isChecked(), false);
    assert.ok((await panel.locator('#reader-view').boundingBox()).height >= 120, 'Reader remains visible beside disclosure/settings');
    assert.ok((await panel.locator('#reader-frame').boundingBox()).height >= (await panel.locator('#reader-view').boundingBox()).height * 0.95,
        'Sandboxed iframe fills the reader rather than using the 150px iframe default');
    assert.equal(await panel.locator('#report-problem').isEnabled(), true);
    const usageFile = path.join(directory, 'workspace/local-ai/scripted-layout-fixture/usage.jsonl');
    const usage = fs.readFileSync(usageFile, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(usage[0].inputSha256, sha(payload));
    // Held-out third page uses the admitted rule without another generation.
    await page.goto(siteURL + '/gamma');
    await reading.getByRole('heading', { name: 'Gamma story' }).waitFor();
    await panel.waitForFunction(() => document.getElementById('layout-status').textContent === 'Saved reading rule applied.');
    assert.equal(requests.filter(r => r === '/generate').length, 2);
    assert.equal(await reading.locator('section[data-role="body"]').count(), 1);
    await reading.getByText('Read the rest', { exact: true }).click({ position: { x: 8, y: 8 } });
    assert.equal(requests.filter(r => r === '/generate').length, 2);
    await page.goto(siteURL + '/broken');
    await panel.waitForFunction(() => document.getElementById('basic-view').checked && !document.getElementById('send-generate').disabled);
    assert.equal(await reading.locator('section[data-role="body"]').count(), 0);
    assert.equal(requests.filter(r => r === '/generate').length, 2);
    assert.equal(requests.filter(r => r === '/generation/send').length, 0);
    await page.goto(siteURL + '/gamma');
    await panel.waitForFunction(() => document.getElementById('layout-status').textContent === 'Saved reading rule applied.');
    await panel.locator('#basic-view').check();
    await panel.waitForFunction(() => document.getElementById('basic-view').checked && !document.getElementById('send-generate').disabled);
    assert.equal(await reading.locator('section[data-role="body"]').count(), 0);
    await panel.locator('#basic-view').uncheck();
    await panel.waitForFunction(() => document.getElementById('layout-status').textContent === 'Saved reading rule applied.');
    await panel.locator('#report-problem').click();
    await panel.waitForFunction(() => document.getElementById('layout-status').textContent.includes('Rule retired'));
    assert.equal(await panel.locator('#basic-view').isChecked(), true);
    assert.equal((await (await fetch(backendURL + '/rules/127.0.0.1?protocol=3')).json()).rules.length, 0);
    assert.equal(requests.filter(r => r === '/generation/send').length, 0);
    assert.deepEqual(errors, []);
    await panel.screenshot({ path: path.join(directory, 'report-basic-view.png') });
    // Options uses the real worker to clear a new pending example.
    await panel.locator('#refresh-btn').click();
    await panel.waitForFunction(() => !document.getElementById('send-generate').disabled);
    await panel.locator('#send-generate').click();
    await panel.waitForFunction(() => document.getElementById('layout-status').textContent.includes('second distinct page'));
    const exampleDirectory = path.join(directory, 'workspace/local-ai/runtime-examples');
    const pending = fs.readdirSync(exampleDirectory).filter(name => JSON.parse(fs.readFileSync(path.join(exampleDirectory, name))).url.endsWith('/gamma'));
    assert.equal(pending.length, 1);
    const options = await context.newPage(); await options.goto('chrome-extension://' + extensionId + '/options.html');
    await options.locator('#clear-pending-examples').click();
    await options.waitForFunction(() => document.getElementById('pending-status').textContent.includes('cleared'));
    assert.ok(requests.includes('/pending/clear'));
    for (const name of pending) assert.equal(fs.existsSync(path.join(exampleDirectory, name)), false);
});
