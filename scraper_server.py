import time
import requests
import random
import concurrent.futures
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from flask import Flask, jsonify
from flask_cors import CORS
from supabase import create_client, Client

app = Flask(__name__)
CORS(app)

# --- Configuration ---
SCRAPER_API_KEY = "940ea962e912a9c953a41b4a56dd19f4"
SUPABASE_URL = "https://nbkihlealvnilurwqlxr.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ia2lobGVhbHZuaWx1cndxbHhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MDk5NDMsImV4cCI6MjA5NDM4NTk0M30.3ou40xDGY1LzvK-fpbD9RxVwoxCQ3EjMAeLR0pVL188"
SCRAPER_BASE = "http://api.scraperapi.com"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

DOMAINS = [
    {"keyword": "cyber security",    "domain": "Cyber Security"},
    {"keyword": "digital forensics", "domain": "Digital Forensics"},
    {"keyword": "criminology",       "domain": "Criminology"},
    {"keyword": "corporate security","domain": "Corporate Security"},
    {"keyword": "physical security", "domain": "Physical Security"},
]


def fetch_html(url):
    params = {
        'api_key': SCRAPER_API_KEY,
        'url': url,
        'country_code': 'in',
    }
    try:
        r = requests.get(SCRAPER_BASE, params=params, timeout=90)
        if r.status_code == 200:
            return r.text
        print(f"  [WARN] ScraperAPI returned {r.status_code} for {url}")
    except Exception as e:
        print(f"  [ERROR] fetch_html failed: {e}")
    return None


def t(el):
    return el.get_text(strip=True) if el else ""


# ─── INTERNSHALA ─────────────────────────────────────────────────────────────────
def scrape_internshala(d):
    jobs = []
    kw = d['keyword'].replace(' ', '%20')
    url = f"https://internshala.com/internships/keywords-{kw}/"
    print(f"  Internshala → {url}")
    html = fetch_html(url)
    if not html:
        return jobs

    soup = BeautifulSoup(html, 'html.parser')
    cards = soup.select('.individual_internship')
    print(f"    {len(cards)} cards found")

    for card in cards[:5]:
        try:
            title_el = (
                card.select_one('a#job_title') or
                card.select_one('a.job-title-href') or
                card.select_one('.job-internship-name a')
            )
            company_el = (
                card.select_one('.company_and_premium p') or
                card.select_one('.company_name p') or
                card.select_one('.heading_6 p')
            )
            loc_el = (
                card.select_one('#location_names span') or
                card.select_one('.location_names span')
            )

            title   = t(title_el).strip()
            company = t(company_el).strip()
            location= t(loc_el).strip() or "India"

            href = title_el['href'] if title_el and title_el.has_attr('href') else ""
            if not href:
                href = card.get('data-href', '')
            if href.startswith('/'):
                href = "https://internshala.com" + href

            if not title or not company or not href:
                continue

            jobs.append({
                "title": title, "company": company,
                "platform": "Internshala", "domain": d['domain'],
                "location": location, "job_type": "Internship",
                "experience": "Freshers", "apply_link": href,
            })
        except Exception as ex:
            print(f"    [WARN] card parse error: {ex}")

    print(f"    → {len(jobs)} Internshala jobs parsed")
    return jobs


# ─── INDEED ──────────────────────────────────────────────────────────────────────
def scrape_indeed(d):
    jobs = []
    kw = d['keyword'].replace(' ', '+')
    url = f"https://in.indeed.com/jobs?q={kw}&l=India&sort=date"
    print(f"  Indeed → {url}")
    html = fetch_html(url)
    if not html:
        return jobs

    soup = BeautifulSoup(html, 'html.parser')

    # In Indeed's current HTML, [data-jk] is on the <a> title element itself
    # We need to find the parent job card container differently
    job_links = soup.select('a[data-jk]')
    print(f"    {len(job_links)} job links found")

    for link_el in job_links[:5]:
        try:
            jk = link_el.get('data-jk', '')
            if not jk:
                continue

            # Title is inside a <span> within the link
            title_span = link_el.select_one('span[id*="jobTitle"]') or link_el.select_one('span')
            title = title_span.get_text(strip=True) if title_span else link_el.get_text(strip=True)
            title = title.strip()

            # Walk up to the job card container to find company & location
            card = link_el.find_parent('div', class_=lambda c: c and 'job_seen' in c)
            if not card:
                card = link_el.find_parent('li') or link_el.find_parent('div', attrs={'data-testid': True})

            company = ""
            location = "India"
            if card:
                company_el = card.select_one('[data-testid="company-name"], .companyName, [class*="company"]')
                loc_el     = card.select_one('[data-testid="text-location"], .companyLocation, [class*="location"]')
                company  = t(company_el).strip()
                location = t(loc_el).strip() or "India"

            href = f"https://in.indeed.com/viewjob?jk={jk}"

            if not title or not company:
                continue

            jobs.append({
                "title": title, "company": company,
                "platform": "Indeed", "domain": d['domain'],
                "location": location, "job_type": "Full Time",
                "experience": "Freshers", "apply_link": href,
            })
        except Exception as ex:
            print(f"    [WARN] Indeed parse error: {ex}")

    print(f"    → {len(jobs)} Indeed jobs parsed")
    return jobs


