/**
 * OSINT JOB AGGREGATOR FRONTEND LOGIC
 * Uses the shared Supabase client from supabase-client.js (window._sb)
 */

let currentJobs = [];
let filters = {
    domain: '',
    jobType: '',
    platform: '',
    sector: '',   // 'Govt' or 'Private' or ''
    search: ''
};

// INITIALIZATION
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    fetchJobs();
});

// FETCH JOBS FROM SUPABASE
async function fetchJobs() {
    const grid = document.getElementById('jobGrid');

    // Show loading state
    grid.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';

    try {
        // Use shared client from supabase-client.js
        if (window._sb) {
            let query = window._sb.from('jobs').select('*').order('created_at', { ascending: false });

            // Apply filtering
            if (filters.domain) query = query.eq('domain', filters.domain);
            if (filters.jobType) query = query.eq('job_type', filters.jobType);
            if (filters.platform) query = query.eq('platform', filters.platform);
            // Sector filter: Govt = 'Govt Portal', Private = everything else
            if (filters.sector === 'Govt') query = query.eq('platform', 'Govt Portal');
            else if (filters.sector === 'Private') query = query.neq('platform', 'Govt Portal');

            const { data, error } = await query;
            if (error) throw error;

            currentJobs = data || [];
        } else {
            console.error("Supabase client not initialized.");
            currentJobs = [];
        }

        renderJobs(currentJobs);
        updateStats();

    } catch (e) {
        console.error("OSINT Fetch Error:", e);
        currentJobs = [];
        renderJobs(currentJobs);
        updateStats();

        const grid = document.getElementById('jobGrid');
        if (grid) {
            grid.insertAdjacentHTML('afterbegin', `<div class="error-state" style="grid-column:1/-1;padding:15px;background:rgba(245,158,11,0.1);border-radius:8px;color:var(--accent-orange);margin-bottom:20px;border:1px solid rgba(245,158,11,0.2);display:flex;align-items:center;gap:12px;">
                <i class="bi bi-exclamation-triangle" style="font-size:1.2rem;"></i> 
                <div>
                    <strong>Intelligence Feed Offline:</strong> Could not connect to database.
                </div>
            </div>`);
        }
    }
}

// Inject styles for deadline color coding
if (!document.getElementById('deadlineStyles')) {
    const style = document.createElement('style');
    style.id = 'deadlineStyles';
    style.innerHTML = `
        .job-card.closing-soon { border-left: 4px solid #ef4444 !important; background: linear-gradient(145deg, rgba(239,68,68,0.05) 0%, rgba(30,41,59,0.5) 100%) !important; }
        .job-card.closing-soon .job-title { color: #fca5a5 !important; }
        .job-card.closing-soon .deadline-tag { color: #ef4444; font-weight: bold; background: rgba(239,68,68,0.1); padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
        
        .job-card.expired { border-left: 4px solid #64748b !important; opacity: 0.65; background: #1e293b !important; filter: grayscale(50%); }
        .job-card.expired .job-title { color: #94a3b8 !important; }
        .job-card.expired .deadline-tag { color: #64748b; background: rgba(100,116,139,0.1); padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
        .job-card.expired .btn-primary { background: #475569 !important; border-color: #475569 !important; pointer-events: none; }
    `;
    document.head.appendChild(style);
}

