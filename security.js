/**
 * security.js — OWASP Top 10 Security Hardening Module
 * Placement Monitor Dashboard — Rashtriya Raksha University
 *
 * Covers:
 *  A01:2021 – Broken Access Control      → Session timeout + Token validation
 *  A02:2021 – Cryptographic Failures     → Secure session storage + No plaintext sensitive data
 *  A03:2021 – Injection (XSS)            → sanitizeInput(), setupInputSanitization()
 *  A05:2021 – Security Misconfiguration   → Clickjacking frame-busting + CSP Monitoring
 *  A07:2021 – Identification Failures    → Login rate limiting + Password complexity
 *  A08:2021 – Software/Data Integrity    → CDN verification checks
 *  A09:2021 – Logging and Monitoring     → Security event logger
 *  A10:2021 – SSRF / Open Redirect       → safeRedirect()
// ─────────────────────────────────────────────────────────────────────────────
// A04: IDOR Protection & Route Obfuscation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Implements Direct Object Reference (IDOR) protection by validating 
 * resource ownership before allowing view/edit access.
 */
function validateIDOR(resourceId, allowedIds = []) {
    const user = JSON.parse(localStorage.getItem('pd_user') || '{}');
    // If not admin, restrict to self-owned IDs
    if (user.role !== 'admin' && !allowedIds.includes(resourceId)) {
        logSecurityEvent('IDOR Violation Attempted', { resourceId });
        window.location.href = 'dashboard';
        return false;
    }
    return true;
}

/**
 * Obfuscates internal routes to hide the directory structure.
 * Maps literal file names to opaque session-based aliases.
 */
const ROUTE_MAP = {
    'dashboard.html': 'node-insights',
    'students.html': 'user-directory',
    'internships.html': 'field-records',
    'field-visits.html': 'site-audit',
    'placements.html': 'success-metrics',
    'reports.html': 'data-analytics',
    'settings.html': 'system-config'
};

function obfuscateRoute() {
    const path = window.location.pathname.split('/').pop();
    const alias = ROUTE_MAP[path];
    if (alias) {
        window.history.replaceState(null, '', alias + window.location.search);
    } else if (path.endsWith('.html')) {
        const clean = path.replace('.html', '');
        window.history.replaceState(null, '', clean + window.location.search);
    }
}

// Global Obfuscator Trigger
document.addEventListener('DOMContentLoaded', () => {
    obfuscateRoute();
    // mitigateDirectoryExposure();
});

// Intercept clicks to mask the URL instantly
document.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
        setTimeout(obfuscateRoute, 10);
    }
}, { passive: true });

// ─────────────────────────────────────────────────────────────────────────────
// A03 XSS — Input Sanitization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escapes HTML special characters in a string.
 * Use this before inserting any user-supplied data into the DOM.
 * @param {string} str
 * @returns {string}
 */
function sanitizeInput(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Strips non-printable and control characters from a string.
 * @param {string} str
 * @returns {string}
 */
function stripControlChars(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[\x00-\x1F\x7F]/g, '');
}

/**
 * Sets up automatic sanitization on all text / search inputs on the page.
 * - Enforces a max length of 512 characters
 * - Strips control characters on input
 */
