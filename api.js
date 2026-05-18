/**
 * api.js — Placement Dashboard Data Layer (Pure Supabase Edition)
 * ─────────────────────────────────────────────────────────────────────────────
 * All functions use the Supabase JS client (window._sb) from supabase-client.js.
 * Function names are identical to the old Flask version so all HTML pages work
 * without changes.
 *
 * Excel import/export is handled client-side using SheetJS (loaded via CDN).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Session Helpers ──────────────────────────────────────────────────────────
function getUser() {
    try { return JSON.parse(localStorage.getItem('pd_user') || 'null'); } catch { return null; }
}
function saveUser(user) { localStorage.setItem('pd_user', JSON.stringify(user)); }
function clearSession() {
    localStorage.removeItem('pd_user');
    localStorage.removeItem('pd_token');
}
function isLoggedIn() { return !!getUser(); }

// ─── REALTIME UPDATES ────────────────────────────────────────────────────────
function subscribeAllChanges(callback) {
    if (typeof _sb === 'undefined' || !_sb) {
        console.warn('[Realtime] Supabase client not initialized yet.');
        return null;
    }
    const channel = _sb.channel('pd-realtime-updates')
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
            // console.log(`[Realtime] ${payload.eventType} on ${payload.table}`);
            callback(payload);
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                // console.log('[Realtime] Subscribed to live database changes.');
            }
        });
    return channel;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

// SHA-256 helper (browser native)
async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Username + Password login (for role accounts: CD PY, PI PY, etc.) ─────────
async function apiLoginWithPassword(username, password) {
    const hash = await sha256(password);

    // Match by username OR email (case-insensitive username)
    const { data, error } = await _sb
        .from('users')
        .select('id, username, email, mobile, role, password_hash')
        .or(`username.eq.${username},email.eq.${username}`)
        .single();

    if (error || !data) throw new Error('Invalid username or password.');
    if (data.password_hash !== hash) throw new Error('Invalid username or password.');

    const user = {
        id:       data.id,
        username: data.username,
        email:    data.email,
        mobile:   data.mobile,
        role:     data.role
    };

    saveUser(user);
    localStorage.setItem('pd_token', 'pwd_session_' + Date.now());
    return { success: true, user };
}

async function apiSendOtp(email) {
    // 1. Verify the user exists in the users table
    const { data: user, error: userError } = await _sb
        .from('users')
        .select('id, email')
        .eq('email', email)
        .single();
        
    if (userError || !user) {
        throw new Error('Unauthorized email address or user not found.');
    }

    // 2. Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry_time = Math.floor(Date.now() / 1000) + 300; // 5 minutes in seconds (matches int8 usually)

    // 3. Upsert into otps table
    // Since there's no native "upsert by user_id" without knowing the constraint, 
    // we try to update first, if no rows updated, we insert.
    // Or if user_id is the primary key/unique, .upsert works. Assuming user_id is unique:
    const { error: otpError } = await _sb
        .from('otps')
        .upsert({ 
            user_id: user.id, 
            email_otp: otp, 
            expiry_time: expiry_time 
        }, { onConflict: 'user_id' });

    if (otpError) {
        console.error("OTP Insert Error:", otpError);
        throw new Error('Failed to generate OTP.');
    }

    // 4. Store the email temporarily for the verification step
    localStorage.setItem('mfa_pending_email', email);
    
    // TEMPORARY: Log the OTP to the console so the user can test locally
    // since the frontend cannot send the email without an edge function.
    console.log("%c[DEV] Generated OTP: " + otp, "color: yellow; font-size: 16px; background: #222; padding: 5px;");
    
    return { success: true };
}

async function apiVerifyRealOtp(otp) {
    const email = localStorage.getItem('mfa_pending_email');
    if (!email) throw new Error('No pending login session.');

    // 1. Verify the real OTP with Supabase Auth
    const { data, error } = await _sb.auth.verifyOtp({
        email: email,
        token: otp,
        type: 'email'
    });

    if (error) {
        throw new Error(error.message || 'Invalid or expired OTP.');
    }

    if (!data.session) {
        throw new Error('Verification failed: No session established.');
    }

    // 2. Look up the user's profile from the existing `users` table by email
    const { data: profile, error: profileErr } = await _sb
        .from('users')
        .select('id, username, email, mobile, role')
        .eq('email', email)
        .single();

    // Build session — fall back gracefully if profile not found
    const user = profile
        ? {
            id: profile.id,
            username: profile.username,
            email: profile.email,
            mobile: profile.mobile,
            role: profile.role
          }
        : {
            id: data.user.id,
            username: email.split('@')[0],
            email: data.user.email,
            role: 'admin'
          };

    saveUser(user);
    localStorage.setItem('pd_token', data.session.access_token);
    localStorage.removeItem('mfa_pending_email');

    return { success: true, user };
}

function apiLogout() {
    _sb.auth.signOut().then(() => {
        clearSession();
        window.location.href = 'index.html';
    });
}

// ─── HELPER: throw on Supabase error ─────────────────────────────────────────
function sbCheck(error, context) {
    if (error) throw new Error(`[${context}] ${error.message}`);
}

// ─── STUDENTS ─────────────────────────────────────────────────────────────────
async function getStudents() {
    let { data, error } = await _sb.from('students').select('*').order('created_at', { ascending: false });
    sbCheck(error, 'getStudents');
    return data || [];
}

async function createStudent(payload) {
    // Accepts plain object or FormData
    const obj = payload instanceof FormData ? Object.fromEntries(payload.entries()) : payload;
    const { data, error } = await _sb.from('students').insert(obj).select().single();
    sbCheck(error, 'createStudent');
    return data;
}

async function updateStudent(id, payload) {
    const obj = payload instanceof FormData ? Object.fromEntries(payload.entries()) : payload;
    const { data, error } = await _sb.from('students').update(obj).eq('enrollment_number', id).select().single();
    sbCheck(error, 'updateStudent');
    return data;
}

async function deleteStudent(id) {
    const { error, count } = await _sb.from('students').delete({ count: 'exact' }).eq('enrollment_number', id);
    if (error) throw new Error(`[deleteStudent] ${error.message}`);
    if (count === 0) throw new Error('Delete blocked or record not found.');
    return { success: true, deleted: count };
}

async function importStudents(fileOrFormData) {
    // Accepts a File object or FormData with a 'file' key
    const file = fileOrFormData instanceof File ? fileOrFormData
        : (fileOrFormData instanceof FormData ? fileOrFormData.get('file') : null);
    if (!file) throw new Error('No file provided for import.');
    const rows = await parseCsvFile(file, 'students');
    if (!rows.length) throw new Error('No valid rows found in file.');
    const { data, error } = await _sb.from('students').upsert(rows, { onConflict: 'enrollment_number' }).select();
    sbCheck(error, 'importStudents');
    return { imported: data.length, message: `Successfully imported ${data.length} students.` };
}

async function apiResetStudentPassword(enrollmentNumber, body) {
    // In the pure frontend version, student passwords are stored in their student record
    const { error } = await _sb.from('students')
        .update({ student_password: body.new_password })
        .eq('enrollment_number', enrollmentNumber);
    sbCheck(error, 'resetStudentPassword');
    return { message: 'Password reset successfully.' };
}

// ─── COMPANIES ────────────────────────────────────────────────────────────────
async function getCompanies() {
    let { data, error } = await _sb.from('companies').select('*').order('company_name');
    sbCheck(error, 'getCompanies');
    return data || [];
}

async function createCompany(payload) {
    const { data, error } = await _sb.from('companies').insert(payload).select().single();
    sbCheck(error, 'createCompany');
    return data;
}

async function updateCompany(id, payload) {
    const { data, error } = await _sb.from('companies').update(payload).eq('id', id).select().single();
    sbCheck(error, 'updateCompany');
    return data;
}

async function deleteCompany(id) {
    const { error } = await _sb.from('companies').delete().eq('id', id);
    sbCheck(error, 'deleteCompany');
    return { success: true };
}

async function importCompanies(fileOrFormData) {
    const file = fileOrFormData instanceof File ? fileOrFormData
        : (fileOrFormData instanceof FormData ? fileOrFormData.get('file') : null);
    if (!file) throw new Error('No file provided.');
    const rows = await parseCsvFile(file, 'companies');
    if (!rows.length) throw new Error('No valid rows found.');
    const { data, error } = await _sb.from('companies').upsert(rows, { onConflict: 'id' }).select();
    sbCheck(error, 'importCompanies');
    return { imported: data.length, message: `Imported ${data.length} companies.` };
}

// ─── PLACEMENTS ───────────────────────────────────────────────────────────────
async function getPlacements(prog = '') {
    try {
        let query = _sb.from('placements').select('*').order('created_at', { ascending: false });
        if (prog) query = query.ilike('programme', `%${prog.trim()}%`);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.warn('[api] getPlacements filtered failed, fallback:', e);
        const { data, error } = await _sb.from('placements').select('*').order('created_at', { ascending: false });
        if (error) { sbCheck(error, 'getPlacements'); return []; }
        if (!prog) return data || [];
        return (data || []).filter(p => (p.programme || '').toLowerCase().includes(prog.toLowerCase()));
    }
}

async function createPlacement(payload) {
    const { data, error } = await _sb.from('placements').insert(payload).select().single();
    sbCheck(error, 'createPlacement');
    return data;
}

async function updatePlacement(id, payload) {
    const { data, error } = await _sb.from('placements').update(payload).eq('id', id).select().single();
    sbCheck(error, 'updatePlacement');
    return data;
}

async function deletePlacement(id) {
    const { error, count } = await _sb.from('placements').delete({ count: 'exact' }).eq('id', id);
    if (error) throw new Error(`[deletePlacement] ${error.message}`);
    if (count === 0) throw new Error('Delete blocked or record not found.');
    return { success: true, deleted: count };
}

/**
 * getAcademicYearPlacementRate()
 * ─────────────────────────────────────────────────────────────────────────────
 * Academic year runs July → June.
 * Cutoff rule:
 *   • Before September of the current year  → compute rate for the PREVIOUS
 *     academic year's batch (e.g. Apr 2026 → 2024-25 batch).
 *   • September or later                     → compute rate for the CURRENT
 *     academic year's batch (e.g. Oct 2026 → 2025-26 batch).
 *
 * Formula: (students from that batch who are placed / students from that batch
 *           who opted for placement) × 100
 *
 * Returns: { rate, placed, opted, batchLabel }
 */
