/**
 * AutoMinds Repo Health Scanner
 * Frontend logic for the free repo scan.
 * 
 * Flow:
 * 1. User submits GitHub URL
 * 2. POST /api/scan → returns run_id immediately
 * 3. Poll GET /api/run-status?run_id=xxx every 8s
 * 4. When SUCCEEDED → display parsed results
 */

const SCAN_API = '/api/scan';
const STATUS_API = '/api/run-status';
const POLL_INTERVAL = 8000; // 8 seconds
const MAX_POLL_TIME = 600000; // 10 minutes max

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
        setLoading(true);
        showProgress('Starting scan...');

        try {
            // Step 1: Trigger the scan
            const response = await fetch(SCAN_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo_url: repoUrl })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Scan failed: ${response.statusText}`);
            }

            const { run_id } = await response.json();
            if (!run_id) throw new Error('No run ID returned');

            // Step 2: Poll for results
            showProgress('AI agent is analyzing your repo...');
            const result = await pollForResults(run_id);

            // Step 3: Display results
            displayResults(repoSlug, result);

        } catch (err) {
            console.error('Scan error:', err);
            alert(err.message || 'Scan failed. Please check the URL and try again.');
            hideProgress();
        } finally {
            setLoading(false);
        }
    });
}

/**
 * Poll /api/run-status until the run completes
 */
async function pollForResults(runId) {
    const start = Date.now();
    let dots = 0;

    while (Date.now() - start < MAX_POLL_TIME) {
        await sleep(POLL_INTERVAL);
        dots = (dots + 1) % 4;
        showProgress('AI agent is analyzing your repo' + '.'.repeat(dots + 1));

        try {
            const resp = await fetch(`${STATUS_API}?run_id=${encodeURIComponent(runId)}`);
            if (!resp.ok) continue;

            const data = await resp.json();

            if (data.state === 'SUCCEEDED' && data.result) {
                return data.result;
            }

            if (data.state === 'FAILED' || data.state === 'CANCELLED') {
                throw new Error(data.error || 'Scan failed — the AI agent encountered an error.');
            }

            // Still running — update progress based on elapsed time
            const elapsed = Math.round((Date.now() - start) / 1000);
            if (elapsed > 120) {
                showProgress('Deep analysis in progress — almost done...');
            } else if (elapsed > 60) {
                showProgress('Checking security, dependencies, tests...');
            }

        } catch (err) {
            if (err.message.includes('Scan failed')) throw err;
            // Network error — keep polling
            console.warn('Poll error, retrying...', err);
        }
    }

    throw new Error('Scan timed out. Large repos may take longer — try again.');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function setLoading(loading) {
    if (btnText) btnText.style.display = loading ? 'none' : 'inline';
    if (btnLoading) btnLoading.style.display = loading ? 'inline-flex' : 'none';
    if (submitBtn) submitBtn.disabled = loading;
}

function showProgress(text) {
    // Show a progress indicator in the results area
    if (results) {
        results.style.display = 'block';
        results.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <div class="scan-spinner"></div>
                <p style="color: var(--text-secondary); margin-top: 1rem;">${text}</p>
            </div>
        `;
    }
}

function hideProgress() {
    if (results) results.style.display = 'none';
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
                        <span class="finding-text">${escapeHtml(f.message)}</span>
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

    // Show summary if available
    if (data.summary) {
        const summaryEl = document.getElementById('scan-summary');
        if (summaryEl) {
            summaryEl.textContent = data.summary;
            summaryEl.style.display = 'block';
        }
    }

    results.style.display = 'block';
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setMetric(valueId, cardId, metric) {
    const el = document.getElementById(valueId);
    const card = document.getElementById(cardId);
    
    if (!metric) {
        if (el) el.textContent = '—';
        return;
    }

    if (el) el.textContent = metric.grade || metric.score || '—';
    
    // Color code based on grade letter
    const grade = (metric.grade || '')[0]?.toUpperCase();
    const colors = {
        'A': { border: 'rgba(34, 197, 94, 0.4)', text: '#22c55e' },
        'B': { border: 'rgba(59, 130, 246, 0.4)', text: '#3B82F6' },
        'C': { border: 'rgba(255, 153, 0, 0.4)', text: '#ff9900' },
        'D': { border: 'rgba(239, 68, 68, 0.4)', text: '#ef4444' },
        'F': { border: 'rgba(239, 68, 68, 0.4)', text: '#ef4444' },
    };

    if (colors[grade] && card && el) {
        card.style.borderColor = colors[grade].border;
        el.style.color = colors[grade].text;
    }

    // Show details as hover tooltip
    if (metric.details && card) {
        card.title = metric.details;
    }
}

/**
 * Escape HTML to prevent XSS in findings display
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
