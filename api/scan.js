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

module.exports = async function handler(req, res) {
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
    if (!message) {
        return fallbackReport('Scan completed but no output was returned.');
    }

    // 1) Try to extract JSON from the agent's response
    try {
        const jsonMatch = message.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.security && parsed.dependencies) {
                return parsed;
            }
        }
    } catch (e) {
        console.log('[scan] No valid JSON found, falling back to NL parser');
    }

    // 2) Extract grades from natural language (explicit letter grades or inferred from keywords)
    const report = {
        security: extractCategory(message, 'security') || inferSecurityGrade(message),
        dependencies: extractCategory(message, 'dependenc') || inferDepsGrade(message),
        code_quality: extractCategory(message, 'code.?quality') || inferQualityGrade(message),
        test_coverage: extractCategory(message, 'test.?coverage') || inferTestGrade(message),
        findings: extractFindings(message),
        tech_debt_hours: extractTechDebt(message),
        summary: message.length > 500 ? message.slice(0, 500) + '...' : message
    };

    return report;
}

function extractCategory(text, category) {
    const patterns = [
        new RegExp(`${category}[:\\s\\-–]+grade[:\\s\\-–]*([A-Fa-f][+\\-]?)`, 'i'),
        new RegExp(`${category}[:\\s\\-–]+([A-Fa-f][+\\-]?)(?:[\\s,;\\.]|$)`, 'i'),
        new RegExp(`${category}\\s+([A-Fa-f][+\\-]?)(?:[\\s,;\\.]|$)`, 'i'),
        new RegExp(`([A-Fa-f][+\\-]?)\\s+(?:for|in)\\s+${category}`, 'i'),
    ];

    for (const pat of patterns) {
        const m = text.match(pat);
        if (m) {
            const grade = m[1].toUpperCase();
            const idx = text.indexOf(m[0]);
            const nearby = text.slice(Math.max(0, idx - 60), Math.min(text.length, idx + 120));
            const details = nearby.replace(/[\n\r]+/g, ' ').trim();
            return { grade, details };
        }
    }

    return null; // return null so we fall through to inference
}

// --- Grade inference from keywords when explicit grades aren't found ---

function inferSecurityGrade(text) {
    const t = text.toLowerCase();
    if (/hardcoded\s+(secret|api.?key|token|credential|password)/i.test(t) ||
        /critical\s+security/i.test(t) ||
        /exposed\s+.*client.?side/i.test(t)) {
        return { grade: 'F', details: 'Critical security issues detected (hardcoded secrets/keys)' };
    }
    if (/security\s+(issue|vulnerabilit|concern|warning)/i.test(t)) {
        return { grade: 'D', details: 'Security issues found' };
    }
    if (/no\s+(major\s+)?security\s+issue/i.test(t) || /security.*clean/i.test(t)) {
        return { grade: 'A', details: 'No security issues found' };
    }
    return { grade: '?', details: 'Could not determine security grade' };
}

function inferDepsGrade(text) {
    const t = text.toLowerCase();
    if (/no\s+(package\.json|dependency\s+manage|dependenc)/i.test(t) ||
        /lacks?\s+dependency\s+manage/i.test(t)) {
        return { grade: 'D', details: 'No dependency management found' };
    }
    if (/severely\s+outdated|major.*outdated/i.test(t)) {
        return { grade: 'F', details: 'Severely outdated dependencies' };
    }
    if (/outdated\s+(package|dependenc)/i.test(t)) {
        return { grade: 'C', details: 'Some outdated dependencies' };
    }
    if (/dependenc.*up.?to.?date|all\s+current/i.test(t)) {
        return { grade: 'A', details: 'Dependencies are up to date' };
    }
    return { grade: '?', details: 'Could not determine dependency grade' };
}

