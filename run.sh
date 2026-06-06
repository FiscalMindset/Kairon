#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT=5001
FRONTEND_PORT=5173
PYTHON="python3.12"
VENV_DIR="$ROOT_DIR/venv"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

usage() {
    echo -e "${BOLD}Usage:${NC} ./run.sh [--prod]"
    echo ""
    echo "  (default)  Dev mode — Flask backend + Vite frontend on separate ports"
    echo "  --prod     Build frontend + serve everything from Flask (single port)"
    echo ""
    echo -e "${BOLD}Manual (minimal steps, skip ./run.sh):${NC}"
    echo "  source venv/bin/activate"
    echo "  PORT=$BACKEND_PORT python3 backend/app.py &"
    echo "  npm run dev --prefix frontend"
    exit 0
}

[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && usage
MODE="${1:-dev}"

cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null && echo "  Backend stopped (PID $BACKEND_PID)"
    [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null && echo "  Frontend stopped (PID $FRONTEND_PID)"
    echo -e "${GREEN}Done.${NC}"
}
trap cleanup SIGINT SIGTERM

echo ""
echo -e "${CYAN}${BOLD}  ╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}  ║       Kairon — Run All Services      ║${NC}"
echo -e "${CYAN}${BOLD}  ╚══════════════════════════════════════╝${NC}"
echo ""

# ── Utils ──────────────────────────────────────────────────────────
step()   { echo -e "  ${YELLOW}➜${NC} $1"; }
ok()     { echo -e "  ${GREEN}✔${NC}  $1"; }
fail()   { echo -e "  ${RED}✘${NC}  $1"; }
info()   { echo -e "  ${CYAN}ℹ${NC}  $1"; }

free_port() {
    local port=$1 label=$2
    for try in 1 2 3; do
        local pids
        pids=$(lsof -ti ":$port" 2>/dev/null) || true
        if [ -z "$pids" ]; then
            [ "$try" -gt 1 ] && ok "Port $port ($label) freed"
            return 0
        fi
        local names
        names=$(ps -o comm= -p $pids 2>/dev/null | tr '\n' ' ' | sed 's/ *$//')
        info "Port $port ($label) held by PID $pids ($names) — killing..."
        kill -9 $pids 2>/dev/null || true
        sleep 1
    done
    pids=$(lsof -ti ":$port" 2>/dev/null) || true
    if [ -n "$pids" ]; then
        fail "Port $port ($label) still in use by PID $pids — can't free it"
        return 1
    fi
    ok "Port $port ($label) freed"
}

# ── 1. Prerequisites ───────────────────────────────────────────────
step "Checking prerequisites..."
command -v "$PYTHON" >/dev/null 2>&1 || { fail "Install python@3.12: brew install python@3.12"; exit 1; }
command -v node     >/dev/null 2>&1 || { fail "Install Node.js"; exit 1; }
ok "$($PYTHON --version)  |  $(node --version)"

# ── 2. .env ────────────────────────────────────────────────────────
step "Checking .env..."
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo ""
        fail ".env created from .env.example"
        info "${BOLD}You must edit .env with your credentials before running!${NC}"
        echo ""
        echo "  $ROOT_DIR/.env"
        echo ""
        exit 1
    else
        fail "No .env or .env.example found"
        exit 1
    fi
fi
ok ".env loaded"

# ── 3. Python venv + deps ─────────────────────────────────────────
step "Setting up Python virtual environment..."
if [ ! -d "$VENV_DIR" ]; then
    info "Creating venv with $PYTHON..."
    $PYTHON -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
if ! python -c "import flask" 2>/dev/null; then
    info "Installing Python dependencies..."
    pip install -q -r backend/requirements.txt
fi
ok "Python packages ready"

# ── 4. Playwright ──────────────────────────────────────────────────
step "Checking Playwright browsers..."
python -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    p.chromium.launch(headless=True).close()
" 2>/dev/null || {
    info "Installing Chromium (first run takes a minute)..."
    python -m playwright install chromium
}
ok "Chromium ready"

# ── 5. Frontend dependencies ───────────────────────────────────────
step "Checking frontend dependencies..."
[ -d frontend/node_modules ] || npm install --prefix frontend --silent
if [ "$MODE" == "--prod" ]; then
    info "Building frontend for production..."
    npm run build --prefix frontend --silent
    ok "Frontend built"
else
    ok "Frontend dependencies ready"
fi

# ── 6. Free ports ──────────────────────────────────────────────────
step "Freeing required ports..."
free_port $BACKEND_PORT "backend"
free_port $FRONTEND_PORT "frontend"
sleep 1

# ── 7. Start backend ───────────────────────────────────────────────
step "Starting backend..."
BACKEND_LOG="/tmp/kairon-backend.log"
PORT=$BACKEND_PORT nohup $PYTHON "$ROOT_DIR/backend/app.py" > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

info "Waiting for backend (up to 30s)..."
for i in $(seq 1 30); do
    if curl -s -o /dev/null "http://localhost:$BACKEND_PORT/api/config" 2>/dev/null; then
        ok "Backend ready → http://localhost:$BACKEND_PORT"
        break
    fi
    if [ "$i" -eq 30 ]; then
        fail "Backend failed to start in 30s"
        info "Check logs: tail -50 $BACKEND_LOG"
        exit 1
    fi
    sleep 1
done

# ── 8. Start frontend ──────────────────────────────────────────────
echo ""
echo -e "  ${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}${BOLD}  Backend : http://localhost:$BACKEND_PORT  ${NC}"
echo -e "  ${GREEN}${BOLD}  Frontend: http://localhost:$FRONTEND_PORT  ${NC}"
echo -e "  ${GREEN}${BOLD}  Ctrl+C to stop both                     ${NC}"
echo -e "  ${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ "$MODE" == "--prod" ]; then
    wait "$BACKEND_PID"
else
    npm run dev --prefix frontend &
    FRONTEND_PID=$!
    wait
fi
