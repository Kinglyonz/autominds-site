/**
 * AutoMinds Repo Scan API
 * Vercel Serverless Function
 * 
 * Accepts a GitHub repo URL, triggers a Warp Oz agent to analyze it,
 * waits for results, and returns a structured health report.
 */

const WARP_API_BASE = 'https://app.warp.dev/api/v1';
const WARP_API_KEY = process.env.WARP_API_KEY;
const WARP_ENVIRONMENT_ID = process.env.WARP_ENVIRONMENT_ID;

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { repo_url, repo_slug } = req.body;

        if (!repo_url || !repo_slug) {
            return res.status(400).json({ error: 'repo_url and repo_slug are required' });
        }

        // Validate it's a GitHub URL
        if (!repo_url.includes('github.com/')) {
            return res.status(400).json({ error: 'Only GitHub repositories are supported' });
        }

        console.log(`[scan] Starting scan for ${repo_slug}`);

        // Build the analysis prompt
        const prompt = buildScanPrompt(repo_url, repo_slug);

        // Trigger Warp Oz agent
        const runId = await triggerOzRun(prompt);
        console.log(`[scan] Oz run started: ${runId}`);

        // Poll for completion (max 3 minutes)
        const result = await waitForRun(runId, 180000);
        console.log(`[scan] Oz run completed: ${result.state}`);

        if (result.state !== 'SUCCEEDED') {
            return res.status(500).json({ 
                error: 'Scan failed', 
                detail: result.status_message?.message || 'Agent run did not complete successfully'
            });
        }

        // Parse the agent's response into structured data
        const report = parseReport(result.status_message?.message || '');

        return res.status(200).json(report);

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

async function waitForRun(runId, timeoutMs) {
    const start = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - start < timeoutMs) {
        const resp = await fetch(`${WARP_API_BASE}/agent/runs/${runId}`, {
            headers: { 'Authorization': `Bearer ${WARP_API_KEY}` }
        });

        if (!resp.ok) {
            throw new Error(`Failed to check run status: ${resp.statusText}`);
        }

        const run = await resp.json();

        if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(run.state)) {
            return run;
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Scan timed out after 3 minutes');
}

function parseReport(message) {
    // Try to extract JSON from the agent's response
    try {
        // Look for JSON in the message
        const jsonMatch = message.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error('[scan] Failed to parse JSON from agent response:', e);
    }

    // Fallback: return a basic report based on the message
    return {
        security: { grade: '?', details: 'Could not parse detailed results' },
        dependencies: { grade: '?', details: 'Could not parse detailed results' },
        code_quality: { grade: '?', details: 'Could not parse detailed results' },
        test_coverage: { grade: '?', details: 'Could not parse detailed results' },
        findings: [
            { severity: 'info', message: message || 'Scan completed but results could not be parsed' }
        ],
        tech_debt_hours: null,
        summary: message || 'Scan completed'
    };
}
