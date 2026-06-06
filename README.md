# Kairon: NSUT Smart Attendance Assistant

An intelligent attendance analytics platform for NSUT that scrapes the IMS portal, solves CAPTCHAs (manual / OCR / on-device AI vision), and provides a real-time dashboard with trends, predictions, and a conversational AI assistant.

**Built by [vicky kjumar](https://github.com/fiscalmindset)** — [LinkedIn](https://linkedin.com/in/algsoch) — npdimagine@gmail.com

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (User)                     │
│  ┌───────────────────────┐  ┌─────────────────────┐  │
│  │   Vite Dev Server     │  │   Flask Backend      │  │
│  │   (localhost:5173)    │  │   (localhost:5001)    │  │
│  │   React + VLM SDK     │  │   API + Scraper      │  │
│  └──────────┬────────────┘  └──────────┬──────────┘  │
│             │ proxy /api               │              │
│             └──────────────────────────┘              │
│                           │                           │
│                           ▼                           │
│                  ┌──────────────────┐                 │
│                  │   NSUT IMS       │                 │
│                  │   Portal         │                 │
│                  └──────────────────┘                 │
└─────────────────────────────────────────────────────┘
```

- **Development**: Vite dev server (`:5173`) proxies `/api` to Flask (`:5001`)
- **Production**: Flask serves the built React frontend from `frontend/dist/`

---

## Quick Start

### Prerequisites
- Python 3.12+, Node.js 20+
- npx (comes with Node.js)

### 1. Setup

```bash
# Clone
git clone <repo> && cd Kairon

# Python venv
python3.12 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
playwright install chromium

# Node dependencies
cd frontend && npm install && cd ..
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your NSUT credentials
```

### 3. Run (Development)

Terminal 1 — Backend:
```bash
PORT=5001 venv/bin/python backend/app.py
```

Terminal 2 — Frontend (auto-opens at localhost:5173):
```bash
cd frontend && npm run dev
```

### 4. Run (Production)

```bash
cd frontend && npm run build && cd ..
PORT=5001 venv/bin/python backend/app.py
# Open http://localhost:5001
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5001` | Flask server port |
| `FRONTEND_PORT` | `5173` | Vite dev server port |
| `VITE_API_PROXY_TARGET` | `http://localhost:5001` | Backend URL for Vite proxy |
| `API_BASE_URL` | `/api` | Backend URL for production frontend |
| `roll_no` | — | NSUT roll number (prefill) |
| `password` | — | NSUT portal password |
| `stmp_email` | — | SMTP sender email |
| `stmp_password` | — | SMTP app password |
| `CAPTCHA_SOLVER` | — | `auto`, `tesseract`, `2captcha`, `capsolver` |

---

## Features

### Portal Integration
- Smart semester detection — tries ALL year/semester combos from the portal
- CAPTCHA: manual entry, OCR, or on-device AI vision (RunAnywhere Web SDK VLM)
- Cookie reuse — skip CAPTCHA for 72h after first solve
- Headless Chromium via Playwright with stealth anti-detection

### Dashboard
- Interactive filters: subject, semester, date range, status, search
- Cumulative attendance trend chart
- Subject comparison bars with color-coded status (safe/watch/risk)
- Subject table with 75%/65% thresholds, skippable/needed counts
- Date-wise attendance records

### Chat Assistant
- Natural language queries: "HI", "TOTAL", "ABSENT", "PLAN", "RISK", "SAFE", "PROFILE"
- Subject-specific lookup by code
- Attendance plan with prioritised action items

### Notifications
- Email alerts on login success (with password, CAPTCHA details)
- Email alerts on login failure (with CAPTCHA image, OCR attempts, debug info)
- Both sent to configured recipients

### Data Science
- Trend series: cumulative percentage over time
- Consistency scoring
- Trend prediction (next N classes)

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/config` | App config, cached data status |
| POST | `/api/login` | Start login, get CAPTCHA |
| POST | `/api/captcha` | Submit CAPTCHA, scrape attendance |
| POST | `/api/captcha/refresh` | Refresh CAPTCHA image |
| POST | `/api/check_cache` | Load cached attendance |
| POST | `/api/chat` | Chat with assistant |
| POST | `/api/analysis` | Raw attendance JSON |
| POST | `/api/cookies/status` | Check saved cookie validity |
| POST | `/api/cookies/clear` | Clear saved cookies |

### Coral Endpoints (machine-readable data)

| Method | Path | Description |
|---|---|---|
| GET | `/api/coral/health` | Server health + session count |
| GET | `/api/coral/sessions` | All active sessions with full metadata |
| GET | `/api/coral/attendance_subjects` | Subject-wise attendance rows |
| GET | `/api/coral/attendance_days` | Day-wise attendance records |
| GET | `/api/coral/session_summary` | Aggregated per-session summary |
| GET | `/api/coral/student_profile` | Student profile from portal |
| GET | `/api/coral/synced_filters` | Year/semester filters attempted |
| GET | `/api/coral/portal_surfaces` | Portal data surfaces discovered |
| GET | `/api/coral/portal_links` | Links found on portal pages |
| GET | `/api/coral/status_legend` | Attendance status code legend |
| GET | `/api/coral/attendance_marks` | Special marks per event |

---

## Project Structure

```
Kairon/
├── .env                        # Environment config (gitignored)
├── README.md
├── backend/
│   ├── app.py                  # Flask API + production frontend serving
│   ├── scraper.py              # Playwright scraper, CAPTCHA, attendance parsing
│   ├── chatbot.py              # Chatbot Q&A engine
│   ├── email_notifier.py       # SMTP success/failure notifications
│   ├── playwright_manager.py   # Playwright lifecycle
│   ├── logging_config.py       # Structured logging
│   ├── cookie_store.py         # Session cookie persistence
│   ├── captcha_solver.py       # OCR + external CAPTCHA solvers
│   ├── stealth.py              # Anti-detection browser patches
│   └── data/                   # Cached attendance JSON
├── frontend/
│   ├── package.json
│   ├── vite.config.js          # Vite config with COOP/COEP, API proxy
│   ├── index.html              # Entry HTML
│   ├── css/main.css            # All styles
│   └── src/
│       ├── main.jsx            # React entry
│       ├── App.jsx             # Root component
│       ├── components/
│       │   ├── LoginView.jsx   # Login form + CAPTCHA + AI Solve
│       │   ├── ChatView.jsx    # Chat interface + dashboard
│       │   ├── Dashboard.jsx   # Filters, charts, tables
│       │   └── Promotion.jsx   # Footer with social links
│       └── services/
│           ├── api.js          # API client
│           └── vlmSolver.js    # RunAnywhere VLM CAPTCHA solver
└── venv/                       # Python venv (gitignored)
```

---

---

## Deploy to Render

Kairon is split across **two separate Render services** — a **Web Service** for the Flask API and a **Static Site** for the React frontend.

### Service 1: Backend (Web Service)

| Field | Value |
|---|---|
| **Runtime** | Python 3 |
| **Root Directory** | `backend/` |
| **Build Command** | `pip install -r requirements.txt && python -m playwright install --with-deps chromium` |
| **Start Command** | `gunicorn -w 1 -b 0.0.0.0:$PORT app:app` |
| **Health Check Path** | `/api/coral/health` |

Environment variables:

| Variable | Description |
|---|---|
| `PORT` | Set by Render automatically |
| `roll_no` | NSUT roll number |
| `password` | NSUT portal password |
| `PLAYWRIGHT_BROWSERS_PATH` | `/opt/render/project/.render/playwright` |
| `stmp_email` | SMTP sender email |
| `stmp_password` | SMTP app password |
| `CAPTCHA_SOLVER` | `auto`, `tesseract`, `2captcha`, `capsolver` |

**Playwright on Render**: Use `python -m playwright install --with-deps chromium` in the build step. Set `PLAYWRIGHT_BROWSERS_PATH` so the browser binary path is the same during build and runtime.

**Workers**: Keep `-w 1` — multiple workers each launch their own Playwright browser, exhausting memory on the free tier.

### Service 2: Frontend (Static Site)

| Field | Value |
|---|---|
| **Root Directory** | `frontend/` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |
| **Routes** | `/*` → `index.html` (SPA fallback) |

Environment variable:

| Variable | Description |
|---|---|
| `VITE_API_PROXY_TARGET` | URL of your backend Web Service (e.g. `https://kairon-api.onrender.com`) |

The frontend `VITE_API_PROXY_TARGET` env var is baked into the JS bundle at build time, so set it before building.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Port 5001 in use` | Set `PORT=5002` in `.env` or `lsof -ti:5001 \| xargs kill` |
| `Playwright not found` | `venv/bin/python -m playwright install chromium` |
| `ModuleNotFoundError` | `venv/bin/python -m pip install -r backend/requirements.txt` |
| `Session expired` | Login again — sessions last 5 minutes |
| `Semester shows no data` | Check debug logs in `backend/scrape/<session>/` |
| No Vite proxy | Ensure `VITE_API_PROXY_TARGET` in `.env` matches Flask port |

---

## License

MIT License. See LICENSE file.
