#!/data/data/com.termux/files/usr/bin/bash
# Wrapper for Termux: launches headless Chromium inside the Alpine proot
# container, runs fetch-and-report.js against it, then opens the report
# in Chrome. Kept in plain ASCII to avoid encoding issues.
set -u

cd "$(dirname "$0")"

LOGFILE="report.log"
CHROMIUM_LOG="chromium.log"
CDP_PORT=9222

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOGFILE"
}

cleanup() {
  if [ -n "${CHROMIUM_PID:-}" ]; then
    kill "$CHROMIUM_PID" 2>/dev/null
  fi
  termux-wake-unlock
}
trap cleanup EXIT

termux-wake-lock

log "run started"

proot-distro login alpine -- chromium --headless=new --no-sandbox --disable-gpu --remote-debugging-port=$CDP_PORT --remote-debugging-address=0.0.0.0 > "$CHROMIUM_LOG" 2>&1 &
CHROMIUM_PID=$!

sleep 3

node fetch-and-report.js >> "$LOGFILE" 2>&1
NODE_EXIT=$?

log "run finished with exit code $NODE_EXIT"

if [ -f report.html ]; then
  termux-open report.html
else
  log "report.html not found, nothing to open"
fi

exit $NODE_EXIT