async function getAcademicYearPlacementRate() {
    try {
        const now   = new Date();
        const month = now.getMonth() + 1;
        const year  = now.getFullYear();

        // 1. Fetch all required data once for efficiency
        const { data: students, error: sErr } = await _sb.from('students').select('enrollment_number, batch, admitted_year, opted_for_placement');
        if (sErr) throw sErr;
        const { data: placementsRaw, error: pErr } = await _sb.from('placements').select('enrollment_number, role');
        if (pErr) throw pErr;

        const validPlacements = (placementsRaw || []).filter(p => {
            const role = String(p.role || '').toLowerCase().trim();
            const remarks = String(p.remarks || '').toLowerCase().trim();
            return role !== 'awaiting for offer letter' && remarks !== 'awaiting for offer letter';
        });
        const placedSet = new Set(validPlacements.map(p => String(p.enrollment_number).trim()));

        // 2. Identify candidate academic years to check (Current and Previous 2)
        let candidates = [];
        let currStart = (month >= 7) ? year : year - 1;
        candidates.push({ start: currStart, end: currStart + 1 });
        candidates.push({ start: currStart - 1, end: currStart });
        candidates.push({ start: currStart - 2, end: currStart - 1 });

        let bestResult = null;

        for (const cand of candidates) {
            const batchLabel = `${cand.start}-${String(cand.end).slice(-2)}`;
            
            const targetStudents = (students || []).filter(s => {
                const b = String(s.batch || s.admitted_year || '').trim();
                if (!b) return false;
                const bLow = b.toLowerCase();

                // Primary: parse "YYYY-YYYY" or "YYYY-YY" and match by START year
                // e.g. "2024-2025" or "2024-25" → startYear = 2024
                const parts = b.split('-');
                if (parts.length === 2) {
                    const bStart = parseInt(parts[0]);
                    if (!isNaN(bStart) && bStart === cand.start) return true;
                }

                // Secondary: single year field (admitted_year) matches start year
                const singleYear = parseInt(b);
                if (!isNaN(singleYear) && parts.length === 1 && singleYear === cand.start) return true;

                // Tertiary: exact full label match (e.g. "2024-25" or "24-25")
                if (bLow === `${cand.start}-${String(cand.end).slice(-2)}`) return true;
                if (bLow === `${String(cand.start).slice(-2)}-${String(cand.end).slice(-2)}`) return true;

                return false;
            });

            const opted = targetStudents.filter(s => {
                const v = String(s.opted_for_placement || '').toLowerCase().trim();
                return v === 'yes' || v === '1' || v === 'true';
            });

            if (opted.length > 0) {
                const placedCount = opted.filter(s => placedSet.has(String(s.enrollment_number).trim())).length;
                const rate = Math.round((placedCount / opted.length) * 100);
                
                const result = { rate, placed: placedCount, opted: opted.length, batchLabel };
                
                // If we found ANY placements, this is our best result (latest batch with data)
                if (placedCount > 0) return result;
                
                // Otherwise, save it as a fallback in case we find nothing better
                if (!bestResult) bestResult = result;
            }
        }

        return bestResult || { rate: 0, placed: 0, opted: 0, batchLabel: 'N/A' };

    } catch (err) {
        console.error('[api] getAcademicYearPlacementRate error:', err);
        return null;
    }
}

