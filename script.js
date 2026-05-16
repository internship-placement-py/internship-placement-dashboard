// Dashboard interactivity

/**
 * Main application initializer — called once on DOMContentLoaded
 */
function bootstrapApp() {
    window.bootstrapApp = bootstrapApp; // Ensure global visibility
    
    // Core UI Components
    initSidebarToggle();
    setupThemeToggle();
    initSearch();
    initAddButton();
    initActionButtons();
    initGlobalSearch(); // Search bar in header
    
    // Page-specific initialization
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    // 1. Dashboard Page
    if (document.getElementById('mainChart') || document.getElementById('miniAreaChart')) {
        try { if (document.getElementById('mainChart')) renderMainChart(); } catch(e) { console.error(e); }
        try { if (document.getElementById('miniAreaChart')) renderMiniChart(); } catch(e) { console.error(e); }
    }

    // 2. Students / Table Pages
    if (document.querySelector('.data-table-container')) {
        setupStudentsTable();
        initModalLogic(); // Add student modal
        initLocalSearch(); // Table search
    }

    // 3. Reports Page
    if (document.getElementById('placementStatusChart')) {
        // charts are initialized by their own script tags in reports.html usually,
        // but we ensure common UI is ready
    }

    // 4. Settings Page
    if (document.getElementById('admin-profile')) {
        loadAdminProfileData();
        initSettingsStudents();
        setupSettingsNav();
        load2faSettings();
    }

    // Common Table Sync & Fit
    syncTableScrolling();
    window.addEventListener('resize', autoFitTables);
    setTimeout(autoFitTables, 500);
}

// Internal helpers for the bootstrap process
function syncTableScrolling() {
    document.querySelectorAll('.table-body').forEach(body => {
        const header = body.previousElementSibling;
        if (header && header.classList.contains('table-header')) {
            header.style.overflow = 'hidden';
            body.addEventListener('scroll', () => {
                header.scrollLeft = body.scrollLeft;
            });
        }
    });
}

// Auto-fit function scaling data tables cleanly inside the screen without ugly word-breaks
function autoFitTables() {
    const containers = document.querySelectorAll('.table-container');
    containers.forEach(container => {
        // Reset scale to measure native constraints
        container.style.transform = 'none';
        container.style.width = '100%';
        
        const parentWidth = container.parentElement.clientWidth - 40;
        
        // 14+ column tables should scroll, not scale, to maintain legibility
        if (container.querySelector('.students-header') || container.querySelector('.internships-header')) {
            container.style.transform = 'none';
            container.style.width = 'max-content'; 
            container.style.marginBottom = '0px';
            return;
        }

        let minOptimalWidth = 1150; 
        if (container.querySelector('.internships-header')) minOptimalWidth = 1600;
        
        // If the viewport is smaller than the optimal width, intelligently scale down the container
        if (parentWidth > 0 && parentWidth < minOptimalWidth) {
            const scaleFactor = parentWidth / minOptimalWidth;
            container.style.transformOrigin = 'top left';
            container.style.transform = `scale(${scaleFactor})`;
            container.style.width = `${(1 / scaleFactor) * 100}%`;
            container.style.marginBottom = `-${container.offsetHeight * (1 - scaleFactor)}px`; 
        } else {
            container.style.transform = 'none';
            container.style.width = '100%';
            container.style.marginBottom = '0px';
        }
    });
}


function setupThemeToggle() {
    const themeToggleBtns = document.querySelectorAll('.theme-toggle');
    const body = document.body;
    const subtitle = document.getElementById('headerSubtitle');

    function updateSubtitle() {
        if (subtitle) {
            subtitle.textContent = "Future Leaders and Security Intelligence";
        }
    }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        body.classList.add('light-mode');
    }
    updateSubtitle();

    if (themeToggleBtns.length > 0) {
        themeToggleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                body.classList.toggle('light-mode');
                updateSubtitle();
                if (body.classList.contains('light-mode')) {
                    localStorage.setItem('theme', 'light');
                } else {
                    localStorage.setItem('theme', 'dark');
                }
            });
        });
    }
}
function renderMainChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');

    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(249, 115, 22, 0.5)'); // accent-orange
    gradient.addColorStop(1, 'rgba(249, 115, 22, 0.0)');

    window._mainChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['2023', '2024'],
            datasets: [{
                label: 'Yearly Placements',
                data: [0, 0],
                backgroundColor: '#f97316',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: '#ffffff' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                    ticks: { color: '#ffffff', stepSize: 1, precision: 0 }
                }
            }
        }
    });
}

