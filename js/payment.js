/**
 * AutoMinds Checkout
 * Handles plan selection → Stripe Checkout Sessions.
 * 
 * Usage: 
 *   <button onclick="startCheckout('maintenance')">Start Maintenance →</button>
 *   <button onclick="startCheckout('devteam')">Book Dev Team →</button>
 */

const CHECKOUT_API = '/api/checkout';

/**
 * Start Stripe Checkout for a plan
 * @param {string} plan - "maintenance" or "devteam"
 * @param {string} [repoUrl] - Optional repo URL to pre-fill onboarding
 */
async function startCheckout(plan, repoUrl) {
    // Show loading state on the clicked button
    const btn = event?.target;
    const originalText = btn?.textContent;
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Loading...';
    }

    try {
        const body = { plan };
        if (repoUrl) body.repo_url = repoUrl;

        const response = await fetch(CHECKOUT_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Checkout failed');
        }

        const { url } = await response.json();

        if (url) {
            window.location.href = url;
        } else {
            throw new Error('No checkout URL returned');
        }

    } catch (err) {
        console.error('Checkout error:', err);
        alert('Unable to start checkout. Please try again or contact admin@autominds.org');
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

/**
 * Start checkout with repo URL from scan results
 */
function startCheckoutFromScan(plan) {
    const repoInput = document.getElementById('repo-url');
    const repoUrl = repoInput?.value?.trim() || '';
    startCheckout(plan, repoUrl);
}