async function importPlacements(fileOrFormData) {
    const file = fileOrFormData instanceof File ? fileOrFormData
        : (fileOrFormData instanceof FormData ? fileOrFormData.get('file') : null);
    if (!file) throw new Error('No file provided.');
    const rows = await parseCsvFile(file, 'placements');
    if (!rows.length) throw new Error('No valid rows found in file. Check that your CSV headers match: Enrolment No., Company Name, Date, Salary (LPA), Status');

    // Smart Replacement: Delete old placements for these students to prevent duplicates
    const enrollmentNumbers = [...new Set(rows.map(r => r.enrollment_number))];
    if (enrollmentNumbers.length > 0) {
        await _sb.from('placements').delete().in('enrollment_number', enrollmentNumbers);
    }

    const { data, error } = await _sb.from('placements').insert(rows).select();
    sbCheck(error, 'importPlacements');
    // Successfully imported. No longer updating local student placements_status flag.
    return { imported: (data || []).length, message: `Successfully imported ${(data || []).length} placement records.` };
}

// ─── INTERNSHIPS ──────────────────────────────────────────────────────────────
async function getInternships(prog = '') {
    try {
        let query = _sb.from('internships').select('*').order('created_at', { ascending: false });
        if (prog) query = query.ilike('programme', `%${prog.trim()}%`);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.warn('[api] getInternships filtered failed, falling back to all then filter:', e);
        const { data, error } = await _sb.from('internships').select('*').order('created_at', { ascending: false });
        if (error) { sbCheck(error, 'getInternships'); return []; }
        if (!prog) return data || [];
        return (data || []).filter(i => (i.programme || i.course || '').toLowerCase().includes(prog.toLowerCase()));
    }
}

