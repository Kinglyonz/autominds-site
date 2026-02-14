/**
 * GitHub OAuth — Initiate Authorization
 * Redirects user to GitHub's OAuth authorize page
 */

module.exports = async function handler(req, res) {
    const clientId = process.env.GITHUB_CLIENT_ID;

    if (!clientId) {
        return res.status(500).json({ error: 'GitHub OAuth not configured' });
    }

    // Build the callback URL dynamically based on the request
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const redirectUri = `${proto}://${host}/api/github-callback`;

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'read:user,repo',
        state: Math.random().toString(36).substring(2, 15),
    });

    res.writeHead(302, {
        Location: `https://github.com/login/oauth/authorize?${params.toString()}`
    });
    res.end();
};
