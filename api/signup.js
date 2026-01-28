// Vercel Serverless Function - Studios Signup
// Calls orchestrator to provision workspace

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, name, company } = req.body;

        // Validate required fields
        if (!email || !name) {
            return res.status(400).json({ error: 'Email and name are required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Call orchestrator API to provision workspace
        const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'https://orchestrator.autominds.org';
        const orchestratorKey = process.env.ORCHESTRATOR_API_KEY;

        console.log(`Provisioning workspace for ${email}`);

        const response = await fetch(`${orchestratorUrl}/provision`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': orchestratorKey
            },
            body: JSON.stringify({
                email: email.toLowerCase().trim(),
                name: name.trim(),
                company: company?.trim() || null
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Orchestrator error:', error);
            return res.status(500).json({
                error: 'Failed to create workspace. Please try again later.'
            });
        }

        const workspace = await response.json();

        console.log(`Workspace provisioned: ${workspace.workspace_id}`);

        // TODO: Send welcome email with workspace credentials
        // For now, return credentials in response (they'll be shown on success page)

        // Return success
        return res.status(200).json({
            success: true,
            workspaceId: workspace.workspace_id,
            workspaceUrl: workspace.url,
            password: workspace.password,
            trialExpiry: workspace.trial_expires_at,
            message: 'Workspace created successfully!'
        });

    } catch (error) {
        console.error('Signup error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
