document.addEventListener('DOMContentLoaded', async () => {
    const el = id => document.getElementById(id);
    const status = el('layout-status'), disclosure = el('layout-disclosure');
    const send = el('send-generate'), basic = el('basic-view'), report = el('report-problem');
    let tabId, currentURL, currentHost, preview, job, epoch = 0, pollTimer;
    const settings = { fontSize: 20, theme: 'black-white', ...await chrome.storage.sync.get(['fontSize', 'theme', 'fontFamily']) };
    const readerCSS = await (await fetch(chrome.runtime.getURL('sidepanel.css'))).text();
    let readingHTML = '';
    function renderReader(html) {
        readingHTML = html || '';
        el('reader-frame').srcdoc = ReaderFrame.build(readingHTML, document, readerCSS, settings);
    }
    const message = async data => {
        const result = await chrome.runtime.sendMessage(data);
        if (!result || result.error) throw Error(result?.error || 'Local backend unavailable');
        return result;
    };
    function applySettings() {
        document.body.className = 'theme-' + settings.theme;
        document.documentElement.style.setProperty('--font-size', settings.fontSize + 'px');
        if (settings.fontFamily) document.body.style.fontFamily = settings.fontFamily;
        renderReader(readingHTML);
        el('font-display').textContent = settings.fontSize + 'px';
        el('size-slider').value = settings.fontSize;
        chrome.storage.sync.set(settings);
    }
    applySettings();
    el('size-slider').addEventListener('input', e => { settings.fontSize = Number(e.target.value); applySettings(); });
    el('font-select').addEventListener('change', e => { settings.fontFamily = e.target.value; applySettings(); });
    for (const [id, delta] of [['font-increase', 2], ['font-decrease', -2]]) el(id).addEventListener('click', () => {
        settings.fontSize = Math.max(12, Math.min(40, settings.fontSize + delta)); applySettings();
    });
    document.querySelectorAll('.theme-btn').forEach(button => button.addEventListener('click', () => { settings.theme = button.dataset.theme; applySettings(); }));
    const showError = error => { status.textContent = 'Using basic view. ' + error.message; send.disabled = true; };
    function showDisclosure(data) {
        el('provider-model').textContent = data.provider + ' / ' + data.model;
        el('payload-characters').textContent = String(data.characters);
        el('maximum-characters').textContent = String(data.maximumTotalCharacters);
        el('cue-sample').textContent = data.sample || '';
        disclosure.hidden = false; send.disabled = false;
    }
    function showReceipts(data) {
        const container = el('sent-payloads'); container.replaceChildren();
        el('payload-count').textContent = String(data.payloadCount || 0);
        el('payload-history').hidden = !data.payloadCount;
        for (const receipt of data.receipts || []) {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = 'Request ' + receipt.turn + ': ' + receipt.characters + ' characters';
            const hash = document.createElement('p'); hash.textContent = 'SHA-256: ' + receipt.payloadHash;
            const sample = document.createElement('pre'); sample.textContent = receipt.sample;
            const payload = document.createElement('pre'); payload.textContent = receipt.payload;
            const full = document.createElement('details'), label = document.createElement('summary');
            label.textContent = 'Full serialized payload'; full.append(label, payload);
            details.append(summary, hash, sample, full); container.append(details);
        }
    }
    async function refresh(forceBasic = false) {
        const mine = ++epoch;
        clearTimeout(pollTimer); job = null; preview = null;
        disclosure.hidden = true; send.disabled = true;
        el('payload-history').hidden = true;
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !/^https?:/.test(tab.url || '')) throw Error('Open a web page and refresh');
            tabId = tab.id; currentURL = tab.url; currentHost = new URL(tab.url).hostname;
            const extract = () => chrome.tabs.sendMessage(tabId, { action: 'EXTRACT_CONTEXT', basicView: forceBasic });
            let result;
            try { result = await extract(); }
            catch {
                await chrome.scripting.executeScript({ target: { tabId }, files: ['procedure-core.js', 'procedure-v3.js', 'content.js'] });
                result = await extract();
            }
            if (mine !== epoch) return;
            if (result?.error) throw Error(result.error);
            renderReader(result.html);
            basic.checked = forceBasic || !result.ruleApplied; report.disabled = !result.ruleApplied;
            status.textContent = result.ruleApplied ? 'Saved reading rule applied.' : 'Using basic view.';
            const history = await message({ action: 'LAYOUT_HISTORY', hostname: currentHost });
            if (mine !== epoch) return;
            showReceipts(history);
            if (!result.ruleApplied) {
                const data = await message({ action: 'DISCLOSE_LAYOUT', tabId });
                if (mine !== epoch) return;
                preview = data; showDisclosure(data); status.textContent = data.message;
            }
        } catch (error) { if (mine === epoch) showError(error); }
    }
    async function follow(mine) {
        if (mine !== epoch || !job) return;
        try {
            const tab = await chrome.tabs.get(tabId);
            if (tab.url !== currentURL) throw Error('Page changed; refresh the view');
            const data = await message({ action: 'LAYOUT_STATUS', tabId, job });
            if (mine !== epoch) return;
            showReceipts(data);
            if (data.status === 'admitted') { await refresh(); return; }
            if (data.status === 'failed') { status.textContent = 'Using basic view. Generation failed or was rejected: ' + (data.reason || 'unknown'); send.disabled = true; return; }
            status.textContent = data.status === 'preparing' ? 'Preparing local evidence; nothing sent to the provider.' : 'Generating the reading rule...';
            pollTimer = setTimeout(() => follow(mine), 250);
        } catch (error) { if (mine === epoch) showError(error); }
    }
    send.addEventListener('click', async () => {
        const mine = epoch; send.disabled = true;
        try {
            const data = await message({ action: 'GENERATE_LAYOUT', tabId, token: preview?.token, payloadHash: preview?.payloadHash }); preview = null;
            if (mine !== epoch) return;
            if (data.status === 'pending') { status.textContent = data.reason; disclosure.hidden = true; return; }
            if (data.status === 'admitted') { await refresh(); return; }
            if (data.status === 'fallback') { status.textContent = data.reason || 'Using basic view.'; return; }
            job = data.job; disclosure.hidden = true; await follow(mine);
        } catch (error) { if (mine === epoch) showError(error); }
    });
    basic.addEventListener('change', () => refresh(basic.checked));
    report.addEventListener('click', async () => {
        report.disabled = true;
        const host = currentHost, target = tabId;
        try {
            const data = await chrome.tabs.sendMessage(target, { action: 'EXTRACT_CONTEXT', basicView: true });
            renderReader(data.html); basic.checked = true;
            status.textContent = 'Using basic view. Reporting problem...';
            await message({ action: 'REPORT_RULE', hostname: host });
            status.textContent = 'Problem reported. Rule retired. Using basic view.';
        } catch (error) { status.textContent = 'Using basic view. Report could not be saved: ' + error.message; }
    });
    el('refresh-btn').addEventListener('click', () => refresh());
    chrome.tabs.onActivated.addListener(() => refresh());
    chrome.tabs.onUpdated.addListener((id, info) => { if (id === tabId && info.status === 'complete') refresh(); });
    el('clear-cache-btn').addEventListener('click', async () => {
        try { await message({ action: 'CLEAR_PENDING_EXAMPLES' }); status.textContent = 'Pending examples deleted.'; } catch (error) { showError(error); }
    });
    el('toggle-console-btn').addEventListener('click', () => {
        const console = el('debug-console'); console.style.display = console.style.display === 'none' ? 'block' : 'none';
    });
    el('export-log-btn').addEventListener('click', () => { status.textContent = 'Provider payloads and usage receipts stay in the local backend store.'; });
    await refresh();
});
