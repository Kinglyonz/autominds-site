/**
 * AutoMinds Autofix API
 * Triggers Warp Oz to automatically fix issues in a customer's repo.
 * Called after onboarding or on a schedule.
 * 
 * POST /api/autofix
 * Body: { repo_url, plan: "maintenance" | "devteam", task?: string }
 * 
 * For maintenance plan: runs dependency updates, security patches, lint fixes
 * For devteam plan: executes arbitrary dev tasks (features, bugs, refactors)
 */

const WARP_API_BASE = 'https://app.warp.dev/api/v1';
const WARP_API_KEY = process.env.WARP_API_KEY;
const WARP_ENVIRONMENT_ID = process.env.WARP_ENVIRONMENT_ID;

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { repo_url, plan, task } = req.body;

        if (!repo_url) {
            return res.status(400).json({ error: 'repo_url is required' });
        }

        const repoSlug = repo_url.replace('https://github.com/', '');
        console.log(`[autofix] Starting ${plan || 'maintenance'} run for ${repoSlug}`);

        let prompt;
        if (plan === 'devteam' && task) {
            prompt = buildDevTeamPrompt(repo_url, repoSlug, task);
        } else {
            prompt = buildMaintenancePrompt(repo_url, repoSlug);
        }

        // Trigger Warp Oz agent
        const runId = await triggerOzRun(prompt);
        console.log(`[autofix] Oz run started: ${runId}`);

        // For maintenance, we can fire-and-forget (runs take minutes)
        // Return the run ID so the caller can poll status
        return res.status(200).json({
            success: true,
            run_id: runId,
            message: `Autofix started for ${repoSlug}. Run ID: ${runId}`,
            status_url: `/api/run-status?run_id=${runId}`
        });

    } catch (error) {
        console.error('[autofix] Error:', error);
        return res.status(500).json({ error: 'Failed to start autofix', detail: error.message });
    }
};

function buildMaintenancePrompt(repoUrl, repoSlug) {
    return `You are an automated repo maintenance agent for AutoMinds.

TASK: Clone the repo, fix common issues, and create a detailed report.

INSTRUCTIONS:
1. git clone ${repoUrl} /workspace/repo && cd /workspace/repo
2. Analyze the repository and perform these maintenance tasks:

DEPENDENCY UPDATES:
- If package.json exists: run \`npm outdated\`, update non-breaking deps with \`npm update\`
- If requirements.txt exists: check for outdated packages
- If go.mod exists: run \`go get -u ./...\`
- Document what was updated

SECURITY FIXES:
- Run \`npm audit fix\` (or equivalent for the language)
- Check for .env files that shouldn't be committed
- Look for hardcoded secrets/API keys in source code
- If found, list the files and line numbers

LINT & CODE QUALITY:
- If eslint config exists: run \`npx eslint . --fix\` 
- If prettier config exists: run \`npx prettier --write .\`
- Remove unused imports if tooling supports it
- Document changes made

TEST CHECK:
- Run existing tests if test config exists
- Report test results

RESPOND IN THIS JSON FORMAT:
{
  "repo": "${repoSlug}",
  "actions_taken": [
    { "category": "dependencies|security|quality|tests", "action": "what was done", "files_changed": ["list of files"] }
  ],
  "issues_found": [
    { "severity": "critical|warning|info", "description": "what was found", "file": "path", "line": null }
  ],
  "summary": "One paragraph summary of what was done",
  "next_steps": ["recommended follow-up actions"]
}`;
}

function buildDevTeamPrompt(repoUrl, repoSlug, task) {
    return `You are a senior full-stack developer working for AutoMinds AI Dev Team.

REPO: ${repoUrl}
TASK FROM CUSTOMER: ${task}

INSTRUCTIONS:
1. git clone ${repoUrl} /workspace/repo && cd /workspace/repo
2. Understand the codebase structure (read README, package.json, main entry points)
3. Plan the implementation
4. Write the code changes
5. Run any existing tests to make sure nothing is broken
6. Create a detailed report

GUIDELINES:
- Follow existing code style and patterns
- Add comments for complex logic
- Don't break existing functionality
- If the task is unclear, document your assumptions

RESPOND IN THIS JSON FORMAT:
{
  "repo": "${repoSlug}",
  "task": "${task}",
  "plan": "Brief description of implementation approach",
  "changes": [
    { "file": "path/to/file", "action": "created|modified|deleted", "description": "what changed" }
  ],
  "test_results": "pass|fail|no_tests",
  "summary": "What was implemented and how",
  "pr_title": "Suggested PR title",
  "pr_body": "Suggested PR description in markdown"
}`;
}

async function triggerOzRun(prompt) {
    const body = {
        prompt,
        model_id: 'claude-sonnet-4-20250514'
    };

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