async function createInternship(payload) {
    // The internships table id is NOT auto-increment, so we must generate the next id manually.
    const { data: maxData } = await _sb.from('internships').select('id').order('id', { ascending: false }).limit(1);
    let nextId = (maxData && maxData.length > 0) ? maxData[0].id + 1 : 1;

    const isArray = Array.isArray(payload);
    let payloadWithId;
    if (isArray) {
        payloadWithId = payload.map((p, i) => ({ ...p, id: nextId + i }));
    } else {
        payloadWithId = { ...payload, id: nextId };
    }

    const { data, error } = await _sb.from('internships').insert(payloadWithId).select();
    sbCheck(error, 'createInternship');
    return isArray ? data : (data && data[0]);
}

async function updateInternship(id, payload) {
    const { data, error } = await _sb.from('internships').update(payload).eq('id', id).select().single();
    sbCheck(error, 'updateInternship');
    return data;
}

async function deleteInternship(id) {
    const { error, count } = await _sb.from('internships').delete({ count: 'exact' }).eq('id', id);
    if (error) throw new Error(`[deleteInternship] ${error.message}`);
    if (count === 0) throw new Error('Delete blocked or record not found.');
    return { success: true, deleted: count };
}

async function importInternships(fileOrFormData) {
    const file = fileOrFormData instanceof File ? fileOrFormData
        : (fileOrFormData instanceof FormData ? fileOrFormData.get('file') : null);
    if (!file) throw new Error('No file provided.');
    const rows = await parseCsvFile(file, 'internships');
    if (!rows.length) throw new Error('No valid rows found in file. Check that your CSV headers match: Year, Enrolment No., Programme, Gender, Internship Place, Internship Place 02, Type of Organization');

    // Smart Replacement: Delete old internships for these students
    const enrollmentNumbers = [...new Set(rows.map(r => r.enrollment_number))];
    if (enrollmentNumbers.length > 0) {
        await _sb.from('internships').delete().in('enrollment_number', enrollmentNumbers);
    }

    const { data, error } = await _sb.from('internships').insert(rows).select();
    sbCheck(error, 'importInternships');
    return { imported: (data || []).length, message: `Successfully imported ${(data || []).length} internship records.` };
}
// ─── FIELD VISITS ─────────────────────────────────────────────────────────────
async function getFieldVisits(program = '') {
    let query = _sb.from('field_visits').select('*').order('created_at', { ascending: false });
    if (program) query = query.ilike('program_name', `%${program.trim()}%`);
    const { data, error } = await query;
    sbCheck(error, 'getFieldVisits');
    return data || [];
}

async function createFieldVisit(payload) {
    const isArray = Array.isArray(payload);
    const { data, error } = await _sb.from('field_visits').insert(payload).select();
    sbCheck(error, 'createFieldVisit');
    return isArray ? data : data[0];
}

async function updateFieldVisit(id, payload) {
    const { data, error } = await _sb.from('field_visits').update(payload).eq('id', id).select().single();
    sbCheck(error, 'updateFieldVisit');
    return data;
}

async function deleteFieldVisit(id) {
    const { error, count } = await _sb.from('field_visits').delete({ count: 'exact' }).eq('id', id);
    if (error) throw new Error(`[deleteFieldVisit] ${error.message}`);
    if (count === 0) throw new Error('Delete blocked or record not found.');
    return { success: true, deleted: count };
}

async function importFieldVisits(fileOrFormData) {
    const file = fileOrFormData instanceof File ? fileOrFormData
        : (fileOrFormData instanceof FormData ? fileOrFormData.get('file') : null);
    if (!file) throw new Error('No file provided.');
    const rows = await parseCsvFile(file, 'field_visited');
    if (!rows.length) throw new Error('No valid rows found in file.');

    // For Field Visits, we insert all new rows (no specific student conflict)
    const { data, error } = await _sb.from('field_visits').insert(rows).select();
    sbCheck(error, 'importFieldVisits');
    return { imported: (data || []).length, message: `Successfully imported ${(data || []).length} field visit records.` };
}

// ─── INDUSTRIAL VISITS ────────────────────────────────────────────────────────
async function getIndustrialVisits(program = '') {
    let query = _sb.from('industrial_visits').select('*').order('created_at', { ascending: false });
    if (program) query = query.ilike('program_name', `%${program.trim()}%`);
    const { data, error } = await query;
    sbCheck(error, 'getIndustrialVisits');
    return data || [];
}

async function createIndustrialVisit(payload) {
    const { data, error } = await _sb.from('industrial_visits').insert(payload).select().single();
    sbCheck(error, 'createIndustrialVisit');
    return data;
}

async function updateIndustrialVisit(id, payload) {
    const { data, error } = await _sb.from('industrial_visits').update(payload).eq('id', id).select().single();
    sbCheck(error, 'updateIndustrialVisit');
    return data;
}

async function deleteIndustrialVisit(id) {
    const { error, count } = await _sb.from('industrial_visits').delete({ count: 'exact' }).eq('id', id);
    if (error) throw new Error(`[deleteIndustrialVisit] ${error.message}`);
    if (count === 0) throw new Error('Delete blocked or record not found.');
    return { success: true, deleted: count };
}

