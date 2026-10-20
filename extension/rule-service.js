import { BACKEND_CONFIG, getBackendURL } from './backend-config.js';

export function createRuleService() {
    if (!['localCodex', 'localDeepSeek'].includes(BACKEND_CONFIG.current)) {
        // MV3 workers cannot use dynamic import or remotely hosted Firebase SDKs.
        // Match the legacy anonymous get/push contract through Firebase's REST API.
        const endpoint = (collection, hostname) => `${BACKEND_CONFIG.firebaseDatabaseURL}/${collection}/${encodeURIComponent(hostname.replace(/\./g, '_'))}.json`;
        return {
            async getRule(hostname) {
                try {
                    const response = await fetch(endpoint('rules', hostname));
                    return response.ok ? await response.json() : null;
                } catch { return null; }
            },
            async reportRule(hostname) {
                try {
                    await fetch(endpoint('reports', hostname), { method: 'POST',
                        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostname, timestamp: Date.now() }) });
                } catch { /* Reporting preserves the existing reading view on failure. */ }
            }
        };
    }
    return {
        async getRule(hostname) {
            try {
                const response = await fetch(`${getBackendURL()}/rules/${encodeURIComponent(hostname)}`);
                if (!response.ok) return null;
                return (await response.json()).rule || null;
            } catch { return null; }
        },
        async reportRule(hostname) {
            try {
                await fetch(`${getBackendURL()}/report`, { method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostname }) });
            } catch { /* Keep the current local view when the local server is unavailable. */ }
        }
    };
}
