/**
 * supabase-client.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Central Supabase configuration for the Placement Dashboard.
 *
 * HOW TO MOVE TO A NEW HOST:
 *   1. Copy all HTML/CSS/JS files to the new location.
 *   2. Edit ONLY this file — update SUPABASE_URL and SUPABASE_ANON_KEY.
 *   3. Done. The entire app will work from any static host.
 *
 * SUPABASE PROJECT: https://supabase.com/dashboard/project/rnuuhgiqymukzojiflry
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL      = window.ENV?.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

// Create the singleton Supabase client.
// The supabase-js CDN must be loaded BEFORE this file.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Make it globally available
window._sb = sb;
