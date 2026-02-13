/**
 * AutoMinds Onboarding API
 * Receives repo details from new subscribers after checkout.
 * 
 * POST /api/onboard
 * Body: { repo_url, email, slack, priorities, session_id, timestamp }
 * 
 * For now: logs to Vercel + sends email notification.
 * Future: Store in database.
 */

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { repo_url, email, slack, priorities, session_id, timestamp } = req.body;

        if (!repo_url) {
            return res.status(400).json({ error: 'repo_url is required' });
        }

        // Log the onboarding (visible in Vercel Function Logs)
        console.log('=== NEW CUSTOMER ONBOARDING ===');
        console.log(`Repo:       ${repo_url}`);
        console.log(`Email:      ${email || 'not provided'}`);
        console.log(`Slack:      ${slack || 'not provided'}`);
        console.log(`Priorities: ${priorities || 'not specified'}`);
        console.log(`Session:    ${session_id}`);
        console.log(`Time:       ${timestamp}`);
        console.log('================================');

        // TODO: Store in Supabase/database
        // TODO: Send Slack/email notification to yourself
        // TODO: Auto-trigger first deep scan via Warp Oz

        return res.status(200).json({ 
            success: true, 
            message: 'Onboarding received. We\'ll start your first scan shortly.' 
        });

    } catch (error) {
        console.error('[onboard] Error:', error);
        return res.status(500).json({ error: 'Failed to process onboarding' });
    }
}
