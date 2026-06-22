document.addEventListener('DOMContentLoaded', async () => {
    const readerView = document.getElementById('reader-view');
    const fontDisplay = document.getElementById('font-display');
    const sizeSlider = document.getElementById('size-slider');
    const fontSelect = document.getElementById('font-select');

    // Helper for logging to UI
    function log(msg) {
        console.log(msg);
        const debugEl = document.getElementById('debug-console');
        if (debugEl) {
            const logLine = document.createElement('div');
            logLine.textContent = `> ${msg}`;
            logLine.style.borderBottom = '1px solid #222';
            debugEl.appendChild(logLine);
            debugEl.scrollTop = debugEl.scrollHeight;
        }
    }

    // Load Settings
    let settings = await chrome.storage.sync.get(['fontSize', 'theme']);
    if (!settings.fontSize) settings = { fontSize: 20, theme: 'black-white' }; // Defaults

    // Apply initial settings
    applySettings(settings);

    // Get current tab ID
    log('Initializing Side Panel...');
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    log(`Tabs found: ${tabs.length}`);

    if (tabs.length > 0) {
        log(`Active Tab ID: ${tabs[0].id}`);
        requestContent(tabs[0].id);
    } else {
        readerView.innerHTML = '<p>No active tab found. Click inside the page and try again.</p>';
    }

    // Listen for updates
    document.getElementById('refresh-btn').addEventListener('click', () => {
        readerView.innerHTML = ''; // Clear previous content
        log('Refresh clicked...');
        chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => {
            if (t) {
                log(`Refreshing Tab ID: ${t.id}`);
                requestContent(t.id);
            } else {
                log('No active tab to refresh.');
            }
        });
    });

    // Font Size Slider
    sizeSlider.addEventListener('input', (e) => {
        settings.fontSize = parseInt(e.target.value);
        saveAndApply();
    });

    // Font Family Selector
    fontSelect.addEventListener('change', (e) => {
        settings.fontFamily = e.target.value;
        saveAndApply();
    });

    // Buttons for fine-tuning
    document.getElementById('font-increase').addEventListener('click', () => {
        settings.fontSize = Math.min(40, settings.fontSize + 2);
        sizeSlider.value = settings.fontSize;
        saveAndApply();
    });

    document.getElementById('font-decrease').addEventListener('click', () => {
        settings.fontSize = Math.max(12, settings.fontSize - 2);
        sizeSlider.value = settings.fontSize;
        saveAndApply();
    });

    // Theme Grid
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            settings.theme = btn.dataset.theme;
            saveAndApply();
        });
    });

    function saveAndApply() {
        chrome.storage.sync.set(settings);
        applySettings(settings);
    }

    function applySettings(s) {
        // Apply to Side Panel
        document.body.className = `theme-${s.theme}`;
        document.documentElement.style.setProperty('--font-size', `${s.fontSize}px`);
        if (s.fontFamily) {
            document.body.style.fontFamily = s.fontFamily;
        }

        fontDisplay.textContent = `${s.fontSize}px`;
        sizeSlider.value = s.fontSize;
        if (s.fontFamily) fontSelect.value = s.fontFamily;

        // Highlight active theme button
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.style.outline = btn.dataset.theme === s.theme ? '3px solid var(--accent-color)' : 'none';
            btn.style.outlineOffset = '2px';
        });
    }

    // --- UI Logic: Foldable Sections (Native <details> used, no JS needed) ---

    // --- Debug Tools ---
    let lastDebugData = null;
    let savedScrollPosition = null; // For auto-refresh
    const autoDownloadCheckbox = document.getElementById('auto-download-logs');

    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', async () => {
            if (confirm('Clear your local settings? This will reset theme and font preferences.\n\n(Note: Rules are stored in Firebase and shared across all users, so they cannot be cleared from here.)')) {
                // V3.0: Rules are in Firebase (centralized), can't be cleared by individual users
                // Only clear local user preferences
                await chrome.storage.sync.clear();
                log('Local settings cleared. Reload extension to reset.');
                readerView.innerHTML = '<p>Settings cleared. Please reload the extension.</p>';
            }
        });
    }

    function exportDebugLog() {
        if (!lastDebugData) {
            alert('No analysis data available yet.');
            return;
        }
        const blob = new Blob([JSON.stringify(lastDebugData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug_log_${lastDebugData.rule?.name || 'analysis'}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        log("Log exported.");
    }

    const exportLogBtn = document.getElementById('export-log-btn');
    if (exportLogBtn) {
        exportLogBtn.addEventListener('click', () => {
            if (!lastDebugData) {
                alert('No analysis data available yet. Visit a complex page and wait for analysis.');
                return;
            }
            exportDebugLog();
        });
    }

    const toggleConsoleBtn = document.getElementById('toggle-console-btn');
    const debugConsole = document.getElementById('debug-console');
    if (toggleConsoleBtn && debugConsole) {
        toggleConsoleBtn.addEventListener('click', () => {
            const isHidden = debugConsole.style.display === 'none';
            debugConsole.style.display = isHidden ? 'block' : 'none';
        });
    }

    async function requestContent(tabId) {
        log(`Requesting content from Tab ${tabId}...`);

        // Helper to send message
        const sendMessage = () => {
            return new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tabId, { action: "EXTRACT_CONTEXT" }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                });
            });
        };

        try {
            let response;
            try {
                response = await sendMessage();
            } catch (err) {
                // If connection failed, try injecting the script
                if (err.message.includes('Receiving end does not exist') || err.message.includes('Could not establish connection')) {
                    log('Content script not found. Injecting...');
                    await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['content.js']
                    });
                    log('Injection successful. Retrying...');
                    // Wait a moment for script to initialize
                    await new Promise(r => setTimeout(r, 500));
                    response = await sendMessage();
                } else {
                    throw err;
                }
            }

            if (response) {
                log('Context received. Rendering...');
                readerView.innerHTML = response.html;

                // Restore scroll position if saved
                if (savedScrollPosition !== null) {
                    readerView.scrollTop = savedScrollPosition;
                    savedScrollPosition = null; // Reset
                    log("Scroll position restored.");
                }

                if (response.usedRule) {
                    log("Success: Applied cached Smart Rule.");
                    const meta = document.createElement('div');
                    meta.style.color = 'green';
                    meta.style.marginTop = '10px';
                    meta.textContent = "⚡ Smart Rule Applied (Zero Latency)";
                    readerView.appendChild(meta);
                } else {
                    log('No local rule. Checking Cloud...');

                    // Show Heuristic Content immediately (it's already in response.html)
                    // Add a banner indicating analysis is in progress
                    const banner = document.createElement('div');
                    banner.id = 'analysis-banner';
                    banner.style.background = '#fff3cd';
                    banner.style.color = '#856404';
                    banner.style.padding = '10px';
                    banner.style.marginBottom = '15px';
                    banner.style.borderRadius = '4px';
                    banner.style.border = '1px solid #ffeeba';
                    banner.style.textAlign = 'center';
                    banner.innerHTML = '<strong>⏳ Analyzing page structure...</strong><br><small>Optimizing reading experience...</small>';
                    readerView.insertBefore(banner, readerView.firstChild);

                    chrome.runtime.sendMessage({ action: "ANALYZE_PAGE", context: response }, (res) => {
                        if (chrome.runtime.lastError) {
                            console.warn("Analysis trigger failed:", chrome.runtime.lastError);
                            return;
                        }

                        if (res.success && res.rule) {
                            // Immediate Hit (Cloud had it)
                            log("Cloud Rule Found: " + res.rule.name);
                            banner.style.background = '#d4edda';
                            banner.style.color = '#155724';
                            banner.style.borderColor = '#c3e6cb';
                            banner.innerHTML = `<strong>✨ Smart Rule Applied: ${res.rule.name}</strong>`;

                            // Auto-refresh to apply it
                            setTimeout(() => {
                                savedScrollPosition = readerView.scrollTop;
                                requestContent(tabId);
                            }, 1000);

                            // Trigger verification if this is a newly generated rule
                            if (res.source === 'generated') {
                                log('[Verification] Triggering verification for new rule');

                                // Get the full HTML for verification
                                chrome.tabs.sendMessage(tabId, { action: "EXTRACT_CONTEXT" }, (extractResponse) => {
                                    if (extractResponse && extractResponse.html) {
                                        // Trigger verification in background
                                        chrome.runtime.sendMessage({
                                            action: "TRIGGER_VERIFICATION",
                                            hostname: response.hostname,
                                            rawHTML: extractResponse.html,
                                            extractedHTML: readerView.innerHTML,
                                            rule: res.rule
                                        });
                                    }
                                });
                            }

                        } else if (res.status === 'pending') {
                            log("Request sent to backend. Waiting for analysis...");
                            // Banner stays as "Analyzing..."
                            // We wait for UPDATE_RULE message
                        } else if (res.error) {
                            log("Analysis error: " + res.error);
                            banner.style.background = '#f8d7da';
                            banner.style.color = '#721c24';
                            banner.innerHTML = 'Analysis failed. Using basic view.';
                        }
                    });
                }
            } else {
                log('No response from content script.');
            }

        } catch (error) {
            log(`Error: ${error.message}`);
            readerView.innerHTML += '<p style="color:red">Could not connect to page. Try refreshing the tab.</p>';
        }
    }

    // Listen for Live Updates from Backend
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "UPDATE_RULE") {
            log(`✨ Received Live Update for ${msg.hostname}`);

            const banner = document.getElementById('analysis-banner');
            if (banner) {
                banner.style.background = '#d4edda';
                banner.style.color = '#155724';
                banner.style.borderColor = '#c3e6cb';
                banner.innerHTML = `<strong>✨ Smart Rule Found!</strong><br><small>Updating view...</small>`;
            }

            // Flash Toast
            const toast = document.createElement('div');
            toast.textContent = "✨ Rule Optimized!";
            toast.style.position = 'fixed';
            toast.style.bottom = '20px';
            toast.style.right = '20px';
            toast.style.background = '#28a745';
            toast.style.color = 'white';
            toast.style.padding = '10px 20px';
            toast.style.borderRadius = '5px';
            toast.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
            toast.style.zIndex = '9999';
            toast.style.animation = 'fadeIn 0.5s, fadeOut 0.5s 2.5s';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);

            // Refresh Content (Maintain Scroll)
            chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => {
                if (t && t.url.includes(msg.hostname)) {
                    savedScrollPosition = readerView.scrollTop;
                    requestContent(t.id);
                }
            });
        }

        // Listen for verification updates (from background polling)
        if (msg.action === "RULE_UPDATED") {
            log(`[Verification] Rule updated for ${msg.hostname}`);

            // Check if verification data is available
            if (msg.rule && msg.rule.verification) {
                const v = msg.rule.verification;
                log(`[Verification] Status: ${v.status}, Attempts: ${v.attempts}, Confidence: ${v.confidence}`);

                if (v.status === 'verified') {
                    log(`[Verification] ✅ Rule verified with ${(v.confidence * 100).toFixed(0)}% confidence`);
                } else if (v.status === 'failed') {
                    log(`[Verification] ❌ Verification failed after ${v.attempts} attempts`);
                }
            }

            // Silently refresh content with updated rule (preserve scroll)
            chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => {
                if (t && t.url.includes(msg.hostname)) {
                    savedScrollPosition = readerView.scrollTop;
                    log('[Verification] Refreshing content with updated rule');
                    requestContent(t.id);
                }
            });
        }
    });
});
