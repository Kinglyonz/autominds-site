// Health check proxy — verifies VPS email agent is alive
const VPS_URL = 'http://178.156.253.35';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const upstream = await fetch(`${VPS_URL}/health`);
    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ status: 'offline', error: err.message });
  }
}
