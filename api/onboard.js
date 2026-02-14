/**
 * AutoMinds Onboarding API
 * Receives repo details from new subscribers after checkout.
 * Auto-triggers first Warp Oz maintenance scan.
 * 
 * POST /api/onboard
 * Body: { repo_url, email, slack, priorities, session_id, timestamp }
 */

const { handlePreflight, setCors, validateRepoUrl } = require('./_cors');

const WARP_API_BASE = 'https://app.warp.dev/api/v1';
const WARP_API_KEY = process.env.WARP_API_KEY;
const WARP_ENVIRONMENT_ID = process.env.WARP_ENVIRONMENT_ID;

module.exports = async function handler(req, res) {
    if (handlePreflight(req, res)) return;
    setCors(req, res);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { repo_url, email, slack, priorities, session_id, timestamp } = req.body;

        const validation = validateRepoUrl(repo_url);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const repoSlug = validation.slug;
        const safeUrl = validation.url;

        // Log the onboarding (visible in Vercel Function Logs)
        console.log('=== NEW CUSTOMER ONBOARDING ===');
        console.log(`Repo:       ${repoSlug}`);
        console.log(`Email:      ${email || 'not provided'}`);
        console.log(`Slack:      ${slack || 'not provided'}`);
        console.log(`Priorities: ${priorities || 'not specified'}`);
        console.log(`Session:    ${session_id}`);
        console.log(`Time:       ${timestamp}`);
        console.log('================================');

        // Auto-trigger first maintenance scan via Warp Oz
        let firstScanId = null;
        try {
            firstScanId = await triggerFirstScan(safeUrl, repoSlug);
            console.log(`[onboard] First scan triggered: ${firstScanId}`);
        } catch (scanErr) {
            console.error(`[onboard] First scan failed to start: ${scanErr.message}`);
            // Don't fail the onboarding if scan fails to start
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Onboarding received. Your first scan is running now.',
            scan_run_id: firstScanId
        });

    } catch (error) {
        console.error('[onboard] Error:', error);
        return res.status(500).json({ error: 'Failed to process onboarding' });
    }
};

async function triggerFirstScan(repoUrl, repoSlug) {
    const prompt = `You are an automated repo maintenance agent for AutoMinds.

TASK: Clone and perform an initial deep analysis + quick fixes on a new customer's repo.

1. git clone ${repoUrl} /workspace/repo && cd /workspace/repo
2. Run a full health check:
   - Security audit (npm audit / pip audit / etc.)
   - Dependency freshness check
   - Lint check (if config exists)
   - Test check (if tests exist)
3. Auto-fix what you can:
   - npm audit fix (if applicable)
   - Update non-breaking dependencies
   - Fix lint errors if eslint --fix is available
4. Report everything you found and fixed.

RESPOND IN JSON:
{
  "repo": "${repoSlug}",
  "health_grades": {
    "security": "A-F",
    "dependencies": "A-F", 
    "code_quality": "A-F",
    "test_coverage": "A-F"
  },
  "actions_taken": [{"category": "...", "action": "...", "files_changed": []}],
  "issues_found": [{"severity": "critical|warning|info", "description": "..."}],
  "summary": "Overall assessment and what was done"
}`;

    const body = { prompt, model_id: 'claude-sonnet-4-20250514' };
    if (WARP_ENVIRONMENT_ID) body.environment_id = WARP_ENVIRONMENT_ID;

    const resp = await fetch(`${WARP_API_BASE}/agent/runs`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${WARP_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Warp API error: ${err}`);
    }

    const data = await resp.json();
    return data.run_id;
}
