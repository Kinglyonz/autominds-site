export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }
        
        const apiKey = req.headers['x-api-key'] || 'gW5RxF7VAsXnbEPXM4uhrVRjH9uAhA3f';
        
        const response = await fetch(`http://98.94.10.180/api/lookup/${encodeURIComponent(email)}`, {
            method: 'GET',
            headers: {
                'X-API-Key': apiKey,
            },
        });
        
        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(500).json({ error: 'Failed to lookup workspace', detail: error.message });
    }
}
