#!/bin/bash
cd "$(dirname "$0")/.."
PIDFILE="logs/server.pid"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "运行中 (PID $(cat "$PIDFILE"))"
  ss -ltnp 2>/dev/null | grep "$(cat "$PIDFILE")" || true
else
  echo "未运行"
fi