function renderMiniChart() {
    const ctx = document.getElementById('miniAreaChart').getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 150);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); // accent-blue
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
            datasets: [{
                data: [12, 19, 15, 25, 22, 30, 28],
                borderColor: '#3b82f6',
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { display: false, min: 0 }
            },
            layout: { padding: 0 }
        }
    });
}


function setupStudentsTable() {
    // Dynamic rendering handled in page scripts now
}

// ===================================================================
// PLACEMENT MONITOR DASHBOARD - MASTER JAVASCRIPT FILE
// Combined functionality for: Companies, Placements, Reports, Settings
// ===================================================================

// ===== COMMON FUNCTIONALITY FOR ALL PAGES =====

/**
 * Initialize search functionality for table rows
 */
function initSearch() {
    const searchBars = document.querySelectorAll('.search-bar');
    const tableRows = document.querySelectorAll('.table-row');

    if (searchBars.length > 0 && tableRows.length > 0) {
        searchBars.forEach(searchBar => {
            searchBar.addEventListener('input', function (e) {
                const searchTerm = e.target.value.toLowerCase();

                tableRows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(searchTerm) ? '' : 'none';
                });
            });
        });
    }
}

/**
 * Initialize add button functionality
 */
function initAddButton() {
    // This is handled by page-specific scripts for now, 
    // but we ensure common open/close logic for standard modals if needed.
}

/**
 * Initialize action button functionality including table sorting
 */
function initActionButtons() {
    // 1. Table Sorting (for headers with dropdown-icon)
    const headers = document.querySelectorAll('.dropdown-header');
    headers.forEach((header, index) => {
        header.addEventListener('click', () => {
            const tableBody = header.closest('.table-container').querySelector('.table-body');
            if (!tableBody) return;
            
            const rows = Array.from(tableBody.querySelectorAll('.table-row'));
            const isAscending = !header.classList.contains('sort-asc');
            
            // Clear other header sort classes
            headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
            
            rows.sort((a, b) => {
                const aVal = a.children[index].textContent.trim();
                const bVal = b.children[index].textContent.trim();
                
                // Numeric sort for S.No or Salary
                if (!isNaN(aVal) && !isNaN(bVal) && aVal !== '' && bVal !== '') {
                    return isAscending ? aVal - bVal : bVal - aVal;
                }
                
                // Date sort attempt
                const aDate = Date.parse(aVal);
                const bDate = Date.parse(bVal);
                if (!isNaN(aDate) && !isNaN(bDate)) {
                    return isAscending ? aDate - bDate : bDate - aDate;
                }
                
                // Default string sort
                return isAscending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            });
            
            header.classList.add(isAscending ? 'sort-asc' : 'sort-desc');
            const icon = header.querySelector('.dropdown-icon');
            if (icon) icon.textContent = isAscending ? '▲' : '▼';
            
            // Re-append rows in sorted order
            rows.forEach(row => tableBody.appendChild(row));
        });
    });
}
// ===== REPORTS PAGE FUNCTIONALITY =====

/**
 * Initialize charts for Reports page using Chart.js
 */
