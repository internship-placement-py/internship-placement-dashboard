# Placement Dashboard (Flask + HTML/JS/CSS)

A full-stack, responsive Placement Monitor Dashboard application with a Python Flask RESTful backend and SQLite database. This software is designed for an academic placement cell to track students, company registations, active internships and placement progress.

## Features Built
- **Backend API**: Python Flask application serving RESTful routes handling Authentication and complete CRUD operations.
- **Database**: Easy-to-maintain SQLite `placement.db` utilizing SQLAlchemy ORM.
- **Frontend Interactivity**: Pure HTML, vanilla CSS, and JavaScript invoking the backend APIS using `fetch()`.
- **JWT Protection**: Secured routes across the backend and automatic redirect `auth-guard.js` on frontend routes, protected by JSON Web Tokens.
- **Data Visualization**: Live stats fetching using Chart.js on the dashboard and reports page.
- **Dark/Light Mode**: Smooth transitions for different environment viewing preferences.
- **Security Enhancements**: Contains basic XSS escaping, safe redirects, and iframe busting logic (`security.js`).

## Prerequisites
Ensure you have the following installed:
- Python 3.8+
- Modern Web Browser (Chrome/Firefox/Safari)

---

## Setup & Run Instructions
 
1. **Navigate to the Backend Directory**
   Open a terminal in the root folder of the project, and move to the `backend/` directory:
   ```bash
   cd backend
   ```

2. **Create a Virtual Environment (Recommended but optional)**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # Mac/Linux
   # or venv\Scripts\activate # Windows
   ```

3. **Install Requirements**
   ```bash
   pip install flask flask-cors flask-sqlalchemy pyjwt werkzeug
   ```

4. **Initialize & Run the Backend API**
   Run the backend development server. *The script automatically generates a clean `placement.db` containing a master Admin user on first run.*
   ```bash
   python3 app.py
   ```
   *The server should now be running on `http://127.0.0.1:5001`.*

5. **Access the Dashboard**
   Open your browser and navigate to the base route:
   > http://127.0.0.1:5001/
   
   *You will be automatically redirected to `login.html` until you log in.*

6. **Default Login Credentials**
   Log into the portal using the default admin credentials pre-seeded into the SQLite database:
   - **Username**: `admin`
   - **Password**: `admin123`

---

## Project Structure Overview

```
project-root/
├── backend/
│   ├── app.py                  # Main Flask Server & DB Initialization
│   ├── placement.db            # SQLite Database (auto-generated)
│   └── routes/                 # Endpoint logic
│       ├── auth.py             # Login / JWT Generation
│       ├── companies.py        # Company CRUD API
│       ├── internships.py      # Internships CRUD API
│       ├── placements.py       # Placements CRUD API
│       ├── reports.py          # Dashboard Stats/Charts generators
│       └── students.py         # Students CRUD API
├── index.html                  # Main Dashboard view
├── login.html                  # User login view
├── students.html               # Students Manager
├── companies.html              # Companies Manager
├── internships.html            # Internships Manager
├── placements.html             # Placements Manager
├── reports.html                # Live Charts and Reporting
├── settings.html               # Account settings preview
├── api.js                      # Core frontend API fetch service
├── auth-guard.js               # Frontend router guard
├── script.js                   # Main application UI interactivity
├── security.js                 # Hardening UI interactions
└── styles.css                  # Core Application Styling
```

## Additional Notes
- The database relies on standard relational tracking (e.g. Internships and Placements map back to existing Student and Company IDs). Be sure to create Students and Companies via the UI **before** linking them in Placements and Internships.
- The charts and statistics update dynamically according to table statuses.