async function importIndustrialVisits(fileOrFormData) {
    const file = fileOrFormData instanceof File ? fileOrFormData
        : (fileOrFormData instanceof FormData ? fileOrFormData.get('file') : null);
    if (!file) throw new Error('No file provided.');
    const rows = await parseCsvFile(file, 'industrial_visited');
    if (!rows.length) throw new Error('No valid rows found in file.');
    const { data, error } = await _sb.from('industrial_visits').insert(rows).select();
    sbCheck(error, 'importIndustrialVisits');
    return { imported: (data || []).length, message: `Successfully imported ${(data || []).length} industrial visit records.` };
}

// ─── REPORTS (computed client-side from raw data) ─────────────────────────────
async function getStats(programme = '') {
    const buildCount = (table, colHint = 'programme') => {
        let q = _sb.from(table).select('*', { count: 'exact', head: true });
        if (programme) {
            // Filter by the correct column name per table
            if (table === 'placements') q = q.ilike('programme', `%${programme.trim()}%`);
            else if (table === 'internships') q = q.ilike('programme', `%${programme.trim()}%`);
            else if (table === 'field_visits' || table === 'industrial_visits') q = q.ilike('program_name', `%${programme.trim()}%`);
            else q = q.ilike(colHint, `%${programme.trim()}%`);
        }
        return q.then(r => r.count || 0).catch(err => {
            console.warn(`[api] buildCount failed for ${table}:`, err);
            // Fallback: get total count if filtered one failed
            return _sb.from(table).select('*', { count: 'exact', head: true }).then(r => r.count || 0).catch(() => 0);
        });
    };

    const results = await Promise.allSettled([
        buildCount('students', 'programme'),
        buildCount('placements', 'course'),
        buildCount('companies', 'company_name'),
        getInternships(programme).then(list => {
            const map = new Set();
            (list || []).forEach(item => {
                const key = [
                    (item.internship_place || '').trim(),
                    (item.year || '').trim(),
                    (item.batch || '').trim(),
                    (item.duration_of_intership || '').trim(),
                    (item.city_of_intership || '').trim(),
                    (item.type_of_organization || '').trim()
                ].join('||');
                map.add(key);
            });
            return map.size;
        }).catch(() => 0),
        buildCount('field_visits', 'program_name'),
        buildCount('industrial_visits', 'program_name'),
        buildCount('jobs', 'title')
    ]);

    const getValue = (idx) => results[idx].status === 'fulfilled' ? results[idx].value : 0;
    const total_students = getValue(0);
    const placed_students = getValue(1);

    // Fallback counts for total students based on activity if tables are empty
    let final_total_students = total_students;
    if (final_total_students === 0) {
        const [ps, is] = await Promise.all([getPlacements(programme), getInternships(programme)]);
        const uniqueIds = new Set([
            ...ps.map(x => x.enrollment_number || x.name || x.student_name),
            ...is.map(x => x.enrolment_no || x.name_of_student || x.student_name)
        ].filter(Boolean));
        final_total_students = uniqueIds.size;
    }

    const acRate = await getAcademicYearPlacementRate();

    return {
        total_students: final_total_students,
        placed_students,
        placement_rate: acRate ? acRate.rate : 0,
        placement_batch: acRate ? acRate.batchLabel : 'N/A',
        total_companies: getValue(2),
        total_internships: getValue(3),
        total_field_visits: getValue(4),
        total_industrial_visits: getValue(5),
        total_visits: getValue(4) + getValue(5),
        total_external_jobs: getValue(6)
    };
}

async function getDeptStats(programme = '') {
    try {
        const [students, placementsAll] = await Promise.all([
            getStudents().catch(() => []),
            getPlacements().catch(() => [])
        ]);

        const placements = placementsAll.filter(p => {
            const role = String(p.role || '').toLowerCase().trim();
            const remarks = String(p.remarks || '').toLowerCase().trim();
            return role !== 'awaiting for offer letter' && remarks !== 'awaiting for offer letter';
        });
        const deptMap = {};
        const activePlacements = new Set(placements.map(p => String(p.enrollment_number).trim()));

        // 1. Map from Students
        students.forEach(s => {
            const d = s.programme || 'Unknown';
            if (programme && d !== programme) return;
            if (!deptMap[d]) deptMap[d] = { total: 0, placed: 0 };
            deptMap[d].total++;
            if (activePlacements.has(String(s.enrollment_number).trim())) {
                deptMap[d].placed++;
            }
        });

        // 2. Fallback: If we have placements for a course not in students table
        placements.forEach(p => {
            const d = p.programme || p.course || 'Other';
            if (programme && d !== programme) return;
            
            // If we already counted this student in step 1, skip.
            const isCounted = students.find(s => String(s.enrollment_number).trim() === String(p.enrollment_number).trim());
            if (isCounted) return;

            if (!deptMap[d]) deptMap[d] = { total: 0, placed: 0 };
            deptMap[d].placed++;
            if (deptMap[d].total < deptMap[d].placed) deptMap[d].total = deptMap[d].placed;
        });

        return Object.entries(deptMap).map(([dept, v]) => ({
            programme: dept,
            total: v.total,
            placed: v.placed
        }));
    } catch (e) {
        console.error('getDeptStats Error:', e);
        return [];
    }
}

