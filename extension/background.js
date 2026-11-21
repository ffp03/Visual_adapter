// MV3 worker: lookup is read-only; only panel clicks can store examples or send.
import { createRuleService } from './rule-service.js';
import { getBackendURL } from './backend-config.js';
const rules = createRuleService();
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === 'install') chrome.tabs.create({ url: 'options.html' });
});
const ownPage = sender => sender.id === chrome.runtime.id
    && [chrome.runtime.getURL('sidepanel.html'), chrome.runtime.getURL('options.html')].includes(sender.url);
async function post(route, data) {
    const response = await fetch(getBackendURL() + route, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Local backend unavailable');
    return result;
}
async function pageSnapshot(tabId) {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url || !['http:', 'https:'].includes(new URL(tab.url).protocol)) throw Error('Open a web page first');
    const snapshot = await chrome.tabs.sendMessage(tabId, { action: 'GENERATION_SNAPSHOT' });
    if (snapshot?.error || !snapshot?.sanitizedHtml || snapshot.url !== tab.url) throw Error('Page changed; refresh the view');
    return { ...snapshot, tab: tabId };
}
chrome.runtime.onMessage.addListener((request, sender, respond) => {
    (async () => {
        if (request.action === 'GET_RULES') {
            return rules.getRules ? rules.getRules(request.hostname) : { rules: [await rules.getRule(request.hostname)].filter(Boolean) };
        }
        // Retired automatic upload/verification paths cannot start any request.
        if (['ANALYZE_PAGE', 'TRIGGER_VERIFICATION'].includes(request.action)) return { status: 'fallback', error: 'Explicit consent required' };
        if (!ownPage(sender)) throw Error('Extension panel or options page required');
        if (request.action === 'DISCLOSE_LAYOUT') return post('/disclose', await pageSnapshot(request.tabId));
        if (request.action === 'GENERATE_LAYOUT') return post('/generate', { ...await pageSnapshot(request.tabId), token: request.token });
        if (request.action === 'SEND_LAYOUT_PAYLOAD') return post('/generation/send', {
            ...await pageSnapshot(request.tabId), job: request.job, payloadHash: request.payloadHash });
        if (request.action === 'LAYOUT_STATUS') {
            const tab = await chrome.tabs.get(request.tabId);
            if (!tab?.url) throw Error('Page closed');
            return post('/generation/status', { tab: request.tabId, hostname: new URL(tab.url).hostname, job: request.job });
        }
        if (request.action === 'CLEAR_PENDING_EXAMPLES') return post('/pending/clear', {});
        if (request.action === 'REPORT_RULE') return post('/report', { protocol: 3, hostname: request.hostname });
        return { error: 'Unknown action' };
    })().then(respond).catch(error => respond({ success: false, status: 'fallback', error: error.message }));
    return true;
});
