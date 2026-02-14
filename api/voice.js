/**
 * AutoMinds Voice API
 * Bridges ElevenLabs Conversational AI with OpenClaw/Warp Oz.
 * 
 * POST /api/voice
 * Body: { text: string, action?: "scan" | "autofix" | "status", repo_url?: string }
 * 
 * This endpoint is called by ElevenLabs agent as a custom tool.
 * It processes voice commands and triggers the appropriate AutoMinds action.
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
        const { action, repo_url, run_id, task } = req.body;

        switch (action) {
            case 'scan':
                return await handleScan(req, res, repo_url);
            case 'autofix':
                return await handleAutofix(req, res, repo_url, task);
            case 'status':
                return await handleStatus(req, res, run_id);
            default:
                return res.status(200).json({
                    response: "I can scan a repo, run auto-fixes, or check the status of a running task. What would you like me to do?"
                });
        }

    } catch (error) {
        console.error('[voice] Error:', error);
        return res.status(200).json({
            response: `Something went wrong: ${error.message}. Want me to try again?`
        });
    }
};

async function handleScan(req, res, repoUrl) {
    if (!repoUrl) {
        return res.status(200).json({
            response: "I need a GitHub repo URL to scan. What repo should I analyze?"
        });
    }

    const repoSlug = repoUrl.replace('https://github.com/', '');
    
    try {
        const runId = await triggerOz(`Analyze the GitHub repository ${repoUrl}. Clone it, check security, dependencies, code quality, and test coverage. Give a brief verbal summary with letter grades A through F for each category.`);
        
        return res.status(200).json({
            response: `I've started scanning ${repoSlug}. This usually takes 1-2 minutes. I'll have your health grades ready shortly.`,
            run_id: runId
        });
    } catch (err) {
        return res.status(200).json({
            response: `I couldn't start the scan for ${repoSlug}. The error was: ${err.message}`
        });
    }
}

async function handleAutofix(req, res, repoUrl, task) {
    if (!repoUrl) {
        return res.status(200).json({
            response: "Which repo should I fix? Give me the GitHub URL."
        });
    }

    const repoSlug = repoUrl.replace('https://github.com/', '');
    const prompt = task
        ? `Clone ${repoUrl} and perform this task: ${task}. Report what you changed.`
        : `Clone ${repoUrl} and run maintenance: update dependencies, fix security issues, fix lint errors. Report what you changed.`;

    try {
        const runId = await triggerOz(prompt);
        return res.status(200).json({
            response: `Auto-fix started on ${repoSlug}. ${task ? 'Working on: ' + task : 'Running standard maintenance.'}`,
            run_id: runId
        });
    } catch (err) {
        return res.status(200).json({
            response: `Couldn't start auto-fix: ${err.message}`
        });
    }
}

async function handleStatus(req, res, runId) {
    if (!runId) {
        return res.status(200).json({
            response: "I need a run ID to check the status. Which task are you asking about?"
        });
    }

    try {
        const resp = await fetch(`${WARP_API_BASE}/agent/runs/${runId}`, {
            headers: { 'Authorization': `Bearer ${WARP_API_KEY}` }
        });

        if (!resp.ok) {
            return res.status(200).json({ response: "I couldn't find that run. The ID might be wrong." });
        }

        const run = await resp.json();
        const state = run.state;

        if (state === 'SUCCEEDED') {
            const summary = run.status_message?.message;
            const brief = summary && summary.length > 300 ? summary.slice(0, 300) + '...' : summary;
            return res.status(200).json({
                response: `The task completed successfully. Here's the summary: ${brief || 'No details available.'}`
            });
        } else if (state === 'FAILED') {
            return res.status(200).json({
                response: "That task failed. Want me to try running it again?"
            });
        } else {
            return res.status(200).json({
                response: `That task is still running (status: ${state}). Check back in a minute or two.`
            });
        }
    } catch (err) {
        return res.status(200).json({
            response: `Error checking status: ${err.message}`
        });
    }
}

async function triggerOz(prompt) {
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
