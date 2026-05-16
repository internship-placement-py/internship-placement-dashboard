/**
 * device-tracker.js — Real Device Session Fingerprinting
 * Placement Monitor Dashboard — Rashtriya Raksha University
 *
 * Records each unique device's real browser/OS/IP details into localStorage
 * so the Settings > Security page can display authentic recent device history.
 *
 * NOTE: MAC addresses are inaccessible to browsers (blocked by all OSes for
 * privacy/security). The pd_machine_id acts as a persistent per-device
 * fingerprint stored locally — it is stable across sessions on the same device
 * and unique per browser profile, which is the browser-equivalent of a MAC.
 */

(function () {
    'use strict';

    const STORAGE_KEY   = 'pd_device_sessions';
    const MAX_SESSIONS  = 5;     // keep last 5 unique device records
    const IP_CACHE_KEY  = 'pd_last_ip';
    const IP_CACHE_TTL  = 5 * 60 * 1000; // re-fetch IP after 5 minutes

    // ── Helpers ──────────────────────────────────────────────────────────────

    function parseBrowser(ua) {
        // Order matters – Chrome UA also contains 'Safari'
        if (/Edg\//i.test(ua))     return 'Microsoft Edge';
        if (/OPR\//i.test(ua))     return 'Opera';
        if (/Chrome\//i.test(ua))  return 'Chrome';
        if (/Firefox\//i.test(ua)) return 'Firefox';
        if (/Safari\//i.test(ua))  return 'Safari';
        return 'Browser';
    }

    function parseOS(ua) {
        if (/Windows NT 10/i.test(ua))  return 'Windows 10/11';
        if (/Windows NT 6\.3/i.test(ua)) return 'Windows 8.1';
        if (/Windows/i.test(ua))        return 'Windows';
        if (/iPhone OS (\d+)/i.test(ua)) return `iOS ${ua.match(/iPhone OS (\d+)/i)[1]}`;
        if (/iPad/i.test(ua))            return 'iPadOS';
        if (/Android (\d+)/i.test(ua))   return `Android ${ua.match(/Android (\d+)/i)[1]}`;
        if (/Mac OS X (\d+[_\d]+)/i.test(ua)) {
            const v = ua.match(/Mac OS X ([\d_]+)/i)[1].replace(/_/g, '.');
            return `macOS ${v}`;
        }
        if (/Linux/i.test(ua))  return 'Linux';
        return 'Desktop';
    }

    function getMachineId() {
        let id = localStorage.getItem('pd_machine_id');
        if (!id) {
            // Generate a persistent random fingerprint that looks like a MAC
            const hex = () => Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
            id = `${hex()}-${hex()}-${hex()}`;
            localStorage.setItem('pd_machine_id', id);
        }
        return id;
    }

    function getSessions() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (_) { return []; }
    }

    function saveSessions(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (_) {}
    }

    function timeAgo(ts) {
        const diff = Date.now() - ts;
        const mins  = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days  = Math.floor(diff / 86400000);
        if (mins  < 2)  return 'Just now';
        if (mins  < 60) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }

    // ── Core Record Fn ───────────────────────────────────────────────────────

    async function recordDevice() {
        const ua        = navigator.userAgent;
        const browser   = parseBrowser(ua);
        const os        = parseOS(ua);
        const machineId = getMachineId();

        // Fetch IP — use cache first to avoid hammering the API on every nav
        let ip = null;
        try {
            const cached = JSON.parse(localStorage.getItem(IP_CACHE_KEY) || 'null');
            if (cached && Date.now() - cached.ts < IP_CACHE_TTL) {
                ip = cached.ip;
            }
        } catch (_) {}

        if (!ip) {
            const apis = [
                'https://api.ipify.org?format=json',
                'https://api64.ipify.org?format=json'
            ];
            for (const url of apis) {
                try {
                    const res  = await fetch(url, { signal: AbortSignal.timeout(4000) });
                    const data = await res.json();
                    if (data.ip) { ip = data.ip; break; }
                } catch (_) {}
            }
            if (ip) {
                try { localStorage.setItem(IP_CACHE_KEY, JSON.stringify({ ip, ts: Date.now() })); } catch (_) {}
            } else {
                ip = 'Unavailable';
            }
        }

        const record = {
            browser,
            os,
            ip,
            machineId,
            // NOTE: Real MAC address cannot be read from a browser (blocked by OS/hardware
            // for security reasons). Machine ID is the permanent browser-level fingerprint.
            macAddress: machineId,
            ts: Date.now(),
            page: window.location.pathname.split('/').pop() || 'index.html'
        };

        // De-duplicate by machineId — update timestamp if same device, push new if different
        let sessions = getSessions();
        const existingIdx = sessions.findIndex(s => s.machineId === machineId);
        if (existingIdx > -1) {
            // Update in-place then move to front (most recent)
            sessions[existingIdx] = { ...sessions[existingIdx], ...record };
            sessions.splice(existingIdx, 1);
        }
        sessions.unshift(record);

        // Keep only MAX_SESSIONS
        if (sessions.length > MAX_SESSIONS) sessions = sessions.slice(0, MAX_SESSIONS);
        saveSessions(sessions);
    }

    // ── Public API ───────────────────────────────────────────────────────────

    window.PD_Tracker = {
        recordDevice,
        getSessions,
        timeAgo,
        parseBrowser,
        parseOS,
        getMachineId
    };

    // Auto-record on every page load (non-login pages only)
    document.addEventListener('DOMContentLoaded', function () {
        const path = window.location.pathname;
        if (!path.endsWith('index.html') && path !== '/' && path !== '') {
            recordDevice().catch(() => {});
        }
    });

})();
