/**
 * AutoMinds Repo Scan API
 * Vercel Serverless Function
 * 
 * Accepts a GitHub repo URL, triggers a Warp Oz agent to analyze it,
 * and immediately returns a run_id. Frontend polls /api/run-status for results.
 * 
 * This is async because Vercel has a 10s timeout — Warp scans take minutes.
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
        const { repo_url } = req.body;

        const validation = validateRepoUrl(repo_url);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const repoSlug = validation.slug;
        const safeUrl = validation.url;

        console.log(`[scan] Starting scan for ${repoSlug}`);

        // Build the analysis prompt
        const prompt = buildScanPrompt(safeUrl, repoSlug);

        // Trigger Warp Oz agent — returns immediately
        const runId = await triggerOzRun(prompt);
        console.log(`[scan] Oz run started: ${runId}`);

        // Return the run ID — frontend will poll /api/run-status
        return res.status(200).json({
            run_id: runId,
            status: 'started',
            message: `Scanning ${repoSlug}...`,
            poll_url: `/api/run-status?run_id=${runId}`
        });

    } catch (error) {
        console.error('[scan] Error:', error);
        return res.status(500).json({ error: 'Scan failed', detail: error.message });
    }
}

function buildScanPrompt(repoUrl, repoSlug) {
    return `You are a codebase health analyzer. Clone the repository and analyze it.

INSTRUCTIONS:
1. Run: git clone ${repoUrl} /workspace/repo
2. cd /workspace/repo
3. Analyze the following categories:

SECURITY:
- Check for known CVEs in dependencies (npm audit, pip audit, cargo audit, etc.)
- Look for hardcoded secrets/API keys
- Check for .env files committed
- Grade: A (no issues) to F (critical vulnerabilities)

DEPENDENCIES:
- List outdated packages
- Count how many are behind latest
- Check for deprecated packages
- Grade: A (all current) to F (severely outdated)

CODE QUALITY:
- Check for linting configuration
- Look for TypeScript/type checking
- Check for dead code, unused imports
- Grade: A (clean) to F (messy)

TEST COVERAGE:
- Check if tests exist
- Check test configuration (jest, pytest, etc.)
- Estimate coverage
- Grade: A (>80%) to F (no tests)

RESPOND IN THIS EXACT JSON FORMAT (nothing else, just the JSON):
{
  "security": { "grade": "A-F", "details": "brief explanation" },
  "dependencies": { "grade": "A-F", "details": "brief explanation" },
  "code_quality": { "grade": "A-F", "details": "brief explanation" },
  "test_coverage": { "grade": "A-F", "details": "brief explanation" },
  "findings": [
    { "severity": "critical|warning|info", "message": "description" }
  ],
  "tech_debt_hours": 10,
  "summary": "One paragraph summary of repo health"
}`;
}

async function triggerOzRun(prompt) {
    const body = {
        prompt,
        model_id: 'claude-sonnet-4-20250514'
    };

    // Only add environment_id if configured
    if (WARP_ENVIRONMENT_ID) {
        body.environment_id = WARP_ENVIRONMENT_ID;
    }

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
        throw new Error(`Failed to start Oz run: ${err}`);
    }

    const data = await resp.json();
    return data.run_id;
}
