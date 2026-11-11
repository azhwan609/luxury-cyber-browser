#!/bin/bash
set -euo pipefail

BROWSER_DATA_DIR="${BROWSER_DATA_DIR:-/tmp/chromium}"
mkdir -p "$BROWSER_DATA_DIR"
chown -R browser:browser "$BROWSER_DATA_DIR"
Xvfb :99 -screen 0 1280x800x24 -ac +extension RANDR &
sleep 2
x11vnc -display :99 -forever -shared -rfbport 5900 -localhost -nopw -quiet &
websockify --web=/usr/share/novnc 6080 127.0.0.1:5900 &
sleep 1
exec node /app/server.js
