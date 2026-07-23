#!/usr/bin/env bash
# Market Research Group — stop any running dev servers on the standard ports.
set -euo pipefail

for p in 5277 5278; do
  pids=$(lsof -ti tcp:"$p" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "▸ Killing PID(s) $pids on port $p"
    kill $pids 2>/dev/null || true
    sleep 1
    still=$(lsof -ti tcp:"$p" -sTCP:LISTEN 2>/dev/null || true)
    [ -n "$still" ] && kill -9 $still 2>/dev/null || true
  fi
done
echo "✓ Stopped."
