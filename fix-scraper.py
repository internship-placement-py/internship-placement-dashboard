import re
with open('scraper_server.py', 'r') as f: content = f.read()
# Remove duplicate block
content = content.replace('    if not all_scraped_jobs:\n        return jsonify({"success": False, "message": "Failed to scrape any jobs."}), 500\n\n    if not all_scraped_jobs:', '    if not all_scraped_jobs:')
with open('scraper_server.py', 'w') as f: f.write(content)
