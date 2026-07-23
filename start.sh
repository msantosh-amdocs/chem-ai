#!/usr/bin/env bash
# Market Research Group — startup script
# Usage:  ./start.sh [--no-open] [--no-install]
#
# Boots the API (port 5278) and web (port 5277) dev servers, waits for both
# to be listening, then opens the app in your default browser.
# Ctrl+C stops both cleanly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

API_PORT="${PORT:-5278}"
WEB_PORT=5277
OPEN_BROWSER=1
DO_INSTALL=1

for arg in "$@"; do
  case "$arg" in
    --no-open)    OPEN_BROWSER=0 ;;
    --no-install) DO_INSTALL=0 ;;
    -h|--help)
      cat <<EOF
Market Research Group startup

Usage:
  ./start.sh [--no-open] [--no-install]

Options:
  --no-open       Don't launch the browser after startup
  --no-install    Skip 'npm install' even when node_modules is missing
  -h, --help      Show this help
EOF
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# ---------- colours ---------------------------------------------------------
if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'
  YLW=$'\033[33m'; BLU=$'\033[34m'; MAG=$'\033[35m'; CYN=$'\033[36m'; R=$'\033[0m'
else
  B=""; DIM=""; RED=""; GRN=""; YLW=""; BLU=""; MAG=""; CYN=""; R=""
fi
say()   { printf "%s\n" "$*"; }
info()  { printf "${CYN}▸${R} %s\n" "$*"; }
ok()    { printf "${GRN}✓${R} %s\n" "$*"; }
warn()  { printf "${YLW}⚠${R} %s\n" "$*"; }
fail()  { printf "${RED}✗${R} %s\n" "$*" >&2; }

banner() {
  printf "\n${B}${MAG}Market Research Group${R} ${DIM}· idea \u2192 refined concept \u2192 Market / Procedure / Procurement / Finance / IP / Presentation${R}\n"
  printf "${DIM}──────────────────────────────────────────────────${R}\n"
}

# ---------- prerequisites ---------------------------------------------------
require_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail "node is not installed. Install Node.js 22+ from https://nodejs.org/"
    exit 1
  fi
  local major
  major=$(node -p "process.versions.node.split('.')[0]")
  if [ "$major" -lt 22 ]; then
    fail "Node $major detected — this app needs Node 22+."
    exit 1
  fi
  ok "Node $(node -v)"
}

require_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    fail "npm is not installed."
    exit 1
  fi
  ok "npm  $(npm -v)"
}

# ---------- .env sanity -----------------------------------------------------
check_env() {
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      cp .env.example .env
      warn "Created .env from .env.example — edit it to add CURSOR_API_KEY."
    else
      warn ".env not found. LLM features will fail without CURSOR_API_KEY."
    fi
    return
  fi
  if ! grep -Eq "^[[:space:]]*CURSOR_API_KEY[[:space:]]*=[[:space:]]*['\"]?[^[:space:]'\"#]+['\"]?[[:space:]]*(#.*)?$" .env; then
    warn "CURSOR_API_KEY not set in .env — LLM features will fail."
    warn "Get a key at https://cursor.com/dashboard/integrations"
  else
    ok  ".env has CURSOR_API_KEY"
  fi
}

# ---------- deps ------------------------------------------------------------
ensure_deps() {
  if [ "$DO_INSTALL" = "0" ]; then
    warn "Skipping npm install (--no-install)"
    return
  fi
  if [ ! -d node_modules ] || [ ! -d server/node_modules ] || [ ! -d web/node_modules ]; then
    info "Installing dependencies (first run — may take a minute)…"
    npm install --silent
    ok "Dependencies installed"
  else
    ok "Dependencies present"
  fi
}