function inferQualityGrade(text) {
    const t = text.toLowerCase();
    if (/no\s+(linting|lint|eslint|formatting|prettier)/i.test(t) &&
        /no\s+(type|typescript)/i.test(t)) {
        return { grade: 'F', details: 'No linting or type checking configured' };
    }
    if (/no\s+(linting|lint|eslint|formatting)/i.test(t) ||
        /lacks?\s+(linting|lint|formatting)/i.test(t)) {
        return { grade: 'D', details: 'No linting/formatting configuration' };
    }
    if (/clean\s+code|well.?structured/i.test(t)) {
        return { grade: 'A', details: 'Clean, well-structured code' };
    }
    return { grade: '?', details: 'Could not determine code quality grade' };
}

function inferTestGrade(text) {
    const t = text.toLowerCase();
    if (/zero\s+test\s+coverage/i.test(t) ||
        /no\s+test/i.test(t) ||
        /lacks?\s+test/i.test(t) ||
        /missing\s+test/i.test(t)) {
        return { grade: 'F', details: 'No tests found' };
    }
    if (/low\s+test\s+coverage/i.test(t) || /minimal\s+test/i.test(t)) {
        return { grade: 'D', details: 'Low test coverage' };
    }
    if (/good\s+test\s+coverage|high\s+test\s+coverage|>?\s*80%/i.test(t)) {
        return { grade: 'A', details: 'Good test coverage' };
    }
    return { grade: '?', details: 'Could not determine test coverage grade' };
}

function extractFindings(text) {
    const findings = [];
    const sentences = text.split(/[.!]\s+/);
    const seen = new Set();

    const criticalPats = [
        /hardcoded\s+(?:secrets?|api\s*keys?|credentials?|tokens?)/i,
        /(?:critical|severe)\s+(?:security\s+)?vulnerabilit/i,
        /\.env\s+files?\s+committed/i,
        /exposed\s+(?:in\s+)?client[\-\s]side/i,
    ];
    const warningPats = [
        /(?:no|lacks?|missing)\s+(?:test|testing)/i,
        /outdated\s+(?:packages?|dependencies)/i,
        /deprecated\s+packages?/i,
        /(?:no|lacks?|missing)\s+(?:linting|lint)/i,
    ];
    const infoPats = [
        /(?:no|lacks?|missing)\s+dependency\s+management/i,
        /dead\s+code/i,
        /unused\s+imports?/i,
    ];

    for (const s of sentences) {
        const trimmed = s.trim();
        if (!trimmed || trimmed.length < 10 || seen.has(trimmed)) continue;

        let matched = false;
        for (const pat of criticalPats) {
            if (pat.test(trimmed)) {
                seen.add(trimmed);
                findings.push({ severity: 'critical', message: trimmed });
                matched = true;
                break;
            }
        }
        if (matched) continue;

        for (const pat of warningPats) {
            if (pat.test(trimmed)) {
                seen.add(trimmed);
                findings.push({ severity: 'warning', message: trimmed });
                matched = true;
                break;
            }
        }
        if (matched) continue;

        for (const pat of infoPats) {
            if (pat.test(trimmed)) {
                seen.add(trimmed);
                findings.push({ severity: 'info', message: trimmed });
                break;
            }
        }
    }

    if (findings.length === 0) {
        findings.push({ severity: 'info', message: text.length > 300 ? text.slice(0, 300) + '...' : text });
    }

    return findings;
}

function extractTechDebt(text) {
    const m = text.match(/(\d+)\s*(?:hours?|hrs?)\s*(?:of\s+)?(?:tech[\s\-]?debt|to\s+remediate)/i);
    if (m) return parseInt(m[1], 10);
    const m2 = text.match(/(\d+)\s*(?:hours?|hrs?)/i);
    if (m2) return parseInt(m2[1], 10);
    return null;
}

function fallbackReport(message) {
    return {
        security: { grade: '?', details: 'Could not parse detailed results' },
        dependencies: { grade: '?', details: 'Could not parse detailed results' },
        code_quality: { grade: '?', details: 'Could not parse detailed results' },
        test_coverage: { grade: '?', details: 'Could not parse detailed results' },
        findings: [{ severity: 'info', message }],
        tech_debt_hours: null,
        summary: message
    };
}
