/**
 * auth-guard.js — Redirect unauthenticated users to login.
 * Load this as the FIRST script on any protected page.
 * Works with both password-based and OTP-based Supabase auth.
 */
(function () {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['index.html', 'forgot-password.html', 'mfa.html', ''];

    // ── Session validation ──────────────────────────────────────────────────────
    const pdUser  = localStorage.getItem('pd_user');
    const pdToken = localStorage.getItem('pd_token');

    // Require BOTH keys to be present on protected pages
    if (!publicPages.includes(currentPage)) {
        if (!pdUser || !pdToken) {
            // Clear any partial / stale session data
            localStorage.removeItem('pd_user');
            localStorage.removeItem('pd_token');
            window.location.replace('index.html');
            return;
        }
    }

    // ── Logout helper ───────────────────────────────────────────────────────────
    function performLogout() {
        // Clear all session storage keys
        localStorage.removeItem('pd_user');
        localStorage.removeItem('pd_token');

        // Also sign out of Supabase Auth if OTP session is active
        // (password-login users don't have a Supabase Auth session, so this is safe to call)
        try {
            if (window._sb && typeof window._sb.auth === 'object') {
                window._sb.auth.signOut().catch(() => {});
            }
        } catch (e) { /* silent */ }

        window.location.replace('index.html');
    }

    // ── Populate user info in the sidebar ───────────────────────────────────────
    function populateUserInfo() {
        try {
            const u = JSON.parse(localStorage.getItem('pd_user') || '{}');

            const nameEl   = document.querySelector('.user-profile .name')  || document.querySelector('.user-name');
            const roleEl   = document.querySelector('.user-profile .role')  || document.querySelector('.user-role');
            const avatarEl = document.querySelector('.avatar');

            const displayName = u.username || u.email || 'User';
            if (nameEl)   nameEl.textContent   = displayName;
            if (roleEl && u.role) roleEl.textContent = u.role.charAt(0).toUpperCase() + u.role.slice(1);
            if (avatarEl) avatarEl.textContent  = displayName.charAt(0).toUpperCase();

        } catch (e) { /* silent */ }
    }

    // ── Wire up the logout button ───────────────────────────────────────────────
    function setupLogoutButton() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function () {
                if (confirm('Are you sure you want to log out?')) {
                    performLogout();
                }
            });
        }
    }

    // ── Run after DOM is ready ──────────────────────────────────────────────────
    function init() {
        populateUserInfo();
        setupLogoutButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
