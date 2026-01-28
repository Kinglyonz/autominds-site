// Stripe Webhook Handler
// Handles subscription events to activate/suspend workspaces

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY  // Use service key for admin access
);

// Orchestrator API
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'https://orchestrator.autominds.org';
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY;

export const config = {
    api: {
        bodyParser: false  // Stripe requires raw body
    }
};

async function buffer(readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];

    let event;

    try {
        event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`Received Stripe event: ${event.type}`);

    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event.data.object);
                break;

            case 'customer.subscription.created':
                await handleSubscriptionCreated(event.data.object);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;

            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(event.data.object);
                break;

            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });

    } catch (error) {
        console.error('Webhook handler error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
}

async function handleCheckoutCompleted(session) {
    console.log('Checkout completed:', session.id);

    // Get customer email and metadata
    const customerEmail = session.customer_email || session.customer_details?.email;
    const workspaceId = session.metadata?.workspace_id;

    if (!customerEmail) {
        console.error('No customer email in checkout session');
        return;
    }

    // Find user by email
    const { data: users } = await supabase
        .from('users')
        .select('id')
        .eq('email', customerEmail)
        .single();

    if (!users) {
        console.error(`User not found for email: ${customerEmail}`);
        return;
    }

    // Update subscription with Stripe IDs
    const { data: subscription } = await supabase
        .from('subscriptions')
        .update({
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('user_id', users.id)
        .eq('status', 'trialing')
        .select()
        .single();

    if (subscription) {
        // Activate workspace
        const { data: workspace } = await supabase
            .from('workspaces')
            .select('workspace_id')
            .eq('id', subscription.workspace_id)
            .single();

        if (workspace) {
            await activateWorkspace(workspace.workspace_id);
        }
    }

    console.log(`Activated workspace for ${customerEmail}`);
}

async function handleSubscriptionCreated(subscription) {
    console.log('Subscription created:', subscription.id);
    // Subscription data is already saved in handleCheckoutCompleted
}

async function handleSubscriptionUpdated(subscription) {
    console.log('Subscription updated:', subscription.id);

    // Update subscription in database
    await supabase
        .from('subscriptions')
        .update({
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end
        })
        .eq('stripe_subscription_id', subscription.id);

    // If subscription was canceled, suspend workspace at period end
    if (subscription.cancel_at_period_end) {
        console.log(`Subscription ${subscription.id} will be canceled at period end`);
        // TODO: Schedule workspace suspension
    }
}

async function handleSubscriptionDeleted(subscription) {
    console.log('Subscription deleted:', subscription.id);

    // Update subscription status
    const { data: sub } = await supabase
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('stripe_subscription_id', subscription.id)
        .select('workspace_id')
        .single();

    if (sub) {
        // Get workspace and suspend it
        const { data: workspace } = await supabase
            .from('workspaces')
            .select('workspace_id')
            .eq('id', sub.workspace_id)
            .single();

        if (workspace) {
            await suspendWorkspace(workspace.workspace_id);
        }
    }
}

async function handlePaymentSucceeded(invoice) {
    console.log('Payment succeeded:', invoice.id);

    // Update subscription period
    if (invoice.subscription) {
        await supabase
            .from('subscriptions')
            .update({
                status: 'active',
                current_period_start: new Date(invoice.period_start * 1000).toISOString(),
                current_period_end: new Date(invoice.period_end * 1000).toISOString()
            })
            .eq('stripe_subscription_id', invoice.subscription);
    }
}

async function handlePaymentFailed(invoice) {
    console.log('Payment failed:', invoice.id);

    // Update subscription to past_due
    if (invoice.subscription) {
        const { data: sub } = await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', invoice.subscription)
            .select('workspace_id')
            .single();

        if (sub) {
            // Suspend workspace after payment failure
            const { data: workspace } = await supabase
                .from('workspaces')
                .select('workspace_id')
                .eq('id', sub.workspace_id)
                .single();

            if (workspace) {
                await suspendWorkspace(workspace.workspace_id);
            }
        }

        // TODO: Send email to customer about payment failure
    }
}

async function activateWorkspace(workspaceId) {
    try {
        const response = await fetch(`${ORCHESTRATOR_URL}/activate/${workspaceId}`, {
            method: 'POST',
            headers: {
                'X-API-Key': ORCHESTRATOR_API_KEY
            }
        });

        if (!response.ok) {
            console.error(`Failed to activate workspace ${workspaceId}`);
        } else {
            console.log(`Activated workspace ${workspaceId}`);
        }
    } catch (error) {
        console.error(`Error activating workspace ${workspaceId}:`, error);
    }
}

async function suspendWorkspace(workspaceId) {
    try {
        const response = await fetch(`${ORCHESTRATOR_URL}/suspend/${workspaceId}`, {
            method: 'POST',
            headers: {
                'X-API-Key': ORCHESTRATOR_API_KEY
            }
        });

        if (!response.ok) {
            console.error(`Failed to suspend workspace ${workspaceId}`);
        } else {
            console.log(`Suspended workspace ${workspaceId}`);
        }
    } catch (error) {
        console.error(`Error suspending workspace ${workspaceId}:`, error);
    }
}
