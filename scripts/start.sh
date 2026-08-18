#!/bin/bash
# Start FolderManager in the background (nohup + disown), tracked by a PID file
# so stop.sh/status.sh/restart.sh know which process is theirs.
set -e
cd "$(dirname "$0")/.."
mkdir -p logs
PIDFILE="logs/server.pid"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "已经在运行 (PID $(cat "$PIDFILE"))"
  exit 0
fi

nohup node server.js >> logs/server.log 2>&1 &
echo $! > "$PIDFILE"
disown

sleep 1
if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "已启动 (PID $(cat "$PIDFILE"))，日志：logs/server.log"
else
  echo "启动失败，查看 logs/server.log"
  rm -f "$PIDFILE"
  exit 1
fi
