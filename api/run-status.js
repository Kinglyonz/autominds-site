/**
 * AutoMinds Run Status API
 * Check the status of a Warp Oz agent run.
 * When the run is complete, parses the result into a structured report.
 * 
 * GET /api/run-status?run_id=xxx
 */

const { handlePreflight, setCors } = require('./_cors');

const WARP_API_BASE = 'https://app.warp.dev/api/v1';
const WARP_API_KEY = process.env.WARP_API_KEY;

module.exports = async function handler(req, res) {
    if (handlePreflight(req, res)) return;
    setCors(req, res);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { run_id } = req.query;

    if (!run_id || typeof run_id !== 'string' || run_id.length > 100) {
        return res.status(400).json({ error: 'Valid run_id query parameter is required' });
    }

    // Sanitize: only allow alphanumeric, dashes, underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(run_id)) {
        return res.status(400).json({ error: 'Invalid run_id format' });
    }

    try {
        const resp = await fetch(`${WARP_API_BASE}/agent/runs/${run_id}`, {
            headers: { 'Authorization': `Bearer ${WARP_API_KEY}` }
        });

        if (!resp.ok) {
            return res.status(resp.status).json({ error: `Warp API error: ${resp.statusText}` });
        }

        const run = await resp.json();

        // If still running, return status only
        if (!['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(run.state)) {
            return res.status(200).json({
                run_id: run.run_id || run_id,
                state: run.state,
                result: null
            });
        }

        // If failed/cancelled, return error
        if (run.state !== 'SUCCEEDED') {
            return res.status(200).json({
                run_id: run.run_id || run_id,
                state: run.state,
                result: null,
                error: run.status_message?.message || 'Run did not complete successfully'
            });
        }

        // Parse the agent's response into structured data
        const message = run.status_message?.message || '';
        const report = parseReport(message);

        return res.status(200).json({
            run_id: run.run_id || run_id,
            state: 'SUCCEEDED',
            result: report
        });

    } catch (error) {
        console.error('[run-status] Error:', error);
        return res.status(500).json({ error: 'Failed to check run status', detail: error.message });
    }
};

// --- Report parsing ---

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
        console.log('[run-status] No valid JSON found, falling back to NL parser');
    }

    // 2) Extract grades from natural language
    const report = {
        security: extractCategory(message, 'security') || inferGrade(message, 'security'),
        dependencies: extractCategory(message, 'dependenc') || inferGrade(message, 'dependencies'),
        code_quality: extractCategory(message, 'code.?quality') || inferGrade(message, 'code_quality'),
        test_coverage: extractCategory(message, 'test.?coverage') || inferGrade(message, 'test_coverage'),
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
    return null;
}

function inferGrade(text, category) {
    const t = text.toLowerCase();
    const gradeMap = {
        security: () => {
            if (/hardcoded\s+(secret|api.?key|token)/i.test(t) || /critical\s+security/i.test(t)) 
                return { grade: 'F', details: 'Critical security issues detected' };
            if (/security\s+(issue|vulnerabilit|concern)/i.test(t))
                return { grade: 'D', details: 'Security issues found' };
            if (/no\s+(major\s+)?security\s+issue/i.test(t))
                return { grade: 'A', details: 'No security issues found' };
            return { grade: '?', details: 'Could not determine grade' };
        },
        dependencies: () => {
            if (/no\s+(package\.json|dependency)/i.test(t))
                return { grade: 'D', details: 'No dependency management found' };
            if (/severely\s+outdated/i.test(t))
                return { grade: 'F', details: 'Severely outdated dependencies' };
            if (/outdated\s+(package|dependenc)/i.test(t))
                return { grade: 'C', details: 'Some outdated dependencies' };
            return { grade: '?', details: 'Could not determine grade' };
        },
        code_quality: () => {
            if (/no\s+(linting|lint|eslint)/i.test(t) && /no\s+(type|typescript)/i.test(t))
                return { grade: 'F', details: 'No linting or type checking' };
            if (/no\s+(linting|lint|eslint)/i.test(t))
                return { grade: 'D', details: 'No linting configuration' };
            return { grade: '?', details: 'Could not determine grade' };
        },
        test_coverage: () => {
            if (/zero\s+test|no\s+test|lacks?\s+test|missing\s+test/i.test(t))
                return { grade: 'F', details: 'No tests found' };
            if (/low\s+test/i.test(t))
                return { grade: 'D', details: 'Low test coverage' };
            return { grade: '?', details: 'Could not determine grade' };
        }
    };

    return (gradeMap[category] || (() => ({ grade: '?', details: 'Unknown' })))();
}

function extractFindings(text) {
    const findings = [];
    const sentences = text.split(/[.!]\s+/);
    const seen = new Set();

    const patterns = [
        { severity: 'critical', re: /hardcoded\s+(?:secrets?|api\s*keys?|credentials?|tokens?)/i },
        { severity: 'critical', re: /(?:critical|severe)\s+(?:security\s+)?vulnerabilit/i },
        { severity: 'critical', re: /\.env\s+files?\s+committed/i },
        { severity: 'warning', re: /(?:no|lacks?|missing)\s+(?:test|testing)/i },
        { severity: 'warning', re: /outdated\s+(?:packages?|dependencies)/i },
        { severity: 'warning', re: /(?:no|lacks?|missing)\s+(?:linting|lint)/i },
        { severity: 'info', re: /dead\s+code/i },
        { severity: 'info', re: /unused\s+imports?/i },
    ];

    for (const s of sentences) {
        const trimmed = s.trim();
        if (!trimmed || trimmed.length < 10 || seen.has(trimmed)) continue;

        for (const { severity, re } of patterns) {
            if (re.test(trimmed)) {
                seen.add(trimmed);
                findings.push({ severity, message: trimmed });
                break;
            }
        }
    }

    if (findings.length === 0 && text.length > 0) {
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
