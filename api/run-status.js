/**
 * AutoMinds Run Status API
 * Check the status of a Warp Oz agent run.
 * 
 * GET /api/run-status?run_id=xxx
 */

const WARP_API_BASE = 'https://app.warp.dev/api/v1';
const WARP_API_KEY = process.env.WARP_API_KEY;

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { run_id } = req.query;

    if (!run_id) {
        return res.status(400).json({ error: 'run_id query parameter is required' });
    }

    try {
        const resp = await fetch(`${WARP_API_BASE}/agent/runs/${run_id}`, {
            headers: { 'Authorization': `Bearer ${WARP_API_KEY}` }
        });

        if (!resp.ok) {
            return res.status(resp.status).json({ error: `Warp API error: ${resp.statusText}` });
        }

        const run = await resp.json();

        return res.status(200).json({
            run_id: run.run_id || run_id,
            state: run.state,
            result: run.status_message?.message || null,
            created_at: run.created_at,
            completed_at: run.completed_at
        });

    } catch (error) {
        console.error('[run-status] Error:', error);
        return res.status(500).json({ error: 'Failed to check run status', detail: error.message });
    }
};
