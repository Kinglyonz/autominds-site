/**
 * AutoMinds Voice — Non-blocking companion approach
 * 
 * Philosophy: Voice ENHANCES the site, never blocks it.
 * - No fullscreen overlay — the site stays fully usable
 * - Clicking a voice button simply opens the ElevenLabs widget in the corner
 * - User can browse, scroll, click while talking
 * - The widget has its own built-in end-call button
 * - Voice buttons pulse gently to show the widget is active
 */

let widgetReady = false;
let widgetActive = false;

/**
 * Start voice — just opens the ElevenLabs widget.
 * The site stays fully visible and interactive.
 */
function startVoice(context) {
    const widget = document.querySelector('elevenlabs-convai');
    if (!widget) return;

    // Show the widget
    widget.classList.remove('widget-hidden');

    // Expand it (so the user sees the full UI, not just the orb)
    setTimeout(() => {
        const expandEvent = new CustomEvent('elevenlabs-agent:expand', {
            detail: { action: 'expand' },
            bubbles: true,
            composed: true,
        });
        widget.dispatchEvent(expandEvent);
    }, 300);

    // Auto-click "Start a call" if the widget is expanded but not connected
    attemptAutoStart(widget);

    // Visual feedback: mark active voice buttons
    widgetActive = true;
    document.body.classList.add('voice-active');
}

/**
 * Try to click the "Start a call" button inside the widget shadow DOM.
 * Retries a few times since the widget needs time to render.
 */
function attemptAutoStart(widget, retries = 8) {
    if (retries <= 0) return;

    setTimeout(() => {
        if (!widget.shadowRoot) {
            attemptAutoStart(widget, retries - 1);
            return;
        }

        // Look for start button
        const startBtn = widget.shadowRoot.querySelector('button[aria-label="Start a call"]');
        if (startBtn) {
            startBtn.click();
            return;
        }

        // Fallback search
        const buttons = widget.shadowRoot.querySelectorAll('button');
        for (const btn of buttons) {
            const label = (btn.getAttribute('aria-label') || btn.textContent || '').toLowerCase();
            if (label.includes('start') && label.includes('call')) {
                btn.click();
                return;
            }
        }

        attemptAutoStart(widget, retries - 1);
    }, 500);
}

/**
 * Watch for the widget disconnecting (call ended by user or agent)
 * so we can clean up the visual state.
 */
function watchWidgetState() {
    const widget = document.querySelector('elevenlabs-convai');
    if (!widget) return;

    // Poll the widget's shadow DOM for disconnect state
    setInterval(() => {
        if (!widgetActive || !widget.shadowRoot) return;

        // Check if there's an "End" button (means call is active)
        const endBtn = widget.shadowRoot.querySelector('button[aria-label="End"]');
        const startBtn = widget.shadowRoot.querySelector('button[aria-label="Start a call"]');

        // If we see a start button again (no end button), call ended
        if (startBtn && !endBtn && widgetActive) {
            // Call ended — wait a moment then hide
            setTimeout(() => {
                cleanup();
            }, 3000);
        }
    }, 2000);
}

/**
 * Clean up after a call ends
 */
function cleanup() {
    widgetActive = false;
    document.body.classList.remove('voice-active');

    const widget = document.querySelector('elevenlabs-convai');
    if (widget) {
        // Collapse
        const collapseEvent = new CustomEvent('elevenlabs-agent:expand', {
            detail: { action: 'collapse' },
            bubbles: true,
            composed: true,
        });
        widget.dispatchEvent(collapseEvent);

        // Hide after collapse animation
        setTimeout(() => {
            widget.classList.add('widget-hidden');
        }, 500);
    }
}

// Initialize: hide widget on load, start state watcher
document.addEventListener('DOMContentLoaded', () => {
    const widget = document.querySelector('elevenlabs-convai');
    if (widget) {
        widget.classList.add('widget-hidden');
        widgetReady = true;
    }
    watchWidgetState();
});