async function getYearlyTrend(prog = '') {
    const allPlacements = await getPlacements(prog);
    const placements = allPlacements.filter(p => {
        const role = String(p.role || '').toLowerCase().trim();
        const remarks = String(p.remarks || '').toLowerCase().trim();
        return role !== 'awaiting for offer letter' && remarks !== 'awaiting for offer letter';
    });
    const yearMap = {};
    placements.forEach(p => {
        // Attempt to extract year from various date fields
        const dateStr = p.created_at || '';
        const yMatch = dateStr.match(/\b(20\d{2})\b/);
        const y = yMatch ? yMatch[1] : (dateStr.split('-')[0] || 'Unknown');
        yearMap[y] = (yearMap[y] || 0) + 1;
    });

    const sortedEntries = Object.entries(yearMap)
        .sort(([a], [b]) => a.localeCompare(b));

    return {
        labels: sortedEntries.map(([year]) => year),
        data: sortedEntries.map(([_, count]) => count)
    };
}

async function getStudentsYearly() {
    const [students, placements] = await Promise.all([
        getStudents().catch(() => []),
        getPlacements().catch(() => [])
    ]);
    const activePlacements = new Set(placements.map(p => String(p.enrollment_number).trim()));
    const yearMap = {};
    
    students.forEach(s => {
        // Safe year extraction
        const dateStr = s.created_at || '';
        const yMatch = dateStr.match(/\b(20\d{2})\b/);
        const y = yMatch ? yMatch[1] : (dateStr.split('-')[0] || 'Unknown');

        if (!yearMap[y]) yearMap[y] = { total: 0, placed: 0 };
        yearMap[y].total++;
        if (activePlacements.has(String(s.enrollment_number).trim())) {
            yearMap[y].placed++;
        }
    });

    const entries = Object.entries(yearMap).sort(([a], [b]) => a.localeCompare(b));
    return {
        labels: entries.map(([y]) => y),
        total: entries.map(([_, v]) => v.total),
        placed: entries.map(([_, v]) => v.placed)
    };
}

async function getSalaryDist() {
    const placements = await getPlacements();
    const ranges = {
        '0-3 LPA': 0,
        '3-6 LPA': 0,
        '6-10 LPA': 0,
        '10+ LPA': 0
    };

    const parseLPA = (s) => {
        if (!s) return 0;
        if (typeof s === 'number') return s;
        // Strip non-numeric except decimal point
        const clean = String(s).replace(/[^\d.]/g, '');
        const val = parseFloat(clean);
        // Handle "500,000" where it might be in rupees instead of LPA
        if (val > 1000) return val / 100000;
        return val;
    };

    placements.forEach(p => {
        const ctc = parseLPA(p.ctc || p.salary_lpa || 0);
        if (ctc > 0 && ctc <= 3) ranges['0-3 LPA']++;
        else if (ctc > 3 && ctc <= 6) ranges['3-6 LPA']++;
        else if (ctc > 6 && ctc <= 10) ranges['6-10 LPA']++;
        else if (ctc > 10) ranges['10+ LPA']++;
    });

    return Object.entries(ranges).map(([range, count]) => ({ range, count }));
}

// ─── ADMIN PROFILE ────────────────────────────────────────────────────────────

async function updateAdminProfile(payload) {
    const userStr = localStorage.getItem('pd_user');
    if (!userStr) throw new Error('Not logged in');
    const user = JSON.parse(userStr);
    
    const updates = {};
    if (payload.email) updates.email = payload.email;
    if (payload.mobile) updates.mobile = payload.mobile;
    if (payload.firstName || payload.lastName) {
        const first = payload.firstName || user.username.split(' ')[0];
        const last = payload.lastName || user.username.split(' ').slice(1).join(' ');
        updates.username = `${first} ${last}`.trim();
    }
    
    const { data, error } = await _sb.from('users').update(updates).eq('id', user.id).select().single();
    sbCheck(error, 'updateUserProfile');
    
    // Update local storage
    if (updates.email) user.email = updates.email;
    if (updates.mobile) user.mobile = updates.mobile;
    if (updates.username) user.username = updates.username;
    saveUser(user);
    
    return data;
}

async function changeAdminPassword(payload) {
    const currentHash = await sha256(payload.current_password);
    const { data: settings, error: fetchErr } = await _sb.from('settings').select('admin_password_hash').limit(1).single();
    sbCheck(fetchErr, 'changeAdminPassword-fetch');
    if (settings.admin_password_hash !== currentHash) throw new Error('Current password is incorrect.');
    const newHash = await sha256(payload.new_password);
    const { error } = await _sb.from('settings').update({ admin_password_hash: newHash }).eq('id', 1);
    sbCheck(error, 'changeAdminPassword-update');
    return { message: 'Password changed successfully.' };
}

