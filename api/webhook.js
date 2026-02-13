/**
 * AutoMinds Stripe Webhook Handler
 * Handles subscription lifecycle events.
 * 
 * POST /api/stripe-webhook
 * 
 * Requires env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 */

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY?.trim());
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

module.exports.config = {
    api: {
        bodyParser: false, // Stripe requires raw body for signature verification
    },
};

async function buffer(readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let event;

    try {
        const buf = await buffer(req);
        const sig = req.headers['stripe-signature'];
        event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    } catch (err) {
        console.error(`[webhook] Signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[webhook] Event: ${event.type}`);

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                console.log(`[webhook] New subscription! Customer: ${session.customer_email || session.customer}`);
                console.log(`[webhook] Plan: ${session.metadata?.plan}, Repo: ${session.metadata?.repo_url}`);
                
                // TODO: When you add a database, store customer + subscription info here
                // For now, you'll see these in Stripe Dashboard and get email notifications
                
                // Send notification email (future: integrate with email service)
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                console.log(`[webhook] Subscription updated: ${subscription.id}, Status: ${subscription.status}`);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                console.log(`[webhook] Subscription cancelled: ${subscription.id}`);
                // TODO: Revoke access when you add auth
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                console.log(`[webhook] Payment failed for customer: ${invoice.customer}`);
                // TODO: Send dunning email
                break;
            }

            case 'invoice.paid': {
                const invoice = event.data.object;
                console.log(`[webhook] Invoice paid: ${invoice.id}, Amount: $${invoice.amount_paid / 100}`);
                break;
            }

            default:
                console.log(`[webhook] Unhandled event type: ${event.type}`);
        }

        return res.status(200).json({ received: true });

    } catch (error) {
        console.error(`[webhook] Handler error: ${error.message}`);
        return res.status(500).json({ error: 'Webhook handler failed' });
    }
}
