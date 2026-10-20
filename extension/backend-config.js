// Backend configuration
export const BACKEND_CONFIG = {
    // Local development
    local: 'http://localhost:7860',
    localCodex: 'http://127.0.0.1:7861',
    localDeepSeek: 'http://127.0.0.1:7861',

    // Production (Hugging Face Spaces)
    production: 'https://ffpffp-visual-adapter-backend.hf.space',
    firebaseDatabaseURL: 'https://visual-adapter-default-rtdb.firebaseio.com',

    // Current environment (change to 'production' after deployment)
    current: 'localDeepSeek'
};

// Get the active backend URL
export function getBackendURL() {
    return BACKEND_CONFIG[BACKEND_CONFIG.current];
}