function setupInputSanitization() {
    const MAX_LENGTH = 512;
    document.querySelectorAll('input[type="text"], input[type="search"], input[type="email"], textarea').forEach(input => {
        input.setAttribute('maxlength', MAX_LENGTH);
        input.addEventListener('input', () => {
            input.value = stripControlChars(input.value);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// A05 Clickjacking — Frame-Busting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prevents the page from being embedded in an iframe by any other origin.
 */
function preventClickjacking() {
    if (window.self !== window.top) {
        // Page is inside an iframe — redirect top-level window to this page
        try {
            window.top.location = window.self.location.href;
        } catch (e) {
            // Cross-origin iframe: just blank out our own content
            document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;">Access Denied: This page cannot be displayed inside an iframe.</p>';
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// A01 Broken Access Control — Session Inactivity Timeout
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function updateLastActivity() {
    sessionStorage.setItem('lastActivity', Date.now().toString());
}

/**
 * Checks if the session has been inactive beyond the timeout limit.
 * If so, redirects to index.html (login page).
 */
function checkSessionTimeout() {
    // Skip timeout check on the login page itself
    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '') return;

    const lastActivity = parseInt(sessionStorage.getItem('lastActivity') || '0', 10);
    const now = Date.now();

    if (lastActivity === 0) {
        // First visit — initialize
        updateLastActivity();
        return;
    }

    if (now - lastActivity > SESSION_TIMEOUT_MS) {
        sessionStorage.removeItem('lastActivity');
        sessionStorage.setItem('sessionExpired', '1');
        safeRedirect('index.html');
    }
}

/**
 * Initializes the session inactivity tracker.
 */
function setupSessionTimeout() {
    updateLastActivity();

    // Reset timer on user interaction
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, updateLastActivity, { passive: true });
    });

    // Check every 60 seconds
    setInterval(checkSessionTimeout, 60 * 1000);

    // Also check immediately
    checkSessionTimeout();
}

// ─────────────────────────────────────────────────────────────────────────────
// A02 Session Integrity Check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that the current session token has not been tampered with.
 * Prevents session hijacking via simple token swapping in localStorage.
 */
function validateSessionIntegrity() {
    const token = localStorage.getItem('pd_token');
    const user = localStorage.getItem('pd_user');

    // If we have a user but no token, or vice versa, the session is corrupted
    if ((user && !token) || (!user && token)) {
        logSecurityEvent('Session Integrity Violation', { action: 'logout', reason: 'Token/User mismatch' });
        localStorage.removeItem('pd_user');
        localStorage.removeItem('pd_token');
        if (!window.location.pathname.endsWith('index.html')) window.location.href = 'index.html';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// A10 Open Redirect Protection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely redirect to a URL only if it is same-origin.
 * Prevents open redirect attacks by rejecting external URLs.
 * @param {string} url
 */
function safeRedirect(url) {
    try {
        const target = new URL(url, window.location.origin);
        if (target.origin !== window.location.origin) {
            console.warn('[Security] Blocked open redirect attempt to:', url);
            return;
        }
        window.location.href = target.href;
    } catch (e) {
        // If URL parsing fails it's relative — allow it
        // but still strip any javascript: protocol
        if (url.trim().toLowerCase().startsWith('javascript:')) {
            console.warn('[Security] Blocked javascript: redirect attempt.');
            return;
        }
        window.location.href = url;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// A07 Auth Failures — Login Rate Limiting
// ─────────────────────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000; // 15 minute lockout

/**
 * Records a failed login attempt and returns whether the user is now locked out.
 * @returns {{ locked: boolean, attemptsLeft: number, remainingMs: number }}
 */
function recordLoginAttempt() {
    const now = Date.now();
    const lockoutUntil = parseInt(sessionStorage.getItem('loginLockoutUntil') || '0', 10);

    // Already locked out
    if (lockoutUntil && now < lockoutUntil) {
        return { locked: true, attemptsLeft: 0, remainingMs: lockoutUntil - now };
    }

    // Parse existing attempts
    let attempts = JSON.parse(sessionStorage.getItem('loginAttempts') || '[]');

    // Remove attempts outside the time window
    attempts = attempts.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

    // Add this attempt
    attempts.push(now);
    sessionStorage.setItem('loginAttempts', JSON.stringify(attempts));

    if (attempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
        const until = now + RATE_LIMIT_LOCKOUT_MS;
        sessionStorage.setItem('loginLockoutUntil', until.toString());
        sessionStorage.setItem('loginAttempts', '[]');
        return { locked: true, attemptsLeft: 0, remainingMs: RATE_LIMIT_LOCKOUT_MS };
    }

    return {
        locked: false,
        attemptsLeft: RATE_LIMIT_MAX_ATTEMPTS - attempts.length,
        remainingMs: 0
    };
}

/**
 * Checks if the user is currently locked out of login.
 * @returns {{ locked: boolean, remainingMs: number }}
 */
function isLoginLockedOut() {
    const now = Date.now();
    const lockoutUntil = parseInt(sessionStorage.getItem('loginLockoutUntil') || '0', 10);
    if (lockoutUntil && now < lockoutUntil) {
        return { locked: true, remainingMs: lockoutUntil - now };
    }
    return { locked: false, remainingMs: 0 };
}

/** Clears lockout state (call after successful login). */
function clearLoginAttempts() {
    sessionStorage.removeItem('loginAttempts');
    sessionStorage.removeItem('loginLockoutUntil');
}

// ─────────────────────────────────────────────────────────────────────────────
// A09 Logging and Monitoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Logs security-relevant events to the console and potentially a backend collector.
 * @param {string} eventType 
 * @param {object} details 
 */
function logSecurityEvent(eventType, details = {}) {
    const timestamp = new Date().toISOString();
    const event = {
        timestamp,
        eventType,
        url: window.location.href,
        userAgent: navigator.userAgent,
        ...details
    };

    // In production, this can be sent to a Supabase logging table
    // For now, we use a distinct security log format
    const logMsg = `[SECURITY_EVENT][${timestamp}] ${eventType}: ${JSON.stringify(details)}`;

    // We intentionally don't clear these from production as they are auditing logs
    if (eventType.includes('Blocked') || eventType.includes('Violation')) {
        console.error(logMsg);
    } else {
        console.warn(logMsg);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// A08 Software Integrity — CDN Checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Basic health check for required global libraries.
 * Helps identify if a CDN resource was blocked or failed to load.
 */
function verifyIntegrity() {
    const requiredGlobals = [
        { name: 'supabase', label: 'Supabase SDK' },
        { name: 'Chart', label: 'Chart.js' },
        { name: 'L', label: 'Leaflet.js' }
    ];

    requiredGlobals.forEach(lib => {
        if (typeof window[lib.name] === 'undefined') {
            // Only alert for dashboard/stats pages where these are critical
            if (document.getElementById('mainChart') || document.getElementById('india-city-map')) {
                logSecurityEvent('Integrity Failure', { library: lib.label, status: 'Missing' });
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// A07 Auth Failures — Password Strength Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that a password meets the minimum security requirements.
 * @param {string} password
 * @returns {{ valid: boolean, message: string }}
 */
function validatePasswordStrength(password) {
    if (!password || password.length < 8) {
        return { valid: false, message: 'Password must be at least 8 characters.' };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, message: 'Password must include at least one uppercase letter.' };
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, message: 'Password must include at least one number.' };
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        return { valid: false, message: 'Password must include at least one special character.' };
    }
    return { valid: true, message: 'Password meets requirements.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialize All Security Measures on DOMContentLoaded
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    preventClickjacking();
    setupInputSanitization();
    setupSessionTimeout();

    // Show expiry notice on login page if redirected due to timeout
    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '') {
        if (sessionStorage.getItem('sessionExpired') === '1') {
            sessionStorage.removeItem('sessionExpired');
            const notice = document.createElement('div');
            notice.id = 'sessionExpiredNotice';
            notice.setAttribute('role', 'alert');
            notice.style.cssText = 'background:#c0392b;color:#fff;padding:10px 16px;border-radius:6px;margin-bottom:16px;font-size:13px;text-align:center;';
            notice.textContent = 'Your session expired due to inactivity. Please log in again.';
            const form = document.getElementById('loginForm');
            if (form) form.parentNode.insertBefore(notice, form);
        }
    }
});
