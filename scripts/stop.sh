#!/bin/bash
cd "$(dirname "$0")/.."
PIDFILE="logs/server.pid"

if [ ! -f "$PIDFILE" ] || ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "没有在运行"
  rm -f "$PIDFILE"
  exit 0
fi

kill "$(cat "$PIDFILE")"
rm -f "$PIDFILE"
echo "已停止"
