/**
 * Google OAuth — Initiate Authorization
 * Redirects user to Google's OAuth consent screen
 */

module.exports = async function handler(req, res) {
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
        return res.status(500).json({ error: 'Google OAuth not configured' });
    }

    // Build the callback URL dynamically based on the request
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const redirectUri = `${proto}://${host}/api/google-callback`;

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'online',
        prompt: 'select_account',
        state: Math.random().toString(36).substring(2, 15),
    });

    res.writeHead(302, {
        Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    });
    res.end();
};
