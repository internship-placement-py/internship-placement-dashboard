import requests

try:
    print("Sending POST request to /api/jobs/scrape...")
    res = requests.post('http://localhost:3000/api/jobs/scrape')
    print("Status code:", res.status_code)
    print("Response JSON:", res.json())
except Exception as e:
    print("Error:", e)
