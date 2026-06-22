document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app-container');
    const steps = document.querySelectorAll('.wizard-step');
    const previewContent = document.getElementById('preview-content');

    // State
    const settings = {
        fontSize: 20,
        fontFamily: 'sans-serif',
        theme: 'black-white'
    };

    // --- Navigation ---
    function showStep(id) {
        steps.forEach(step => step.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }

    document.querySelectorAll('.next-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const currentStep = e.target.closest('.wizard-step');
            const nextStep = currentStep.nextElementSibling;
            if (nextStep && nextStep.classList.contains('wizard-step')) {
                showStep(nextStep.id);
            }
        });
    });

    document.querySelectorAll('.prev-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const currentStep = e.target.closest('.wizard-step');
            const prevStep = currentStep.previousElementSibling;
            if (prevStep && prevStep.classList.contains('wizard-step')) {
                showStep(prevStep.id);
            }
        });
    });

    // --- Step 1: Global Theme Selection ---
    const themeBtns = document.querySelectorAll('.theme-btn');
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update State
            settings.theme = btn.dataset.theme;

            // Apply Global Theme Class
            appContainer.className = ''; // Reset
            appContainer.classList.add(`theme-${settings.theme}`);

            // Visual Feedback on Buttons (Optional, but good)
            themeBtns.forEach(b => b.style.outline = 'none');
            btn.style.outline = '3px solid var(--accent-color)';
            btn.style.outlineOffset = '2px';
        });
    });

    // --- Step 2: Typography ---
    const sizeSlider = document.getElementById('size-slider');
    const sizeDisplay = document.getElementById('size-display');
    const fontSelect = document.getElementById('font-select');

    function updateTypography() {
        previewContent.style.fontSize = `${settings.fontSize}px`;
        previewContent.style.fontFamily = settings.fontFamily;
    }

    sizeSlider.addEventListener('input', (e) => {
        settings.fontSize = parseInt(e.target.value);
        sizeDisplay.textContent = `${settings.fontSize}px`;
        updateTypography();
    });

    fontSelect.addEventListener('change', (e) => {
        settings.fontFamily = e.target.value;
        updateTypography();
    });

    // API key no longer needed - backend handles all AI calls

    // --- Finish ---
    document.getElementById('finish-btn').addEventListener('click', async () => {
        // Save theme and typography settings
        await chrome.storage.sync.set(settings);
        console.log('Settings saved:', settings);

        showStep('step-complete');
    });

    // Initialize
    updateTypography();
});
