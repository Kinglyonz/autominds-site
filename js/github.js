/**
 * AutoMinds GitHub Integration
 * 
 * Handles GitHub OAuth sign-in, repo fetching, and the repo picker.
 * Zero friction: sign in once, pick repos from a dropdown, scan instantly.
 */

const GITHUB_STORAGE_KEY = 'autominds_github';

// ── Auth State ──────────────────────────────────────────────

function getGitHubUser() {
    try {
        const data = localStorage.getItem(GITHUB_STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

function saveGitHubUser(userData) {
    localStorage.setItem(GITHUB_STORAGE_KEY, JSON.stringify(userData));
}

function clearGitHubUser() {
    localStorage.removeItem(GITHUB_STORAGE_KEY);
}

// ── OAuth Flow ──────────────────────────────────────────────

/**
 * Check if we just returned from GitHub OAuth.
 * The callback puts auth data in the URL hash fragment.
 */
function handleOAuthReturn() {
    const hash = window.location.hash;
    if (!hash.includes('github_auth=')) return false;

    try {
        const encoded = hash.split('github_auth=')[1];
        const userData = JSON.parse(decodeURIComponent(encoded));
        saveGitHubUser(userData);

        // Clean the URL (remove hash fragment)
        history.replaceState(null, '', window.location.pathname);
        return true;
    } catch (e) {
        console.error('[github] Failed to parse OAuth return:', e);
        return false;
    }
}

function signInWithGitHub() {
    window.location.href = '/api/github-auth';
}

function signOut() {
    clearGitHubUser();
    updateUI();
}

// ── Repo Fetching ───────────────────────────────────────────

let cachedRepos = null;

async function fetchUserRepos() {
    const user = getGitHubUser();
    if (!user || !user.token) return [];

    if (cachedRepos) return cachedRepos;

    try {
        const resp = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&type=all', {
            headers: {
                Authorization: `Bearer ${user.token}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });

        if (!resp.ok) {
            if (resp.status === 401) {
                // Token expired — clear and let user re-auth
                clearGitHubUser();
                updateUI();
                return [];
            }
            throw new Error(`GitHub API ${resp.status}`);
        }

        const repos = await resp.json();
        cachedRepos = repos.map(r => ({
            full_name: r.full_name,
            name: r.name,
            html_url: r.html_url,
            private: r.private,
            description: r.description || '',
            language: r.language || '',
            updated_at: r.updated_at,
            stargazers_count: r.stargazers_count,
        }));

        return cachedRepos;
    } catch (err) {
        console.error('[github] Fetch repos error:', err);
        return [];
    }
}

// ── UI Updates ──────────────────────────────────────────────

function updateUI() {
    const user = getGitHubUser();
    const navAuth = document.getElementById('nav-github-auth');
    const scanAuth = document.getElementById('scan-github-auth');
    const repoPicker = document.getElementById('repo-picker-wrapper');
    const repoInput = document.getElementById('repo-url');
    const scanNote = document.querySelector('.scan-note');

    if (user) {
        // Nav: show avatar + name
        if (navAuth) {
            navAuth.innerHTML = `
                <div class="github-user">
                    <img src="${user.avatar}" alt="${user.login}" class="github-avatar">
                    <span class="github-username">${user.name || user.login}</span>
                    <button onclick="signOut()" class="github-signout" title="Sign out">✕</button>
                </div>
            `;
        }

        // Scan section: show sign-in as connected
        if (scanAuth) {
            scanAuth.innerHTML = `
                <div class="github-connected">
                    <img src="${user.avatar}" alt="${user.login}" class="github-avatar-sm">
                    <span>Connected as <strong>${user.login}</strong></span>
                </div>
            `;
        }

        // Show repo picker, load repos
        if (repoPicker) {
            repoPicker.style.display = 'block';
            loadRepoPicker();
        }

        // Update scan note
        if (scanNote) {
            scanNote.textContent = 'Public & private repos available via your GitHub connection.';
        }

    } else {
        // Nav: show sign-in button
        if (navAuth) {
            navAuth.innerHTML = `
                <button onclick="signInWithGitHub()" class="btn-github-signin">
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    Sign in with GitHub
                </button>
            `;
        }

        // Scan section: show connect prompt
        if (scanAuth) {
            scanAuth.innerHTML = `
                <button onclick="signInWithGitHub()" class="btn-github-connect">
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    Connect GitHub — pick repos instantly
                </button>
            `;
        }

        // Hide repo picker
        if (repoPicker) {
            repoPicker.style.display = 'none';
        }

        // Reset scan note
        if (scanNote) {
            scanNote.textContent = 'Public repos only during beta. No sign-up required.';
        }
    }
}

async function loadRepoPicker() {
    const select = document.getElementById('repo-select');
    if (!select) return;

    select.innerHTML = '<option value="">Loading your repos...</option>';
    select.disabled = true;

    const repos = await fetchUserRepos();

    if (repos.length === 0) {
        select.innerHTML = '<option value="">No repos found</option>';
        select.disabled = true;
        return;
    }

    let html = '<option value="">Pick a repo to scan...</option>';
    repos.forEach(r => {
        const icon = r.private ? '🔒' : '📂';
        const lang = r.language ? ` • ${r.language}` : '';
        html += `<option value="${r.html_url}" data-slug="${r.full_name}">${icon} ${r.full_name}${lang}</option>`;
    });
    select.innerHTML = html;
    select.disabled = false;

    // When a repo is selected, auto-fill the input
    select.addEventListener('change', function() {
        const repoInput = document.getElementById('repo-url');
        if (this.value && repoInput) {
            repoInput.value = this.value;
            repoInput.dispatchEvent(new Event('input'));
        }
    });
}

// ── Init ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Check if returning from OAuth
    handleOAuthReturn();

    // Render the correct UI state
    updateUI();
});