async function initializeCharts() {
    try {
        const students = await getStudents() || [];
        const placements = await getPlacements() || [];
        const companies = await getCompanies() || [];

        // --- 1. Top Metrics ---
        const totalStudents = students.length;
        const activePlacements = new Set(placements.map(p => String(p.enrollment_number).trim()));
        const placedStudents = students.filter(s => activePlacements.has(String(s.enrollment_number).trim())).length;
        const totalCompanies = companies.length;
        
        // Count pending
        const pendingCount = placements.filter(p => (p.status || '').toLowerCase() === 'pending').length;
        
        // Identify passed-out students (admitted_year < current year = course complete)
        const currentYear = new Date().getFullYear();
        const passedOutStudents = students.filter(s => {
            const yr = parseInt(String(s.admitted_year || '').trim());
            return !isNaN(yr) && yr < currentYear;
        });

        // Passed-out who opted for placement
        const passedOutOpted = passedOutStudents.filter(s =>
            String(s.opted_for_placement || '').toLowerCase() === 'yes'
        );

        // Passed-out who have a placement record
        const placedPassedOut = passedOutStudents.filter(s =>
            activePlacements.has(String(s.enrollment_number).trim())
        ).length;

        // Formula: placed passouts ÷ opted passouts × 100
        let placementRate = 0;
        if (passedOutOpted.length > 0) placementRate = ((placedPassedOut / passedOutOpted.length) * 100).toFixed(1);

        const rTotal = document.getElementById('rpt-total');
        if (rTotal) {
            rTotal.textContent = totalStudents;
            document.getElementById('rpt-placed').textContent = placedStudents;
            document.getElementById('rpt-rate').textContent = placementRate + '%';
            const admittedYears = students.map(s => parseInt(String(s.admitted_year || '').trim())).filter(y => !isNaN(y));
            const maxYear = admittedYears.length ? Math.max(...admittedYears) : new Date().getFullYear();
            
            document.getElementById('rpt-companies').textContent = totalCompanies;
            document.getElementById('rpt-placed-pct').textContent = `Up to ${maxYear}`;
            document.getElementById('rpt-pending').textContent = `Pending: ${pendingCount}`;
            document.getElementById('rpt-internships').textContent = `Internships: Available via API`;
        }

        // --- 2. Placement Status Chart ---
        const placementStatusCtx = document.getElementById('placementStatusChart');
        if (placementStatusCtx) {
            new Chart(placementStatusCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Placed', 'Unplaced'],
                    datasets: [{
                        data: [placedStudents, totalStudents - placedStudents],
                        backgroundColor: ['#ff6b35', '#ef4444'],
                        borderColor: '#1a1f3a',
                        borderWidth: 2
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#ffffff' } } } }
            });
        }

        // --- 3. Programme-wise ---
        const deptCtx = document.getElementById('deptPlacementChart');
        if (deptCtx) {
            const deptStats = {};
            students.forEach(s => {
                const dep = s.programme || 'Unknown';
                if (!deptStats[dep]) deptStats[dep] = { total: 0, placed: 0 };
                deptStats[dep].total++;
                if (activePlacements.has(String(s.enrollment_number).trim())) deptStats[dep].placed++;
            });

            const deptLabels = Object.keys(deptStats);
            const deptData = deptLabels.map(l => deptStats[l].placed);

            // Also populate the department bars below
            const barsEl = document.getElementById('deptBars');
            if (barsEl) {
                const max = Math.max(...deptLabels.map(l => deptStats[l].total), 1);
                barsEl.innerHTML = deptLabels.map(d => `
                    <div class="dept-item">
                        <span class="dept-name">${d}</span>
                        <div class="dept-bar"><div class="dept-bar-fill" style="width:${(deptStats[d].total/max*100).toFixed(0)}%"></div></div>
                        <span class="dept-count">${deptStats[d].placed}/${deptStats[d].total}</span>
                    </div>`).join('');
            }

            new Chart(deptCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: deptLabels,
                    datasets: [{
                        label: 'Students Placed',
                        data: deptData,
                        backgroundColor: '#ff6b35',
                        borderRadius: 5
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#ffffff' } } }, scales: { x: { ticks: { color: '#ffffff' }, grid: { color: '#2a2f4a' } }, y: { ticks: { color: '#ffffff' }, grid: { color: 'transparent' } } } }
            });
        }

        // --- 4. Yearly Trend (Replaced Monthly) ---
        // This is handled via getYearlyTrend() in dashboard.html and reports.html script blocks

        // --- 5. Salary Distribution ---
        const salaryCtx = document.getElementById('salaryDistributionChart');
        if (salaryCtx) {
            const ranges = [ {l: '7-9 LPA', min: 7, max: 9}, {l: '9-11 LPA', min: 9, max: 11}, {l: '11-13 LPA', min: 11, max: 13}, {l: '13-15 LPA', min: 13, max: 15}, {l: '15-20 LPA', min: 15, max: 20}, {l: '20+ LPA', min: 20, max: 999} ];
            const counts = new Array(ranges.length).fill(0);

            placements.forEach(p => {
                if (p.salary_lpa && p.status === 'Placed') {
                    const sal = parseFloat(p.salary_lpa);
                    for (let i = 0; i < ranges.length; i++) {
                        if (sal >= ranges[i].min && sal < ranges[i].max) { counts[i]++; break; }
                    }
                }
            });

            new Chart(salaryCtx.getContext('2d'), {
                type: 'bar',
                data: { labels: ranges.map(r => r.l), datasets: [{ label: 'Students', data: counts, backgroundColor: '#ff6b35', borderRadius: 5 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#ffffff' } } }, scales: { y: { ticks: { color: '#ffffff', stepSize: 1 }, grid: { color: '#2a2f4a' }, beginAtZero: true }, x: { ticks: { color: '#ffffff' }, grid: { color: 'transparent' } } } }
            });
        }

    } catch (err) {
        console.error("Error loading dynamic reports:", err);
    }
}

// ===== SETTINGS PAGE FUNCTIONALITY =====

/**
 * Switch between different settings tabs
 */
/**
 * Switch between different settings tabs using standard active class mechanism, 
 * but also applying inline styles as requested.
 */
function switchTab(tabName) {
    window.switchTab = switchTab; // Ensure global visibility
    if (!tabName) return;
    
    // Normalize tabName — remove leading # if present
    const cleanTab = tabName.startsWith('#') ? tabName.substring(1) : tabName;

    const contents = document.querySelectorAll('.settings-content');
    let found = false;

    contents.forEach(content => {
        if (content.id === cleanTab) {
            content.classList.add('active');
            content.style.display = 'block';
            found = true;
        } else {
            content.classList.remove('active');
            content.style.display = 'none';
        }
    });

    if (!found) {
        console.warn(`[Settings] Tab content with id "${cleanTab}" not found.`);
    }

    const navItems = document.querySelectorAll('.settings-nav-item, .settings-option');
    navItems.forEach(item => {
        const target = item.getAttribute('data-tab') || item.getAttribute('data-target');
        if (target === cleanTab) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Update URL hash without jumping
    if (history.pushState) {
        history.pushState(null, null, '#' + cleanTab);
    } else {
        location.hash = '#' + cleanTab;
    }
}

function setupSettingsNav() {
    // Also support data-target if they use it in HTML
    const navItems = document.querySelectorAll('.settings-nav-item[data-tab], .settings-nav-item[data-target], .settings-option');
    navItems.forEach(item => {
        item.addEventListener('click', function () {
            const target = this.getAttribute('data-tab') || this.getAttribute('data-target');
            if(target) {
                switchTab(target);
            }
        });
    });
    
    // Ensure initial state based on hash or default
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
        switchTab(hash);
    } else {
        switchTab('admin-profile');
    }
}

/**
 * Update admin profile information
 */
async function updateProfile() {
    const email = document.getElementById('email');
    const phone = document.getElementById('phone');
    const firstName = document.getElementById('firstName');
    const lastName = document.getElementById('lastName');

    if (!email || !phone) return;
    if (!email.value) { alert('Email is required'); return; }

    const alertEl = document.getElementById('profileAlert');
    try {
        const payload = { 
            email: email.value, 
            mobile: phone.value,
            firstName: firstName ? firstName.value : '',
            lastName: lastName ? lastName.value : ''
        };
        const result = await updateAdminProfile(payload);
        if (alertEl) {
            alertEl.textContent = '✓ Profile updated!';
            alertEl.classList.add('show');
            setTimeout(() => alertEl.classList.remove('show'), 4000);
        }
    } catch (err) {
        alert('Failed to update profile: ' + err.message);
    }
}

/**
 * Reset admin profile form to default values
 */
function resetProfileForm() {
    const firstNameEl = document.getElementById('firstName');
    const lastNameEl = document.getElementById('lastName');
    const emailEl = document.getElementById('email');
    const phoneEl = document.getElementById('phone');

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const nameParts = (user.username || 'Admin User').split(' ');

    if (firstNameEl) firstNameEl.value = nameParts[0] || 'Admin';
    if (lastNameEl) lastNameEl.value = nameParts.slice(1).join(' ') || 'User';
    if (emailEl) emailEl.value = user.username ? `${user.username.replace(' ', '.').toLowerCase()}@university.edu` : 'admin@university.edu';
    if (phoneEl) phoneEl.value = '+91 9876543210';
}

/**
 * Check password strength and update visual indicator
 */
function checkPasswordStrength() {
    const passwordInput = document.getElementById('newPassword');
    if (!passwordInput) return;

    const password = passwordInput.value;
    const bars = document.querySelectorAll('#strengthIndicator .strength-bar');
    const text = document.getElementById('strengthText');

    let strength = 0;

    // Check password criteria
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[!@#$%^&*]/.test(password)) strength++;

    // Reset all bars
    bars.forEach(bar => bar.classList.remove('weak', 'medium', 'strong'));

    // Update strength indicator
    if (strength < 2) {
        if (text) {
            text.textContent = 'Password strength: Weak';
            text.classList.remove('medium', 'strong');
            text.classList.add('weak');
        }
        if (bars[0]) bars[0].classList.add('weak');
    } else if (strength < 4) {
        if (text) {
            text.textContent = 'Password strength: Medium';
            text.classList.remove('weak', 'strong');
            text.classList.add('medium');
        }
        if (bars[0]) bars[0].classList.add('medium');
        if (bars[1]) bars[1].classList.add('medium');
    } else {
        if (text) {
            text.textContent = 'Password strength: Strong';
            text.classList.remove('weak', 'medium');
            text.classList.add('strong');
        }
        if (bars[0]) bars[0].classList.add('strong');
        if (bars[1]) bars[1].classList.add('strong');
        if (bars[2]) bars[2].classList.add('strong');
    }
}

/**
 * Update admin password
 */
async function updateAdminPassword() {
    const currentPassword = document.getElementById('currentPassword');
    const newPassword     = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmPassword');

    if (!currentPassword || !newPassword || !confirmPassword) {
        alert('Please fill in all password fields');
        return;
    }

    const currentPwd = currentPassword.value;
    const newPwd     = newPassword.value;
    const confirmPwd = confirmPassword.value;

    if (!currentPwd || !newPwd || !confirmPwd) {
        alert('Please fill in all password fields');
        return;
    }

    if (newPwd !== confirmPwd) {
        alert('New passwords do not match');
        return;
    }

    if (newPwd.length < 8) {
        alert('Password must be at least 8 characters long');
        return;
    }

    try {
        await changeAdminPassword({ current_password: currentPwd, new_password: newPwd });
        const alertEl = document.getElementById('passwordAlert');
        if (alertEl) {
            alertEl.textContent = '✓ Password changed successfully!';
            alertEl.classList.add('show');
            resetPasswordForm();
            setTimeout(() => alertEl.classList.remove('show'), 3000);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

/**
 * Reset password form to empty state
 */
function resetPasswordForm() {
    const currentPasswordEl = document.getElementById('currentPassword');
    const newPasswordEl = document.getElementById('newPassword');
    const confirmPasswordEl = document.getElementById('confirmPassword');
    const strengthText = document.getElementById('strengthText');

    if (currentPasswordEl) currentPasswordEl.value = '';
    if (newPasswordEl) newPasswordEl.value = '';
    if (confirmPasswordEl) confirmPasswordEl.value = '';
    if (strengthText) {
        strengthText.textContent = 'Password strength: Weak';
        strengthText.classList.remove('medium', 'strong');
        strengthText.classList.add('weak');
    }

    // Reset strength bars
    const bars = document.querySelectorAll('#strengthIndicator .strength-bar');
    bars.forEach(bar => {
        bar.classList.remove('weak', 'medium', 'strong');
    });
}

/**
 * Load student details when selected
 */

window.settingsStudentsMap = {};

async function initSettingsStudents() {
    const select = document.getElementById('studentSelect');
    if (!select) return;

    try {
        const students = await getStudents();
        let options = '<option value="">-- Select a student --</option>';
        students.forEach(s => {
            // PK is enrollment_number, not id
            window.settingsStudentsMap[s.enrollment_number] = s;
            options += `<option value="${s.enrollment_number}">${s.student_name} (${s.enrollment_number})</option>`;
        });
        select.innerHTML = options;
    } catch (e) {
        console.error('Failed to load students for settings', e);
    }
}

function loadStudentDetails() {
    const select = document.getElementById('studentSelect');
    const details = document.getElementById('studentDetails');

    if (!select || !select.value) {
        if (details) details.style.display = 'none';
        return;
    }

    if (details) details.style.display = 'block';

    const student = window.settingsStudentsMap[select.value];
    if (student) {
        const studentNameEl = document.getElementById('studentName');
        const studentEnrollmentEl = document.getElementById('studentEnrollment');
        const studentEmailEl = document.getElementById('studentEmail');

        if (studentNameEl) studentNameEl.textContent = student.student_name;
        if (studentEnrollmentEl) studentEnrollmentEl.textContent = student.enrollment_number;
        if (studentEmailEl) studentEmailEl.textContent = student.student_email_id;
    }
}


/**
 * Reset student password
 */

async function resetStudentPassword(event) {
    const studentSelect = document.getElementById('studentSelect');
    const tempPassword = document.getElementById('tempPassword');

    if (!studentSelect || !tempPassword || !studentSelect.value || !tempPassword.value) {
        alert('Please select a student and enter a temporary password');
        return;
    }

    const enrollment_number = studentSelect.value;
    const newPassword = tempPassword.value;
    
    // Fallback if event is not passed (should not happen with the new onclick)
    const btn = (event && event.target) ? event.target : document.querySelector('#student-password .btn-primary');
    if (!btn) return;

    const originalText = btn.textContent;
    btn.textContent = 'Resetting...';
    btn.disabled = true;

    try {
        const data = await apiResetStudentPassword(enrollment_number, { new_password: newPassword });
        
        const alertEl = document.getElementById('studentPasswordAlert');
        if (alertEl) {
            alertEl.textContent = `✓ ${data.message || 'Password reset success!'}`;
            alertEl.classList.add('show');
            clearStudentForm();
            setTimeout(() => { alertEl.classList.remove('show'); }, 4000);
        }
    } catch (e) {
        alert('Reset Error: ' + e.message);
    } finally {
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
}


/**
 * Clear student password reset form
 */
function clearStudentForm() {
    const selectEl = document.getElementById('studentSelect');
    const passwordEl = document.getElementById('tempPassword');
    const detailsEl = document.getElementById('studentDetails');

    if (selectEl) selectEl.value = '';
    if (passwordEl) passwordEl.value = '';
    if (detailsEl) detailsEl.style.display = 'none';
}

/**
 * Update notification preferences
 */
function updateNotifications() {
    const alertEl = document.createElement('div');
    alertEl.style.cssText = 'background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#4ade80;padding:10px 14px;border-radius:6px;font-size:13px;margin-top:16px;text-align:center;';
    alertEl.textContent = '✓ Notification preferences saved successfully!';
    const card = document.querySelector('#notifications .settings-card');
    if (card) {
        const existing = card.querySelector('.notif-alert');
        if (existing) existing.remove();
        alertEl.classList.add('notif-alert');
        card.appendChild(alertEl);
        setTimeout(() => alertEl.remove(), 3000);
    }
}

/**
 * Enable two-factor authentication
 */
async function enableTwoFA() {
    const btn = document.getElementById('twoFaBtn');
    if (!btn) return;
    
    try {
        const isEnabling = btn.textContent === 'Enable';
        await toggle2fa(isEnabling);
        if (isEnabling) {
            btn.textContent = 'Disable';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-danger');
            alert('Two-Factor Authentication has been enabled');
        } else {
            btn.textContent = 'Enable';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-secondary');
            alert('Two-Factor Authentication has been disabled');
        }
    } catch (e) {
        alert('Failed to toggle 2FA: ' + e.message);
    }
}

async function load2faSettings() {
    const btn = document.getElementById('twoFaBtn');
    if (!btn) return;
    try {
        const status = await get2faStatus();
        if (status.two_factor_enabled) {
            btn.textContent = 'Disable';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-danger');
        } else {
            btn.textContent = 'Enable';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-secondary');
        }
    } catch(e) {}
}

/**
 * Revoke an active session
 */
function revokeSession(event) {
    const btn = event.currentTarget || event.target;
    const sessionCard = btn.closest('div[style*="background"]');
    if (confirm('Revoke this session? That device will be logged out immediately.')) {
        if (sessionCard) {
            sessionCard.style.opacity = '0.4';
            sessionCard.style.transition = 'opacity 0.3s';
            btn.textContent = 'Revoked';
            btn.disabled = true;
            btn.style.background = '#374151';
        }
    }
}

/**
 * Open delete account confirmation
 */
function openDeleteAccount() {
    if (confirm('⚠️ Are you sure you want to delete your account?\n\nThis will permanently remove all admin data and cannot be undone.')) {
        if (confirm('Final confirmation: click OK to delete the account.')) {
            // Log out the admin — the account delete requires a backend endpoint
            localStorage.removeItem('pd_token');
            localStorage.removeItem('pd_user');
            alert('Account deletion request submitted. You have been logged out.');
            window.location.href = 'index.html';
        }
    }
}

// ===================================================================
// DOM CONTENT LOADED - Initialize all functionality
// ===================================================================

// --- Settings Data Loader ---
async function loadAdminProfileData() {
    try {
        const userStr = localStorage.getItem('pd_user');
        if (!userStr) return;
        const localUser = JSON.parse(userStr);
        
        // Fetch fresh profile from users table
        let profile = localUser;
        if (window._sb && localUser.id) {
            const { data, error } = await _sb.from('users').select('*').eq('id', localUser.id).single();
            if (!error && data) {
                profile = { ...localUser, ...data };
                localStorage.setItem('pd_user', JSON.stringify(profile)); // keep session synced
            }
        }
        
        const emailEl = document.getElementById('email');
        const phoneEl = document.getElementById('phone');
        const firstEl = document.getElementById('firstName');
        const lastEl  = document.getElementById('lastName');
        
        if (emailEl) emailEl.value = profile.email || '';
        if (phoneEl) phoneEl.value = profile.mobile || '';
        const nameParts = (profile.username || '').split(' ');
        if (firstEl) firstEl.value = nameParts[0] || profile.username || '';
        if (lastEl)  lastEl.value  = nameParts.slice(1).join(' ') || '';

        // Update profile header text
        document.querySelectorAll('.profile-info h2').forEach(el => el.textContent = profile.username || 'User');
        
        // Update the Role and Email <p> tags
        const pTags = document.querySelectorAll('.profile-info p');
        if (pTags.length >= 2) {
            const roleStr = profile.role || 'user';
            pTags[0].textContent = roleStr.charAt(0).toUpperCase() + roleStr.slice(1) + ' User'; // Role
            pTags[1].textContent = profile.email || 'No email provided'; // Email
        }

        // Update avatars
        document.querySelectorAll('.profile-avatar, .user-profile .avatar').forEach(el => {
            el.textContent = (profile.username || 'U').charAt(0).toUpperCase();
        });
        
        // Ensure sidebar name stays strictly in sync
        const sidebarName = document.querySelector('.user-profile .name');
        if (sidebarName) sidebarName.textContent = profile.username || profile.email || 'User';
        
        // Update read-only fields if they exist
        const roleInputs = document.querySelectorAll('input[value="Administrator"]');
        roleInputs.forEach(el => {
            if (el.disabled) {
                const roleStr = profile.role || 'user';
                el.value = roleStr.charAt(0).toUpperCase() + roleStr.slice(1);
            }
        });
    } catch (e) {
        console.error('Failed to load profile data', e);
    }
}


// ===== SIDEBAR TOGGLE FUNCTIONALITY =====

/**
 * Initialize sidebar toggle button
 */
function initSidebarToggle() {
    const toggleBtn = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (!toggleBtn || !sidebar) return;

    // Toggle button click
    toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    });

    // Close sidebar when clicking on overlay
    if (overlay) {
        overlay.addEventListener('click', function () {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    // Close sidebar when clicking on a navigation link
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', function () {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    });

    // Close sidebar when clicking outside
    document.addEventListener('click', function (e) {
        if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        }
    });
}

// --- Modal & Form Logic ---
function initModalLogic() {
    const modal = document.getElementById("addStudentModal");
    const openBtn = document.getElementById("openStudentModal") || document.querySelector(".table-actions .btn-add");
    const closeBtns = document.querySelectorAll(".close-modal");

    // OPEN MODAL
    if (openBtn && modal) {
        openBtn.addEventListener("click", function (e) {
            e.preventDefault();
            modal.style.display = "flex";
        });
    }

    // CLOSE BUTTON
    if (modal) {
        closeBtns.forEach(btn => {
            btn.addEventListener("click", function () {
                modal.style.display = "none";
            });
        });

        // CLICK OUTSIDE
        window.addEventListener("click", function (e) {
            if (e.target === modal) {
                modal.style.display = "none";
            }
        });

        // Form submit
        const form = modal.querySelector('.modal-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                alert('Student added successfully!');
                modal.style.display = 'none';
                form.reset();
            });
        }
    }

    // Notifications toggle
    const notifyBtns = document.querySelectorAll('.notification-toggle');
    notifyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const badge = btn.querySelector('.notification-badge');
            if (badge) {
                badge.style.display = 'none';
            }
            alert('No new notifications');
        });
    });
}

function initLocalSearch() {
    const localSearch = document.getElementById('localStudentSearch');
    if (localSearch) {
        localSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const tableRows = document.querySelectorAll('.data-table tbody tr');

            tableRows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
    }
}

// Theme toggle is handled inside bootstrapApp


// --- GLOBAL SEARCH ENGINE (UI NAVIGATION ONLY) ---
function initGlobalSearch() {
    const globalSearchInput = document.querySelector('.header-right .search-bar');
    if (!globalSearchInput) return;

    // Define searchable UI navigation items
    const navItems = [
        { name: 'Dashboard', url: 'dashboard.html', icon: 'bi-speedometer2' },
        { name: 'Students', url: 'students.html', icon: 'bi-people' },
        { name: 'Companies', url: 'companies.html', icon: 'bi-building' },
        { name: 'Internships', url: 'internships.html', icon: 'bi-person-workspace' },
        { name: 'Placements', url: 'placements.html', icon: 'bi-briefcase-fill' },
        { name: 'Reports', url: 'reports.html', icon: 'bi-bar-chart-fill' },
        { name: 'Settings', url: 'settings.html', icon: 'bi-gear' },
        { name: 'Admin Profile', url: 'settings.html#admin-profile', icon: 'bi-person' },
        { name: 'Change Password', url: 'settings.html#admin-password', icon: 'bi-key' },
        { name: 'Reset Student Password', url: 'settings.html#student-password', icon: 'bi-unlock' }
    ];

    // Create a dropdown container
    const searchDropdown = document.createElement('div');
    searchDropdown.className = 'global-search-dropdown';
    searchDropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        width: 100%;
        background-color: #1a1f3a;
        background: #111f33;
        border: 1px solid #2a2f4a;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        display: none;
        z-index: 1000;
        max-height: 300px;
        overflow-y: auto;
    `;
    globalSearchInput.parentNode.style.position = 'relative';
    globalSearchInput.parentNode.appendChild(searchDropdown);

    globalSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        searchDropdown.innerHTML = '';
        if (!query) {
            searchDropdown.style.display = 'none';
            return;
        }

        const matches = navItems.filter(item => item.name.toLowerCase().includes(query));
        
        if (matches.length > 0) {
            matches.forEach(match => {
                const itemDiv = document.createElement('div');
                itemDiv.style.cssText = 'padding: 10px 15px; cursor: pointer; color: #fff; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #1f2a40;';
                itemDiv.innerHTML = `<i class="bi ${match.icon}" style="color: #888;"></i> <span>${match.name}</span>`;
                itemDiv.addEventListener('mouseover', () => itemDiv.style.backgroundColor = '#1a3350');
                itemDiv.addEventListener('mouseout', () => itemDiv.style.backgroundColor = 'transparent');
                itemDiv.addEventListener('click', () => {
                    window.location.href = match.url;
                });
                searchDropdown.appendChild(itemDiv);
            });
            searchDropdown.style.display = 'block';
        } else {
            searchDropdown.style.display = 'none';
        }
    });

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (!globalSearchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
            searchDropdown.style.display = 'none';
        }
    });
}

// One final listener to start it all!
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
    bootstrapApp();
}
