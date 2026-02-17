// Vercel serverless function — handles Google OAuth callback
// Google redirects here with ?code=..., we forward to VPS to exchange the code,
// then redirect the browser to email.html with the tokens.

const VPS_URL = 'http://178.156.253.35';

module.exports = async function handler(req, res) {
  const code = req.query.code;
  const scope = req.query.scope || '';

  if (!code) {
    return res.redirect(302, '/email.html?error=missing_code');
  }

  try {
    // Forward the code to VPS — it exchanges it with Google and returns a redirect
    const vpsCallback = `${VPS_URL}/auth/gmail/callback?code=${encodeURIComponent(code)}&scope=${encodeURIComponent(scope)}`;
    const upstream = await fetch(vpsCallback, { redirect: 'manual' });

    // VPS responds with 302 → /email.html#gmail_tokens=...
    const location = upstream.headers.get('location');
    if (location) {
      return res.redirect(302, location);
    }

    // If VPS returned an error body instead of a redirect
    const body = await upstream.text();
    console.error('VPS callback did not redirect:', upstream.status, body);
    return res.redirect(302, '/email.html?error=auth_failed');
  } catch (err) {
    console.error('Gmail callback proxy error:', err.message);
    return res.redirect(302, '/email.html?error=server_error');
  }
};
