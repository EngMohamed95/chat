#!/bin/bash
# Keeps the LiveFlow Node server running on shared hosting. Run it from cron
# every minute:
#   * * * * * bash $HOME/www/livechat/start.sh
# It starts the server if it is down, and restarts it when a deploy has
# refreshed tmp/restart.txt since the server started.
# PORT must match the port in .htaccess.
PORT=38471
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$HOME/liveflow-data"
PID_FILE="$DATA_DIR/server.pid"
LOG_FILE="$DATA_DIR/server.log"

[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null
mkdir -p "$DATA_DIR"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  [ "$APP_DIR/tmp/restart.txt" -nt "$PID_FILE" ] || exit 0
  kill "$(cat "$PID_FILE")"
  sleep 2
fi

cd "$APP_DIR" || exit 1
NODE_ENV=production HOST=127.0.0.1 PORT=$PORT DATA_DIR="$DATA_DIR" TRUST_PROXY=1 \
  nohup node server-dist/index.mjs >> "$LOG_FILE" 2>&1 < /dev/null &
echo $! > "$PID_FILE"
