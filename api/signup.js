// Vercel Serverless Function - Studios Signup
// Handles free trial signup and workspace creation

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// Helper to generate unique workspace ID
function generateWorkspaceId() {
    return crypto.randomBytes(16).toString('hex');
}

// Helper to calculate trial expiry (7 days from now)
function getTrialExpiry() {
    const now = new Date();
    const expiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return expiry.toISOString();
}

// Main handler
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

        // Generate workspace
        const workspaceId = generateWorkspaceId();
        const trialExpiry = getTrialExpiry();
        const createdAt = new Date().toISOString();

        // Create workspace record
        const workspace = {
            id: workspaceId,
            email: email.toLowerCase().trim(),
            name: name.trim(),
            company: company?.trim() || null,
            status: 'trial',
            trialExpiry,
            createdAt,
            lastAccessed: createdAt,
            isPaid: false
        };

        // In production, save to database (Supabase, PostgreSQL, etc.)
        // For MVP, we'll store in a JSON file
        const dataDir = '/tmp/workspaces'; // Vercel /tmp is ephemeral but works for MVP
        const dataFile = path.join(dataDir, 'workspaces.json');

        try {
            // Create directory if it doesn't exist
            await fs.mkdir(dataDir, { recursive: true });

            // Read existing workspaces
            let workspaces = [];
            try {
                const data = await fs.readFile(dataFile, 'utf8');
                workspaces = JSON.parse(data);
            } catch (err) {
                // File doesn't exist yet, start with empty array
                workspaces = [];
            }

            // Check if email already exists
            const existingWorkspace = workspaces.find(w => w.email === workspace.email);
            if (existingWorkspace && existingWorkspace.status === 'trial') {
                // Return existing trial workspace
                return res.status(200).json({
                    success: true,
                    workspaceId: existingWorkspace.id,
                    workspaceUrl: `https://ide.autominds.org/workspace/${existingWorkspace.id}`,
                    trialExpiry: existingWorkspace.trialExpiry,
                    message: 'Welcome back! Your trial is still active.'
                });
            }

            // Add new workspace
            workspaces.push(workspace);

            // Save to file
            await fs.writeFile(dataFile, JSON.stringify(workspaces, null, 2));

            // TODO: Send welcome email with workspace link
            // For now, we just return the workspace URL

            // Return success
            return res.status(200).json({
                success: true,
                workspaceId: workspace.id,
                workspaceUrl: `https://ide.autominds.org/workspace/${workspace.id}`,
                trialExpiry: workspace.trialExpiry,
                message: 'Workspace created successfully!'
            });

        } catch (fileError) {
            console.error('File operation error:', fileError);
            return res.status(500).json({ error: 'Failed to create workspace. Please try again.' });
        }

    } catch (error) {
        console.error('Signup error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
