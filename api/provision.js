export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // Get API key from request headers
        const apiKey = req.headers['x-api-key'] || 'gW5RxF7VAsXnbEPXM4uhrVRjH9uAhA3f';
        
        // Parse body if needed
        let body = req.body;
        if (typeof body === 'string') {
            body = JSON.parse(body);
        }
        
        console.log('Proxying request with body:', JSON.stringify(body));
        
        const response = await fetch('http://98.94.10.180/api/provision', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
            },
            body: JSON.stringify(body),
        });
        
        const data = await response.json();
        console.log('Response from orchestrator:', response.status, JSON.stringify(data));
        return res.status(response.status).json(data);
    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(500).json({ error: 'Failed to connect to provisioning server', detail: error.message });
    }
}
