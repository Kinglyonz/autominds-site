// Vercel serverless proxy — forwards HTTPS requests to the VPS email agent
// This solves the mixed-content issue (HTTPS site → HTTP VPS)

const VPS_URL = 'http://178.156.253.35';

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Route: /api/email-proxy?action=demo/triage  OR  ?action=health
  const action = req.query.action;
  if (!action) {
    return res.status(400).json({ error: 'Missing ?action= parameter' });
  }

  // Health check shortcut
  if (action === 'health') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const upstream = await fetch(`${VPS_URL}/health`, { signal: controller.signal });
        const data = await upstream.json();
        return res.status(200).json(data);
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      return res.status(502).json({ status: 'offline', error: err.message });
    }
  }

  // Gmail OAuth — redirect user to VPS /auth/gmail which sends them to Google
  if (action === 'gmail-auth') {
    return res.redirect(302, `${VPS_URL}/auth/gmail`);
  }

  // User endpoints (GET/POST/DELETE) — /api/email-proxy?action=user/me etc.
  const targetUrl = action.startsWith('user/') 
    ? `${VPS_URL}/api/${action}`
    : `${VPS_URL}/api/${action}`;

  try {
    const headers = { 'Content-Type': 'application/json' };
    
    // Forward Authorization header for session-based auth
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    const fetchOpts = {
      method: req.method,
      headers,
    };

    if ((req.method === 'POST' || req.method === 'DELETE') && req.body) {
      fetchOpts.body = JSON.stringify(req.body);
    }

    // 55s timeout — under Vercel's 60s maxDuration
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    fetchOpts.signal = controller.signal;

    try {
      const upstream = await fetch(targetUrl, fetchOpts);
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    console.error('Proxy error:', isTimeout ? 'Request timed out (55s)' : err.message);
    return res.status(502).json({
      error: isTimeout
        ? 'Request took too long — please try again. The AI agent is processing your request.'
        : 'Email agent unavailable',
      detail: err.message,
    });
  }
}
