/**
 * AutoMinds Voice Activation System
 * Triggers ElevenLabs Conversational AI widget with section-specific context
 */

// Context messages for each section
const VOICE_CONTEXTS = {
    general: {
        title: 'AutoMinds AI',
        subtitle: 'Ask me anything about our services',
    },
    hero: {
        title: 'AutoMinds AI',
        subtitle: 'Tell me about your project — I\'ll find the right plan',
    },
    scan: {
        title: 'Repo Scanner',
        subtitle: 'Tell me your GitHub repo URL and I\'ll scan it',
    },
    results: {
        title: 'Results Explainer',
        subtitle: 'I\'ll walk you through your scan results',
    },
    services: {
        title: 'Service Advisor',
        subtitle: 'Ask me which service fits your needs',
    },
    maintenance: {
        title: 'Repo Maintenance',
        subtitle: 'Ask about automated repo maintenance — $49/mo',
    },
    reviews: {
        title: 'AI Code Reviews',
        subtitle: 'Ask about AI-powered PR reviews — $149/mo',
    },
    devteam: {
        title: 'AI Dev Team',
        subtitle: 'Ask about our full-service AI dev team — $499/mo',
    },
};

// Voice overlay element (created once)
let overlay = null;

function createOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'voice-overlay';
    overlay.innerHTML = `
        <div class="voice-overlay-orb">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
        </div>
        <p class="voice-overlay-text">Listening...</p>
        <p class="voice-overlay-context"></p>
        <button class="voice-overlay-close" onclick="stopVoice()">End Conversation</button>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

/**
 * Start a voice conversation with the ElevenLabs agent
 * @param {string} context - Section context key (hero, scan, services, etc.)
 */
function startVoice(context) {
    const ctx = VOICE_CONTEXTS[context] || VOICE_CONTEXTS.general;

    // Create and show overlay
    const el = createOverlay();
    el.querySelector('.voice-overlay-text').textContent = ctx.title;
    el.querySelector('.voice-overlay-context').textContent = ctx.subtitle;
    el.classList.add('active');

    // Try to trigger the ElevenLabs widget programmatically
    const widget = document.querySelector('elevenlabs-convai');
    if (widget) {
        // Make widget visible temporarily to allow interaction
        widget.style.display = 'block';
        widget.style.position = 'fixed';
        widget.style.bottom = '20px';
        widget.style.right = '20px';
        widget.style.zIndex = '10000';

        // Try to find and click the widget's internal button
        setTimeout(() => {
            // The ElevenLabs widget creates a shadow DOM with a button
            if (widget.shadowRoot) {
                const btn = widget.shadowRoot.querySelector('button');
                if (btn) {
                    btn.click();
                }
            }
        }, 500);
    }

    // Close overlay on escape
    document.addEventListener('keydown', handleEscape);
}

function stopVoice() {
    if (overlay) {
        overlay.classList.remove('active');
    }

    // Hide widget again
    const widget = document.querySelector('elevenlabs-convai');
    if (widget) {
        // Try to end conversation
        if (widget.shadowRoot) {
            const btn = widget.shadowRoot.querySelector('button');
            if (btn) btn.click(); // Toggle off
        }
        setTimeout(() => {
            widget.style.display = 'none';
        }, 300);
    }

    document.removeEventListener('keydown', handleEscape);
}

function handleEscape(e) {
    if (e.key === 'Escape') {
        stopVoice();
    }
}
