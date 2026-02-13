/**
 * AutoMinds Voice Activation System
 * Connects custom voice buttons to the ElevenLabs Conversational AI widget.
 * 
 * Flow:
 * 1. User clicks any voice button → startVoice(context)
 * 2. We show a visual overlay with listening state
 * 3. We show the ElevenLabs widget and expand it
 * 4. We try to auto-click "Start a call" inside the widget's shadow DOM
 * 5. User talks to the AI → widget handles the conversation
 * 6. User clicks "End Conversation" on overlay or presses Escape → stopVoice()
 */

const VOICE_CONTEXTS = {
    general:     { title: 'AutoMinds AI',       subtitle: 'Ask me anything about our services' },
    hero:        { title: 'AutoMinds AI',       subtitle: 'Tell me about your project — I\'ll find the right plan' },
    scan:        { title: 'Repo Scanner',       subtitle: 'Tell me your GitHub repo URL and I\'ll scan it' },
    results:     { title: 'Results Explainer',   subtitle: 'I\'ll walk you through your scan results' },
    services:    { title: 'Service Advisor',     subtitle: 'Ask me which service fits your needs' },
    maintenance: { title: 'Repo Maintenance',   subtitle: '$49/mo — automated dependency updates, security patches' },
    reviews:     { title: 'AI Code Reviews',    subtitle: '$149/mo — every PR reviewed in under 5 minutes' },
    devteam:     { title: 'AI Dev Team',        subtitle: '$499/mo — full-service builds, bug fixes, architecture' },
};

let overlay = null;
let isVoiceActive = false;

/**
 * Create the fullscreen listening overlay (once)
 */
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
        <p class="voice-overlay-text"></p>
        <p class="voice-overlay-context"></p>
        <button class="voice-overlay-close" onclick="stopVoice()">End Conversation</button>
        <p style="margin-top: 1.5rem; font-size: 0.75rem; color: rgba(255,255,255,0.3);">
            Press Escape to close
        </p>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

/**
 * Start voice — triggered by any voice button
 * @param {string} context - Section key like 'hero', 'scan', 'services', etc.
 */
function startVoice(context) {
    if (isVoiceActive) return;
    isVoiceActive = true;

    const ctx = VOICE_CONTEXTS[context] || VOICE_CONTEXTS.general;

    // Show overlay
    const el = createOverlay();
    el.querySelector('.voice-overlay-text').textContent = ctx.title;
    el.querySelector('.voice-overlay-context').textContent = ctx.subtitle;
    el.classList.add('active');

    // Show the ElevenLabs widget
    const widget = document.querySelector('elevenlabs-convai');
    if (widget) {
        widget.classList.remove('widget-hidden');

        // Dispatch expand event (the widget listens for this)
        const expandEvent = new CustomEvent('elevenlabs-agent:expand', {
            detail: { action: 'expand' },
            bubbles: true,
            composed: true,
        });
        widget.dispatchEvent(expandEvent);

        // Try to auto-click the "Start a call" button inside shadow DOM
        attemptAutoStart(widget);
    }

    document.addEventListener('keydown', handleEscape);
}

/**
 * Try to find and click "Start a call" button in the widget's shadow DOM.
 * The widget needs a moment to render, so we retry a few times.
 */
function attemptAutoStart(widget, retries = 10) {
    if (retries <= 0) return;

    setTimeout(() => {
        if (!widget.shadowRoot) {
            attemptAutoStart(widget, retries - 1);
            return;
        }

        // Look for the start call button by aria-label
        const startBtn = widget.shadowRoot.querySelector('button[aria-label="Start a call"]');
        if (startBtn) {
            startBtn.click();
            return;
        }

        // Fallback: look for any primary-looking button
        const buttons = widget.shadowRoot.querySelectorAll('button');
        for (const btn of buttons) {
            const label = (btn.getAttribute('aria-label') || btn.textContent || '').toLowerCase();
            if (label.includes('start') || label.includes('call')) {
                btn.click();
                return;
            }
        }

        // Widget might not have rendered yet, retry
        attemptAutoStart(widget, retries - 1);
    }, 400);
}

/**
 * Stop voice — end the conversation and hide everything
 */
function stopVoice() {
    isVoiceActive = false;

    // Hide overlay
    if (overlay) {
        overlay.classList.remove('active');
    }

    const widget = document.querySelector('elevenlabs-convai');
    if (widget) {
        // Try to end the call by clicking the end button
        if (widget.shadowRoot) {
            const endBtn = widget.shadowRoot.querySelector('button[aria-label="End"]');
            if (endBtn) endBtn.click();
        }

        // Collapse the widget
        const collapseEvent = new CustomEvent('elevenlabs-agent:expand', {
            detail: { action: 'collapse' },
            bubbles: true,
            composed: true,
        });
        widget.dispatchEvent(collapseEvent);

        // Hide widget after animation
        setTimeout(() => {
            widget.classList.add('widget-hidden');
        }, 500);
    }

    document.removeEventListener('keydown', handleEscape);
}

function handleEscape(e) {
    if (e.key === 'Escape') {
        stopVoice();
    }
}

// Start with widget hidden
document.addEventListener('DOMContentLoaded', () => {
    const widget = document.querySelector('elevenlabs-convai');
    if (widget) {
        widget.classList.add('widget-hidden');
    }
});