# ---------- port cleanup ----------------------------------------------------
free_port() {
  local p="$1"
  local pids
  pids=$(lsof -ti tcp:"$p" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    warn "Port $p in use by PID(s): $pids — killing"
    kill $pids 2>/dev/null || true
    sleep 1
    pids=$(lsof -ti tcp:"$p" -sTCP:LISTEN 2>/dev/null || true)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  fi
}

# ---------- run -------------------------------------------------------------
main() {
  banner
  require_node
  require_npm
  check_env
  ensure_deps
  free_port "$API_PORT"
  free_port "$WEB_PORT"

  mkdir -p .logs
  local api_log="$SCRIPT_DIR/.logs/server.log"
  local web_log="$SCRIPT_DIR/.logs/web.log"

  info "Starting API on ${B}http://localhost:$API_PORT${R}"
  ( cd server && PORT="$API_PORT" npm run dev >"$api_log" 2>&1 ) &
  SERVER_PID=$!

  info "Starting web on ${B}http://localhost:$WEB_PORT${R}"
  ( cd web && npm run dev >"$web_log" 2>&1 ) &
  WEB_PID=$!

  TAIL1=""
  TAIL2=""

  cleanup() {
    printf "\n"
    info "Stopping Market Research Group…"
    [ -n "$TAIL1" ] && kill "$TAIL1" 2>/dev/null || true
    [ -n "$TAIL2" ] && kill "$TAIL2" 2>/dev/null || true
    for parent in "$SERVER_PID" "$WEB_PID"; do
      [ -z "$parent" ] && continue
      pkill -P "$parent" 2>/dev/null || true
      kill "$parent" 2>/dev/null || true
    done
    for p in "$API_PORT" "$WEB_PORT"; do
      pids=$(lsof -ti tcp:"$p" -sTCP:LISTEN 2>/dev/null || true)
      [ -n "$pids" ] && kill $pids 2>/dev/null || true
    done
    sleep 1
    ok "Stopped."
    exit 0
  }
  trap cleanup INT TERM HUP

  # Wait for both ports (max 30s)
  local waited=0
  while ! nc -z localhost "$API_PORT" 2>/dev/null; do
    sleep 0.5; waited=$((waited+1))
    if [ "$waited" -gt 60 ]; then fail "API did not start in 30s — see .logs/server.log"; tail -30 "$api_log"; cleanup; fi
  done
  ok "API up"
  waited=0
  while ! nc -z localhost "$WEB_PORT" 2>/dev/null; do
    sleep 0.5; waited=$((waited+1))
    if [ "$waited" -gt 60 ]; then fail "Web did not start in 30s — see .logs/web.log"; tail -30 "$web_log"; cleanup; fi
  done
  ok "Web up"

  if [ "$OPEN_BROWSER" = "1" ]; then
    local url="http://localhost:$WEB_PORT"
    case "$(uname -s)" in
      Darwin)  open "$url" >/dev/null 2>&1 || true ;;
      Linux)   xdg-open "$url" >/dev/null 2>&1 || true ;;
      MINGW*|MSYS*|CYGWIN*) start "$url" >/dev/null 2>&1 || true ;;
    esac
  fi

  printf "\n${B}${GRN}Market Research Group is running.${R}\n"
  printf "  ${B}App:${R}  http://localhost:$WEB_PORT\n"
  printf "  ${B}API:${R}  http://localhost:$API_PORT/api/health\n"
  printf "  ${B}Logs:${R} .logs/server.log · .logs/web.log\n"
  printf "  ${DIM}Press Ctrl+C to stop.${R}\n\n"

  local sed_prefix_api sed_prefix_web
  sed_prefix_api="s|^|${BLU}[api]${R} |"
  sed_prefix_web="s|^|${MAG}[web]${R} |"
  ( tail -n 0 -F "$api_log" 2>/dev/null | sed "$sed_prefix_api" ) &
  TAIL1=$!
  ( tail -n 0 -F "$web_log" 2>/dev/null | sed "$sed_prefix_web" ) &
  TAIL2=$!

  while kill -0 "$SERVER_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
    sleep 1
  done
  fail "A dev process exited. Tail of logs:"
  tail -n 20 "$api_log" | sed "$sed_prefix_api" || true
  tail -n 20 "$web_log" | sed "$sed_prefix_web" || true
  cleanup
}

main "$@"