// ─── 2FA SETTINGS ─────────────────────────────────────────────────────────────
async function toggle2fa(enabled) {
    const { error } = await _sb.from('settings').update({ two_factor_enabled: enabled }).eq('id', 1);
    sbCheck(error, 'toggle2fa');
    return { enabled };
}

async function get2faStatus() {
    const { data, error } = await _sb.from('settings').select('two_factor_enabled').limit(1).single();
    sbCheck(error, 'get2faStatus');
    return { enabled: data.two_factor_enabled };
}


// ─── DOWNLOAD CSV TEMPLATES ──────────────────────────────────────────────────
function downloadTemplate(type) {
    let filename = '';
    
    if (type === 'students') {
        filename = 'students_temp.csv';
    } else if (type === 'companies') {
        filename = 'companies_temp.csv';
    } else if (type === 'placements') {
        filename = 'placements_temp.csv';
    } else if (type === 'internships') {
        filename = 'internships_temp.csv';
    } else if (type === 'field_visits') {
        filename = 'field_visits_temp.csv';
    } else if (type === 'industrial_visits') {
        filename = 'industrial_visits_temp.csv';
    } else {
        alert('Unknown template type');
        return;
    }

    const link = document.createElement('a');
    link.href = filename;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ─── EXPORT TO EXCEL (client-side via SheetJS) ────────────────────────────────

async function exportData(type) {
    if (typeof XLSX === 'undefined') {
        alert('SheetJS library not loaded. Please check your internet connection.');
        return;
    }
    try {
        let rows = [];
        let sheetName = type;
        if (type === 'students') { rows = await getStudents(); sheetName = 'Students'; }
        else if (type === 'placements') { rows = await getPlacements(); sheetName = 'Placements'; }
        else if (type === 'companies') { rows = await getCompanies(); sheetName = 'Companies'; }
        else if (type === 'internships') { rows = await getInternships(); sheetName = 'Internships'; }
        else if (type === 'field_visits') { rows = await getFieldVisits(); sheetName = 'FieldVisits'; }
        else throw new Error(`Unknown export type: ${type}`);

        if (!rows || !rows.length) { alert('No data to export.'); return; }

        // Remove internal fields
        const cleaned = rows.map(r => {
            const obj = { ...r };
            delete obj.created_at;
            return obj;
        });

        const ws = XLSX.utils.json_to_sheet(cleaned);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        const filename = `${type}_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
    } catch (err) {
        alert('Export Error: ' + err.message);
    }
}

// ─── CSV/EXCEL PARSER (client-side via SheetJS) ───────────────────────────────────
async function parseCsvFile(file, type) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') {
            reject(new Error('SheetJS (xlsx) library not loaded.'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

                let rows = [];
                // Helper: normalize keys
                const normalizeRow = (r) => {
                    const nr = {};
                    for (const key in r) {
                        if (r.hasOwnProperty(key)) {
                            nr[key.trim().toLowerCase()] = r[key];
                        }
                    }
                    return nr;
                };

                // Helper: get first matching value from a normalized row using lowercase keys
                function col(nr, ...keys) {
                    for (let k of keys) {
                        k = k.trim().toLowerCase();
                        if (nr[k] !== undefined && nr[k] !== '') {
                            let val = nr[k];
                            // Handle scientific notation for large numbers (like Enrolment No.)
                            if (typeof val === 'number') {
                                // If it's a very large number (likely an ID), prevent scientific notation
                                if (val > 1000000) {
                                    return val.toLocaleString('fullwide', { useGrouping: false });
                                }
                                return String(val).trim();
                            }
                            return String(val).trim();
                        }
                    }
                    return '';
                }

                if (type === 'students') {
                    rows = raw.map(r => {
                        const nr = normalizeRow(r);
                        return {
                            admitted_year: col(nr, 'Admitted_Year', 'Admitted Year', 'admitted_year'),
                            student_name: col(nr, 'Name_of_the_Student', 'Student_Name', 'Student Name', 'Name', 'student_name'),
                            enrollment_number: col(nr, 'Enrollment_No', 'Enrollment No', 'Enrollment Number', 'Enrolment Number', 'enrollment_number'),
                            programme: col(nr, 'Program', 'Programme', 'programme'),
                            batch: col(nr, 'Batch', 'batch'),
                            student_email_id: col(nr, 'RRU_Email_id', 'Email ID', 'Email Id', 'Email', 'student_email_id'),
                            personal_email_id: col(nr, 'Personal_email_id', 'personal_email_id'),
                            mobile_number: col(nr, 'Phone_number', 'Mobile Number', 'Mobile', 'Phone', 'mobile_number'),
                            remark: col(nr, 'Remark', 'remark'),
                            opted_for_placement: col(nr, 'Opted for Placement', 'OPTED FOR PLACEMENT?', 'opted_for_placement') || 'No',

                        };
                    }).filter(r => r.enrollment_number && r.student_name);

                } else if (type === 'companies') {
                    rows = raw.map(r => {
                        const nr = normalizeRow(r);
                        return {
                            company_name: col(nr, 'Company Name', 'Company', 'company_name'),
                            role: col(nr, 'Role', 'role'),
                            contact_person: col(nr, 'Contact Person', 'Contact Name', 'contact_person'),
                            contact: col(nr, 'Contact', 'Phone', 'Mobile', 'contact'),
                        };
                    }).filter(r => r.company_name);

                } else if (type === 'placements') {
                    rows = raw.map(r => {
                        const nr = normalizeRow(r);
                        return {
                            enrollment_number: col(nr, 'Enrollment_No', 'Enrollment No', 'Enrollment Number', 'Enrolment Number', 'enrollment_number', 'Enrollement No.'),
                            programme: col(nr, 'Programme', 'Course', 'programme', 'course', 'program'),
                            batch: col(nr, 'Batch', 'batch'),
                            name: col(nr, 'Name', 'Student Name', 'name', 'student_name'),
                            role: col(nr, 'Role', 'remarks', 'role'),
                            company: col(nr, 'Company', 'company', 'organization_name'),
                            city: col(nr, 'City', 'city'),
                            salary: col(nr, 'Salary', 'ctc', 'package', 'salary')
                        };
                    }).filter(r => r.enrollment_number);

                } else if (type === 'internships') {
                    rows = raw.map(r => {
                        const nr = normalizeRow(r);
                        return {
                            enrollment_number: col(nr, 'Enrollment_No', 'Enrolment No.', 'Enrollment No', 'Enrollment Number', 'Enrolment Number', 'enrollment_number', 'Enrollement No.'),
                            year: col(nr, 'Year', 'year'),
                            programme: col(nr, 'Programme', 'Program', 'programme'),
                            name_of_student: col(nr, 'Name of Student', 'Student Name', 'Name', 'student_name', 'name_of_student'),
                            gender: col(nr, 'Gender', 'gender'),
                            role: col(nr, 'Role', 'role', 'internship_role'),
                            salary: col(nr, 'Salary', 'salary', 'stipend'),
                            internship_place_01: col(nr, 'Internship Place', 'internship_place', 'Internship Place 01', 'organization'),
                            duration_of_intership_01: col(nr, 'Duration', 'duration', 'duration_of_intership', 'Duration 01'),
                            city_of_intership_01: col(nr, 'City', 'Internship City', 'city', 'city_of_intership', 'City 01'),
                            type_of_organization: col(nr, 'Type of Organization', 'Organization Type', 'organization_type', 'type_of_organization')
                        };
                    }).filter(r => r.enrollment_number);
                } else if (type === 'field_visits' || type === 'field_visited') {
                    rows = raw.map(r => {
                        const nr = normalizeRow(r);
                        return {
                            field_visited: col(nr, 'Field_Visited', 'Department', 'Dept', 'Dept.', 'organization_name', 'field_visited'),
                            visited_date: col(nr, 'Visited_Date', 'Date', 'Visit Date', 'visit_date'),
                            visit_type: col(nr, 'Visit Type', 'Type', 'type', 'visit_type') || 'Government',
                            no_of_student_visited: parseInt(col(nr, 'No_of_Student_Visited', 'No of Students', 'No of Student Visited', 'Students', 'students_visited') || 0),
                            program_name: col(nr, 'Program_Name', 'Programme', 'programme', 'program'),
                            batch: col(nr, 'Batch', 'batch'),
                            no_of_staff_visited: parseInt(col(nr, 'No_of_Staff_Visited', 'No of Staff', 'No of Staff Visited', 'Staff', 'staff_visited') || 0),
                            staff_name: col(nr, 'Staff_Name', 'Faculty Coordinator', 'Faculty', 'Coordinator', 'staff_name', 'faculty'),
                            city: col(nr, 'City', 'Location', 'Place', 'city')
                        };
                    }).filter(r => r.field_visited && r.visited_date);
                } else if (type === 'industrial_visits' || type === 'industrial_visited') {
                    rows = raw.map(r => {
                        const nr = normalizeRow(r);
                        return {
                            organization_name: col(nr, 'Organization_Visited', 'Organization Name', 'Organization', 'organization_name', 'field_visited'),
                            visited_date: col(nr, 'Visited_Date', 'Date', 'Visit Date', 'visit_date'),
                            visit_type: col(nr, 'Visit Type', 'Type', 'type', 'visit_type') || 'Private',
                            no_of_student_visited: parseInt(col(nr, 'No_of_Student_Visited', 'No of Students', 'No of Student Visited', 'Students', 'students_visited') || 0),
                            program_name: col(nr, 'Program_Name', 'Programme', 'programme', 'program'),
                            batch: col(nr, 'Batch', 'batch'),
                            no_of_staff_visited: parseInt(col(nr, 'No_of_Staff_Visited', 'No of Staff', 'No of Staff Visited', 'Staff', 'staff_visited') || 0),
                            staff_name: col(nr, 'Staff_Name', 'Faculty Coordinator', 'Faculty', 'Coordinator', 'staff_name', 'faculty'),
                            city: col(nr, 'City', 'Location', 'Place', 'city')
                        };
                    }).filter(r => r.organization_name && r.visited_date);
                }
                resolve(rows);
            } catch (err) {
                reject(new Error('Failed to parse Excel file: ' + err.message));
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsArrayBuffer(file);
    });
}

// Removed legacy loadAdminProfileData() - now handled in script.js to support multiple users