# ─── GOVT PORTAL (via Indeed Government Filter) ──────────────────────────────────
def scrape_govt_portal(d):
    jobs = []
    kw = f"government {d['keyword']}".replace(' ', '+')
    url = f"https://in.indeed.com/jobs?q={kw}&l=India&sort=date"
    print(f"  Govt Portal → {url}")
    html = fetch_html(url)
    if not html:
        return jobs

    soup = BeautifulSoup(html, 'html.parser')
    job_links = soup.select('a[data-jk]')

    for link_el in job_links[:5]:
        try:
            jk = link_el.get('data-jk', '')
            if not jk: continue

            title_span = link_el.select_one('span[id*="jobTitle"]') or link_el.select_one('span')
            title = title_span.get_text(strip=True) if title_span else link_el.get_text(strip=True)
            title = title.strip()

            card = link_el.find_parent('div', class_=lambda c: c and 'job_seen' in c)
            if not card:
                card = link_el.find_parent('li') or link_el.find_parent('div', attrs={'data-testid': True})

            company = ""
            location = "India"
            if card:
                company_el = card.select_one('[data-testid="company-name"], .companyName, [class*="company"]')
                loc_el     = card.select_one('[data-testid="text-location"], .companyLocation, [class*="location"]')
                company  = t(company_el).strip()
                location = t(loc_el).strip() or "India"

            href = f"https://in.indeed.com/viewjob?jk={jk}"

            if not title or not company: continue

            jobs.append({
                "title": title, "company": company,
                "platform": "Govt Portal", "domain": d['domain'],
                "location": location, "job_type": "Govt Job",
                "experience": "Freshers", "apply_link": href,
            })
        except Exception as ex:
            pass

    print(f"    → {len(jobs)} Govt Portal jobs parsed")
    return jobs


# ─── NAUKRI ──────────────────────────────────────────────────────────────────────
def scrape_naukri(d):
    jobs = []
    kw = d['keyword'].replace(' ', '-')
    url = f"https://www.naukri.com/{kw}-jobs-in-india"
    print(f"  Naukri → {url}")
    # Naukri requires JS rendering via ScraperAPI to load the SPA
    params = {
        'api_key': SCRAPER_API_KEY,
        'url': url,
        'country_code': 'in',
        'render': 'true'
    }
    try:
        r = requests.get(SCRAPER_BASE, params=params, timeout=120)
        if r.status_code != 200:
            print(f"    [WARN] Naukri API returned {r.status_code}")
            return jobs
        
        soup = BeautifulSoup(r.text, 'html.parser')
        cards = soup.select('.srp-jobtuple-wrapper')
        print(f"    {len(cards)} cards found")

        for card in cards[:5]:
            try:
                title_el   = card.select_one('a.title')
                company_el = card.select_one('a.comp-name')
                loc_el     = card.select_one('.locWdth')

                title   = t(title_el).strip()
                company = t(company_el).strip()
                location= t(loc_el).strip() or "India"
                href    = title_el['href'] if title_el and title_el.has_attr('href') else url

                if not title or not company:
                    continue

                jobs.append({
                    "title": title, "company": company,
                    "platform": "Naukri", "domain": d['domain'],
                    "location": location, "job_type": "Full Time",
                    "experience": "Freshers", "apply_link": href,
                })
            except Exception as ex:
                print(f"    [WARN] Naukri card error: {ex}")

    except Exception as e:
        print(f"    [ERROR] Naukri scrape failed: {e}")

    print(f"    → {len(jobs)} Naukri jobs parsed")
    return jobs

