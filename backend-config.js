// Backend configuration
export const BACKEND_CONFIG = {
    // Local development
    local: 'http://localhost:7860',

    // Production (Hugging Face Spaces)
    production: 'https://ffpffp-visual-adapter-backend.hf.space',

    // Current environment (change to 'production' after deployment)
    current: 'production'  // Changed to production - deployed!
};

// Get the active backend URL
export function getBackendURL() {
    return BACKEND_CONFIG[BACKEND_CONFIG.current];
}
