/**
 * Google OAuth — Callback Handler
 * Exchanges the authorization code for tokens,
 * fetches user profile, and redirects back to the site.
 */

module.exports = async function handler(req, res) {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Missing authorization code');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return res.status(500).send('Google OAuth not configured');
    }

    // Build redirect URI to match what was sent in the auth request
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const redirectUri = `${proto}://${host}/api/google-callback`;

    try {
        // Exchange code for access token
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
            }).toString(),
        });

        const tokenData = await tokenResp.json();

        if (tokenData.error) {
            console.error('[google-callback] Token error:', tokenData.error_description);
            return res.status(400).send(`Google auth failed: ${tokenData.error_description}`);
        }

        const accessToken = tokenData.access_token;

        // Fetch user profile from Google
        const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const user = await userResp.json();

        // Redirect back to the login page with user info in hash fragment
        const payload = encodeURIComponent(JSON.stringify({
            token: accessToken,
            name: user.name,
            email: user.email,
            avatar: user.picture,
        }));

        res.writeHead(302, {
            Location: `${proto}://${host}/login.html#google_auth=${payload}`
        });
        res.end();

    } catch (err) {
        console.error('[google-callback] Error:', err);
        res.status(500).send('Authentication failed');
    }
};