# ─── MAIN ROUTE ──────────────────────────────────────────────────────────────────
@app.route('/api/jobs/scrape', methods=['POST'])
def scrape_jobs():
    all_jobs = []

    print("\n=== Starting Concurrent Scrape ===")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = []
        for d in DOMAINS:
            futures.append(executor.submit(scrape_internshala, d))
            futures.append(executor.submit(scrape_indeed, d))
            futures.append(executor.submit(scrape_naukri, d))
            futures.append(executor.submit(scrape_govt_portal, d))
            
        for future in concurrent.futures.as_completed(futures):
            try:
                res = future.result()
                if res:
                    all_jobs.extend(res)
            except Exception as e:
                print(f"[ERROR] A scraper task failed: {e}")

    print(f"\nTotal raw scraped: {len(all_jobs)}")

    # Deduplicate by apply_link (dict keeps last occurrence — all unique after)
    seen = {}
    for j in all_jobs:
        link = j.get('apply_link', '')
        if link and link not in seen:
            seen[link] = j
    deduped = list(seen.values())

    # Filter out entries with generic/empty titles or companies
    BAD_TITLES   = {"", "internship", "job opening", "job", "linkedin job"}
    BAD_COMPANIES= {"", "unknown company", "company", "various", "company on internshala"}
    valid = [
        j for j in deduped
        if j['title'].lower() not in BAD_TITLES
        and j['company'].lower() not in BAD_COMPANIES
    ]

    print(f"Valid after dedup+filter: {len(valid)}")

    if not valid:
        return jsonify({"success": False, "message": "No valid jobs scraped."}), 200

    # ── Step 1: Add Deadlines to Valid Jobs ──
    for j in valid:
        # Assign deadlines to create a realistic mix for demonstration:
        # 30% Expired (past 1-5 days), 30% Closing Soon (next 1-3 days), 40% Normal (next 4-30 days)
        rand = random.random()
        base_date = datetime.now()
        if rand < 0.30:
            delta = -random.randint(1, 5) # Expired
        elif rand < 0.60:
            delta = random.randint(1, 3)  # Closing soon
        else:
            delta = random.randint(4, 30) # Normal

        j['deadline'] = (base_date + timedelta(days=delta)).strftime('%Y-%m-%d')
        j['created_at'] = time.strftime('%Y-%m-%dT%H:%M:%S.000Z')

    # ── Step 2: Fetch Existing Jobs ──
    try:
        existing_resp = supabase.table('jobs').select('id, apply_link').execute()
        existing_map  = {row['apply_link']: row['id'] for row in (existing_resp.data or [])}
    except Exception as e:
        print(f"[WARN] Could not fetch existing jobs: {e}")
        existing_map = {}

    to_insert = [j for j in valid if j['apply_link'] not in existing_map]
    to_update = [j for j in valid if j['apply_link'] in existing_map]

    print(f"New jobs to insert: {len(to_insert)}, Jobs to refresh: {len(to_update)}")

    # ── Step 3: Update timestamps/deadlines of existing jobs ──
    for j in to_update:
        jid = existing_map[j['apply_link']]
        try:
            supabase.table('jobs').update({
                'created_at': j['created_at'],
                'title': j['title'],
                'company': j['company'],
                'deadline': j['deadline']
            }).eq('id', jid).execute()
        except Exception as e:
            print(f"[WARN] Update error for {j['apply_link']}: {e}")

    # ── Step 4: Insert NEW jobs ──
    if to_insert:
        try:
            supabase.table('jobs').insert(to_insert).execute()
            print(f"Inserted {len(to_insert)} new jobs.")
        except Exception as e:
            print(f"[ERROR] Insert error: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    # ── Step 5: Enforce maximum limit of 120 jobs ──
    try:
        all_jobs_resp = supabase.table('jobs').select('id').order('created_at', desc=True).execute()
        all_jobs_ids = [row['id'] for row in (all_jobs_resp.data or [])]
        
        if len(all_jobs_ids) > 120:
            ids_to_delete = all_jobs_ids[120:]
            # Supabase free tier limits in_() deletions, so batch if necessary, but here it's small.
            supabase.table('jobs').delete().in_('id', ids_to_delete).execute()
            print(f"Deleted {len(ids_to_delete)} old jobs to enforce 120 limit.")
    except Exception as e:
        print(f"[ERROR] Limit enforcement failed: {e}")

    total = len(valid)
    return jsonify({
        "success": True,
        "count": total,
        "new": len(to_insert),
        "refreshed": len(to_update)
    })


if __name__ == '__main__':
    print("Job Scraper Service starting on port 3000...")
    app.run(port=3000, debug=False)
