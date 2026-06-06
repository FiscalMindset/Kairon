#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT=5001
FRONTEND_PORT=5175
PYTHON="python3.12"
VENV_DIR="$ROOT_DIR/venv"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

usage() {
    echo "Usage: ./run.sh [--prod]"
    echo ""
    echo "  (default)  Dev mode — runs Flask backend + Vite frontend"
    echo "  --prod     Build frontend + serve everything from Flask"
    echo ""
    echo "  Manual (minimal steps):"
    echo "    source venv/bin/activate"
    echo "    PORT=5001 python3 backend/app.py &"
    echo "    npm run dev --prefix frontend"
    exit 0
}

[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && usage
MODE="${1:-dev}"

cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null && echo "Backend stopped"
    echo -e "${GREEN}Done.${NC}"
}
trap cleanup SIGINT SIGTERM

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        Kairon — Run All Services     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"

# ── 1. Prerequisites ───────────────────────────────────────────────
echo -e "${YELLOW}\n[1/6] Prerequisites...${NC}"
command -v "$PYTHON" >/dev/null 2>&1 || { echo -e "${RED}✗ Install python@3.12: brew install python@3.12${NC}"; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}✗ Install Node.js${NC}"; exit 1; }
echo -e "  ✓ $($PYTHON --version)  ✓ $(node --version)"

# ── 2. .env ────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/6] .env...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "  ${RED}✗ Created .env — EDIT IT with your credentials!${NC}"
    exit 1
fi
echo -e "  ✓ .env loaded"

# ── 3. Python venv ─────────────────────────────────────────────────
echo -e "${YELLOW}[3/6] Python venv...${NC}"
if [ ! -d "$VENV_DIR" ]; then $PYTHON -m venv "$VENV_DIR"; echo "  ✓ Created venv"; fi
source "$VENV_DIR/bin/activate"
python -c "import flask" 2>/dev/null || pip install -q -r backend/requirements.txt
echo -e "  ✓ Python packages ready"

# ── 4. Playwright ──────────────────────────────────────────────────
echo -e "${YELLOW}[4/6] Playwright...${NC}"
python -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    p.chromium.launch(headless=True).close()
" 2>/dev/null || python -m playwright install chromium
echo -e "  ✓ Chromium ready"

# ── 5. Frontend deps ───────────────────────────────────────────────
echo -e "${YELLOW}[5/6] Frontend...${NC}"
[ -d frontend/node_modules ] || npm install --prefix frontend --silent

if [ "$MODE" == "--prod" ]; then
    echo -e "  Building frontend..."
    npm run build --prefix frontend --silent
fi
echo -e "  ✓ Frontend ready"

# ── 6. Start ───────────────────────────────────────────────────────
echo -e "${YELLOW}\n[6/6] Starting...${NC}"

kill -9 $(lsof -ti ":$BACKEND_PORT" 2>/dev/null) 2>/dev/null || true
kill -9 $(lsof -ti ":$FRONTEND_PORT" 2>/dev/null) 2>/dev/null || true
sleep 1

BACKEND_LOG="/tmp/kairon-backend.log"
PORT=$BACKEND_PORT nohup $PYTHON "$ROOT_DIR/backend/app.py" > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

for i in $(seq 1 30); do
    if curl -s -o /dev/null "http://localhost:$BACKEND_PORT/api/config" 2>/dev/null; then
        echo -e "  ✓ Backend → http://localhost:$BACKEND_PORT"
        break
    fi
    [ "$i" -eq 30 ] && { echo -e "${RED}✗ Backend timeout (check $BACKEND_LOG)${NC}"; exit 1; }
    sleep 1
done

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Backend : http://localhost:$BACKEND_PORT  ${NC}"
echo -e "${GREEN}  Frontend: http://localhost:$FRONTEND_PORT  ${NC}"
echo -e "${GREEN}  Ctrl+C to stop both                     ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ "$MODE" == "--prod" ]; then
    wait "$BACKEND_PID"
else
    npm run dev --prefix frontend
fi
