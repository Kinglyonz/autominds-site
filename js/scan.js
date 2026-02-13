/**
 * AutoMinds Repo Health Scanner
 * Frontend logic for the free repo scan lead magnet.
 * Calls /api/scan which triggers Warp Oz to analyze the repo.
 */

const SCAN_API = '/api/scan';

const form = document.getElementById('scan-form');
const input = document.getElementById('repo-url');
const results = document.getElementById('scan-results');
const btnText = document.querySelector('.scan-btn-text');
const btnLoading = document.querySelector('.scan-btn-loading');
const submitBtn = document.querySelector('.scan-btn');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const repoUrl = input.value.trim();
        if (!repoUrl) return;

        // Validate GitHub URL
        const ghMatch = repoUrl.match(/github\.com\/([^\/]+\/[^\/\s]+)/);
        if (!ghMatch) {
            alert('Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo)');
            return;
        }

        const repoSlug = ghMatch[1].replace(/\.git$/, '');

        // Show loading state
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-flex';
        submitBtn.disabled = true;
        results.style.display = 'none';

        try {
            const response = await fetch(SCAN_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo_url: repoUrl, repo_slug: repoSlug })
            });

            if (!response.ok) {
                throw new Error(`Scan failed: ${response.statusText}`);
            }

            const data = await response.json();
            displayResults(repoSlug, data);

        } catch (err) {
            console.error('Scan error:', err);
            alert('Scan failed. Please check the URL and try again.');
        } finally {
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
            submitBtn.disabled = false;
        }
    });
}

function displayResults(repoSlug, data) {
    document.getElementById('scan-repo-name').textContent = repoSlug;
    
    // Set metric values with color coding
    setMetric('val-security', 'metric-security', data.security);
    setMetric('val-deps', 'metric-deps', data.dependencies);
    setMetric('val-quality', 'metric-quality', data.code_quality);
    setMetric('val-tests', 'metric-tests', data.test_coverage);

    // Detailed findings
    const details = document.getElementById('scan-details');
    if (data.findings && data.findings.length > 0) {
        details.innerHTML = `
            <h4 style="margin-bottom: 1rem; color: var(--text-primary);">Key Findings</h4>
            <ul class="findings-list">
                ${data.findings.map(f => `
                    <li class="finding ${f.severity}">
                        <span class="finding-severity">${f.severity.toUpperCase()}</span>
                        <span class="finding-text">${f.message}</span>
                    </li>
                `).join('')}
            </ul>
            <p style="margin-top: 1.5rem; color: var(--text-muted); font-size: 0.85rem;">
                Estimated <strong style="color: var(--text-primary);">${data.tech_debt_hours || '?'} hours</strong> of tech debt identified.
            </p>
        `;
    } else {
        details.innerHTML = '<p style="color: var(--text-secondary);">Analysis complete. See metrics above.</p>';
    }

    results.style.display = 'block';
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setMetric(valueId, cardId, metric) {
    const el = document.getElementById(valueId);
    const card = document.getElementById(cardId);
    
    if (!metric) {
        el.textContent = '—';
        return;
    }

    el.textContent = metric.grade || metric.score || '—';
    
    // Color code based on grade
    const grade = (metric.grade || '').toUpperCase();
    if (['A', 'A+'].includes(grade)) {
        card.style.borderColor = 'rgba(34, 197, 94, 0.4)';
        el.style.color = '#22c55e';
    } else if (['B', 'B+'].includes(grade)) {
        card.style.borderColor = 'rgba(59, 130, 246, 0.4)';
        el.style.color = '#3B82F6';
    } else if (['C', 'C+'].includes(grade)) {
        card.style.borderColor = 'rgba(255, 153, 0, 0.4)';
        el.style.color = '#ff9900';
    } else if (['D', 'F'].includes(grade)) {
        card.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        el.style.color = '#ef4444';
    }
}
