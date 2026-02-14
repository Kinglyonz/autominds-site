/**
 * AutoMinds Checkout API
 * Creates a Stripe Checkout Session for subscription plans.
 * 
 * POST /api/checkout
 * Body: { plan: "maintenance" | "reviews" | "devteam", repo_url?: string }
 * 
 * Requires env vars:
 *   STRIPE_SECRET_KEY - Stripe secret key (sk_live_...)
 *   STRIPE_PRICE_MAINTENANCE - Price ID for $49/mo plan
 *   STRIPE_PRICE_REVIEWS - Price ID for $149/mo plan
 *   STRIPE_PRICE_DEVTEAM - Price ID for $499/mo plan
 */

const { handlePreflight, setCors } = require('./_cors');

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY?.trim());

const PRICE_MAP = {
    maintenance: process.env.STRIPE_PRICE_MAINTENANCE?.trim(),
    reviews: process.env.STRIPE_PRICE_REVIEWS?.trim(),
    devteam: process.env.STRIPE_PRICE_DEVTEAM?.trim(),
};

const PLAN_NAMES = {
    maintenance: 'Repo Maintenance',
    reviews: 'AI Code Reviews',
    devteam: 'AI Dev Team',
};

module.exports = async function handler(req, res) {
    if (handlePreflight(req, res)) return;
    setCors(req, res);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { plan, repo_url } = req.body;

        if (!plan || !PRICE_MAP[plan]) {
            return res.status(400).json({ 
                error: 'Invalid plan. Use "maintenance", "reviews", or "devteam".' 
            });
        }

        const priceId = PRICE_MAP[plan];

        if (!priceId) {
            return res.status(500).json({ 
                error: 'Price not configured. Contact admin@autominds.org' 
            });
        }

        const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || 'https://autominds-site-repo.vercel.app';

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{
                price: priceId,
                quantity: 1,
            }],
            success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/#pricing`,
            metadata: {
                plan,
                repo_url: repo_url || '',
            },
            subscription_data: {
                metadata: {
                    plan,
                    repo_url: repo_url || '',
                },
            },
            // Collect customer info
            billing_address_collection: 'auto',
            // Allow promo codes
            allow_promotion_codes: true,
        });

        return res.status(200).json({ url: session.url });

    } catch (error) {
        console.error('[checkout] Error:', error);
        return res.status(500).json({ error: 'Failed to create checkout session', detail: error.message });
    }
}
