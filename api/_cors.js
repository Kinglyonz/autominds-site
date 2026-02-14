/**
 * Shared CORS + security helpers for all API endpoints.
 * Restricts origins to our actual domain instead of wildcard '*'.
 */

const ALLOWED_ORIGINS = [
    'https://autominds-site-repo.vercel.app',
    'https://www.autominds.org',
    'https://autominds.org',
];

// In development, also allow localhost
if (process.env.NODE_ENV !== 'production') {
    ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:5173');
}

/**
 * Set CORS headers with origin whitelist
 */
function setCors(req, res) {
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        // Default to main production domain
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Handle preflight OPTIONS request
 * Returns true if it was an OPTIONS request (caller should return early)
 */
function handlePreflight(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return true;
    }
    return false;
}

/**
 * Validate and sanitize a GitHub repo URL.
 * Returns { valid, slug, url } or { valid: false, error }
 */
function validateRepoUrl(repoUrl) {
    if (!repoUrl || typeof repoUrl !== 'string') {
        return { valid: false, error: 'repo_url is required' };
    }

    // Strip whitespace
    const cleaned = repoUrl.trim();

    // Must be a GitHub URL
    const match = cleaned.match(/^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\/?$/);
    if (!match) {
        return { valid: false, error: 'Invalid GitHub URL. Expected format: https://github.com/owner/repo' };
    }

    const slug = match[1].replace(/\.git$/, '');

    // Extra safety: reject anything with shell metacharacters
    if (/[;&|`$(){}!<>\\]/.test(slug)) {
        return { valid: false, error: 'Invalid repository name' };
    }

    return { valid: true, slug, url: `https://github.com/${slug}` };
}

module.exports = { setCors, handlePreflight, validateRepoUrl, ALLOWED_ORIGINS };
