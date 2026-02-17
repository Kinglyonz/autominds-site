/**
 * GitHub OAuth — Callback Handler
 * Exchanges the authorization code for an access token,
 * then redirects back to the site with the token.
 */

module.exports = async function handler(req, res) {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Missing authorization code');
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return res.status(500).send('GitHub OAuth not configured');
    }

    try {
        // Exchange code for access token
        const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
            }),
        });

        const tokenData = await tokenResp.json();

        if (tokenData.error) {
            console.error('[github-callback] Token error:', tokenData.error_description);
            return res.status(400).send(`GitHub auth failed: ${tokenData.error_description}`);
        }

        const accessToken = tokenData.access_token;

        // Fetch user profile
        const userResp = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });

        const user = await userResp.json();

        // Redirect back to the site with token + user info encoded in the hash
        // Hash fragment is never sent to the server = safer than query params
        const proto = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;

        const payload = encodeURIComponent(JSON.stringify({
            token: accessToken,
            login: user.login,
            avatar: user.avatar_url,
            name: user.name || user.login,
        }));

        res.writeHead(302, {
            Location: `${proto}://${host}/login.html#github_auth=${payload}`
        });
        res.end();

    } catch (err) {
        console.error('[github-callback] Error:', err);
        res.status(500).send('Authentication failed');
    }
};
