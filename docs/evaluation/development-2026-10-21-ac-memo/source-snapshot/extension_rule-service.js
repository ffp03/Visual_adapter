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
        protocol: 2,
        async getRules(hostname) {
            try {
                const response = await fetch(`${getBackendURL()}/rules/${encodeURIComponent(hostname)}?protocol=2`);
                if (!response.ok) return { protocol: 2, rules: [], lookupAvailable: false, lookupError: 'procedure-lookup-unavailable' };
                const data = await response.json();
                if (Object.prototype.hasOwnProperty.call(data, 'rule') && data.protocol !== 2) return { protocol: 1, rules: data.rule ? [data.rule] : [], lookupAvailable: true };
                return data.protocol === 2 && Array.isArray(data.rules) ? { ...data, lookupAvailable: true }
                    : { protocol: 2, rules: [], lookupAvailable: false, lookupError: 'invalid-procedure-lookup-response' };
            } catch { return { protocol: 2, rules: [], lookupAvailable: false, lookupError: 'procedure-lookup-unavailable' }; }
        },
        async getRule(hostname) {
            try {
                const response = await fetch(`${getBackendURL()}/rules/${encodeURIComponent(hostname)}`);
                if (!response.ok) return null;
                const data = await response.json();
                return data.rule || null;
            } catch { return null; }
        },
        async reportRule(hostname, familyKey) {
            try {
                await fetch(`${getBackendURL()}/report`, { method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostname, familyKey, protocol: 2 }) });
            } catch { /* Keep the current local view when the local server is unavailable. */ }
        }
    };
}