// RENDER JOB CARDS
function renderJobs(jobs) {
    const grid = document.getElementById('jobGrid');
    const empty = document.getElementById('emptyState');

    // Search filtering (local client-side)
    let filtered = jobs.filter(j => {
        const searchText = (j.title + j.company + (j.description || "")).toLowerCase();
        return searchText.includes(filters.search.toLowerCase());
    });

    // 1. Enforce max 15 jobs per domain
    const domainCounts = {};
    filtered = filtered.filter(j => {
        domainCounts[j.domain] = (domainCounts[j.domain] || 0) + 1;
        return domainCounts[j.domain] <= 15;
    });

    // 2. Categorize by Deadline
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);

    const expiredJobs = [];
    const closingSoonJobs = [];
    const normalJobs = [];

    filtered.forEach(j => {
        if (j.deadline) {
            const d = new Date(j.deadline);
            if (d < today) expiredJobs.push(j);
            else if (d <= threeDaysFromNow) closingSoonJobs.push(j);
            else normalJobs.push(j);
        } else {
            normalJobs.push(j);
        }
    });

    // 3. Enforce exactly 20 max for each special category
    const cappedClosingSoon = closingSoonJobs.slice(0, 20);
    const cappedExpired = expiredJobs.slice(0, 20);

    // Combine them for display (Closing soon at top, normal, expired at bottom)
    const displayList = [...cappedClosingSoon, ...normalJobs, ...cappedExpired];

    if (displayList.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }

    empty.style.display = 'none';
    grid.innerHTML = displayList.map(job => {
        const isGovt = job.platform === 'Govt Portal';

        let expireClass = '';
        if (cappedExpired.includes(job)) expireClass = 'expired';
        else if (cappedClosingSoon.includes(job)) expireClass = 'closing-soon';

        const cardClass = isGovt ? `job-card govt-card ${expireClass}` : `job-card ${expireClass}`;
        const govtBadge = isGovt ? `<span class="govt-badge"><i class="bi bi-bank"></i> Govt</span>` : '';
        const platformTag = isGovt
            ? `<span class="platform-tag govt-platform-tag"><i class="bi bi-bank"></i> ${job.platform}</span>`
            : `<span class="platform-tag">${job.platform}</span>`;

        const deadlineHtml = job.deadline ? `<span class="deadline-tag"><i class="bi bi-hourglass-bottom"></i> Apply by: ${formatDate(job.deadline)}</span>` : '';

        return `
        <div class="${cardClass}" onclick="${expireClass === 'expired' ? '' : `window.open('${job.apply_link}', '_blank')`}">
            <div class="job-card-header">
                <div class="company-logo${isGovt ? ' govt-logo' : ''}">${job.company[0]}</div>
                ${platformTag}
            </div>
            <div class="job-content">
                <h3 class="job-title">${job.title} ${govtBadge}</h3>
                <div class="job-company">${job.company}</div>
                <div class="job-meta">
                    <span><i class="bi bi-geo-alt"></i> ${job.location || 'India'}</span>
                    <span><i class="bi bi-clock"></i> ${job.job_type}</span>
                </div>
                <div class="job-tags">
                    <span class="tag domain">${job.domain}</span>
                    <span class="tag">${job.experience}</span>
                    ${deadlineHtml}
                </div>
            </div>
            <div class="card-footer">
                <span class="posted-date">${formatDate(job.created_at)}</span>
                <button class="btn-primary btn-sm${isGovt ? ' btn-govt' : ''}">${expireClass === 'expired' ? 'Expired' : 'Apply <i class="bi bi-box-arrow-up-right"></i>'}</button>
            </div>
        </div>
    `;
    }).join('');
}

// UPDATE FEED STATS
function updateStats() {
    const feedStats = document.getElementById('feedStats');
    if (!feedStats) return;

    const count = currentJobs.length;
    let label = 'Intelligence & Security';
    if (filters.sector === 'Govt') label = 'Government Sector';
    else if (filters.sector === 'Private') label = 'Private Sector';
    else if (filters.domain) label = filters.domain;
    else if (filters.jobType) label = filters.jobType + 's';
    feedStats.innerText = `Found ${count} active opportunities in ${label}`;
}

// EVENT LISTENERS
function setupEventListeners() {
    // Domain & Filter tab items
    document.querySelectorAll('.job-filter-tab').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.job-filter-tab').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            const filterType = item.getAttribute('data-filter');
            // Reset all filters first
            filters.domain = '';
            filters.jobType = '';
            filters.sector = '';

            if (filterType === 'Internship') {
                filters.jobType = 'Internship';
            } else if (filterType === 'Fresher') {
                filters.jobType = 'Fresher';
            } else if (filterType === 'Govt') {
                filters.sector = 'Govt';
            } else if (filterType === 'Private') {
                filters.sector = 'Private';
            } else if (filterType !== '') {
                filters.domain = filterType;
            }
            fetchJobs();
        });
    });

    // Platform chips
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filters.platform = chip.getAttribute('data-platform');
            fetchJobs();
        });
    });

    // Search bar
    document.getElementById('jobSearch').addEventListener('input', (e) => {
        filters.search = e.target.value;
        renderJobs(currentJobs);
    });

    // Refresh button (OSINT Scrape Trigger + Supabase Fetch)
    document.getElementById('refreshBtn').addEventListener('click', async () => {
        const btn = document.getElementById('refreshBtn');
        const originalHtml = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Intelligence Gathering...';

        try {
            const res = await fetch('http://localhost:3000/api/jobs/scrape', { method: 'POST' });
            if (!res.ok) {
                console.error("Scraper server returned an error.");
                // Failing silently to avoid intrusive alerts, but still refreshing from DB
            } else {
                console.log("Scraping complete!");
            }
            
            // Always fetch fresh data from Supabase regardless to update UI
            await fetchJobs();
            
        } catch (e) {
            console.error("Failed to connect to scraper server", e);
            // Failing silently to avoid intrusive alerts
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    });
}

// UTILITIES
function formatDate(isoString) {
    if (!isoString) return 'Recently';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}


    });
}

// UTILITIES
function formatDate(isoString) {
    if (!isoString) return 'Recently';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}


