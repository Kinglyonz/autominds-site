// Vercel serverless proxy — forwards contact form to VPS backend
const VPS_URL = 'http://178.156.253.35';

// ── Simple in-memory rate limiter (resets on cold start, still catches bursts) ──
const rateMap = new Map();
const RATE_WINDOW = 60_000; // 1 minute
const RATE_LIMIT = 3;       // max 3 submissions per IP per minute

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// ── Spam detection helpers ──
function looksLikeGibberish(str) {
  if (!str || str.length < 2) return false;
  // Ratio of uppercase to total letters is unusually high
  const letters = str.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  const ratio = upper / letters.length;
  if (ratio > 0.6 && letters.length > 6) return true;
  // No vowels in a long string → likely random
  const vowels = letters.replace(/[^aeiouAEIOU]/g, '').length;
  if (vowels === 0 && letters.length > 5) return true;
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // ── Rate limiting ──
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { name, email, subject, message, website, _ts } = req.body || {};

  // ── Honeypot ──
  if (website) {
    // Silently accept to not tip off bots, but don't forward
    return res.status(200).json({ ok: true });
  }

  // ── Timing check ──
  if (_ts) {
    const elapsed = Date.now() - Number(_ts);
    if (elapsed < 2000) {
      return res.status(200).json({ ok: true }); // too fast, silently drop
    }
  }

  // ── Basic field validation ──
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  if (typeof name !== 'string' || name.length > 200 || typeof message !== 'string' || message.length > 5000) {
    return res.status(400).json({ error: 'Invalid input.' });
  }

  // ── Gibberish detection ──
  if (looksLikeGibberish(name) || looksLikeGibberish(subject)) {
    return res.status(200).json({ ok: true }); // silently drop
  }

  // ── Forward clean data to VPS (strip honeypot/timing fields) ──
  try {
    const upstream = await fetch(`${VPS_URL}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, subject, message }),
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Backend unreachable' });
  }
};
