// Vercel serverless proxy — forwards HTTPS requests to the VPS email agent
// This solves the mixed-content issue (HTTPS site → HTTP VPS)

const VPS_URL = 'http://178.156.253.35';

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Route: /api/email-proxy?action=demo/triage
  const action = req.query.action;
  if (!action) {
    return res.status(400).json({ error: 'Missing ?action= parameter' });
  }

  const targetUrl = `${VPS_URL}/api/${action}`;

  try {
    const fetchOpts = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (req.method === 'POST' && req.body) {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(targetUrl, fetchOpts);
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(502).json({ error: 'Email agent unavailable', detail: err.message });
  }
}
