document.addEventListener('DOMContentLoaded', async () => {
    const el = id => document.getElementById(id);
    const reader = el('reader-view'), status = el('layout-status'), disclosure = el('layout-disclosure');
    const send = el('send-generate'), basic = el('basic-view'), report = el('report-problem');
    let tabId, currentURL, currentHost, preview, job, payloadHash, epoch = 0, pollTimer;
    const settings = { fontSize: 20, theme: 'black-white', ...await chrome.storage.sync.get(['fontSize', 'theme', 'fontFamily']) };
    const message = async data => {
        const result = await chrome.runtime.sendMessage(data);
        if (!result || result.error) throw Error(result?.error || 'Local backend unavailable');
        return result;
    };
    function applySettings() {
        document.body.className = 'theme-' + settings.theme;
        document.documentElement.style.setProperty('--font-size', settings.fontSize + 'px');
        if (settings.fontFamily) document.body.style.fontFamily = settings.fontFamily;
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
        el('cue-sample').textContent = data.sample || '';
        disclosure.hidden = false; send.disabled = false;
    }
    async function refresh(forceBasic = false) {
        const mine = ++epoch;
        clearTimeout(pollTimer); job = null; payloadHash = null; preview = null;
        disclosure.hidden = true; send.disabled = true;
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
            reader.innerHTML = result.html || '';
            basic.checked = forceBasic || !result.ruleApplied; report.disabled = !result.ruleApplied;
            status.textContent = result.ruleApplied ? 'Saved reading rule applied.' : 'Using basic view.';
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
            if (data.status === 'awaiting-consent') {
                payloadHash = data.payloadHash; showDisclosure(data);
                status.textContent = 'Provider request ' + data.turn + ' is ready. Review the exact payload count and redacted cues, then click Send and generate.';
                return;
            }
            if (data.status === 'admitted') { await refresh(); return; }
            if (data.status === 'failed') { status.textContent = 'Using basic view. Generation failed or was rejected: ' + (data.reason || 'unknown'); send.disabled = true; return; }
            status.textContent = data.status === 'preparing' ? 'Preparing local evidence; nothing sent to the provider.' : 'Generating the reading rule...';
            pollTimer = setTimeout(() => follow(mine), 250);
        } catch (error) { if (mine === epoch) showError(error); }
    }
    send.addEventListener('click', async () => {
        const mine = epoch; send.disabled = true;
        try {
            let data;
            if (job && payloadHash) {
                data = await message({ action: 'SEND_LAYOUT_PAYLOAD', tabId, job, payloadHash }); payloadHash = null;
            } else {
                data = await message({ action: 'GENERATE_LAYOUT', tabId, token: preview?.token }); preview = null;
            }
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
            reader.innerHTML = data.html || ''; basic.checked = true;
            status.textContent = 'Using basic view. Reporting problem...';
            await message({ action: 'REPORT_RULE', hostname: host });
            status.textContent = 'Problem reported. Rule retired. Using basic view.';
        } catch (error) { status.textContent = 'Using basic view. Report could not be saved: ' + error.message; }
    });
    el('refresh-btn').addEventListener('click', () => refresh());
    chrome.tabs.onActivated.addListener(() => refresh());
    chrome.tabs.onUpdated.addListener((id, info) => { if (id === tabId && info.status === 'complete') refresh(); });
    el('clear-cache-btn').addEventListener('click', async () => {
        try { await message({ action: 'CLEAR_PENDING_EXAMPLES' }); status.textContent = 'Pending examples cleared from active storage.'; } catch (error) { showError(error); }
    });
    el('toggle-console-btn').addEventListener('click', () => {
        const console = el('debug-console'); console.style.display = console.style.display === 'none' ? 'block' : 'none';
    });
    el('export-log-btn').addEventListener('click', () => { status.textContent = 'Provider payloads and usage receipts stay in the local backend store.'; });
    await refresh();
});
