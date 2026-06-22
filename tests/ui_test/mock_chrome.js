// Mock Chrome API for testing sidepanel.js in a browser
window.chrome = {
    runtime: {
        lastError: null,
        onMessage: {
            addListener: () => { }
        },
        sendMessage: (msg, callback) => {
            console.log('[Mock] runtime.sendMessage:', msg);
            if (msg.action === "ANALYZE_PAGE") {
                setTimeout(() => {
                    callback({ success: true, css: "body { background: #000 !important; color: #ff0 !important; }" });
                }, 1000);
            }
        }
    },
    tabs: {
        query: (query, callback) => {
            console.log('[Mock] tabs.query');
            const tabs = [{ id: 123, url: "http://example.com" }];
            if (callback) callback(tabs);
            return Promise.resolve(tabs);
        },
        sendMessage: (tabId, msg, callback) => {
            console.log(`[Mock] tabs.sendMessage to ${tabId}:`, msg);
            if (msg.action === "EXTRACT_CONTEXT") {
                setTimeout(() => {
                    callback({ skeleton: "<body>...</body>", usedCSS: "body { color: red; }" });
                }, 500);
            } else if (msg.action === "APPLY_CSS") {
                setTimeout(() => {
                    callback({ success: true });
                }, 100);
            }
        },
        reload: (tabId) => {
            console.log(`[Mock] tabs.reload ${tabId}`);
        }
    },
    storage: {
        sync: {
            get: (keys) => {
                console.log('[Mock] storage.sync.get', keys);
                return Promise.resolve({ fontSize: 24, theme: 'yellow-black', apiKey: 'test-key' });
            },
            set: (items) => {
                console.log('[Mock] storage.sync.set', items);
            }
        }
    },
    sidePanel: {
        setPanelBehavior: () => Promise.resolve()
    }
};
