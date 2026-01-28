#!/bin/bash
# Stop Bloom and all its processes

PID_FILE="$HOME/.bloom/bloom.pid"

echo "🛑 Stopping Bloom..."

# Kill main Bloom process if running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "   Killing main process (PID: $PID)..."
        kill "$PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
fi

# Kill any remaining processes on the ports
echo "   Cleaning up port 3377 (gateway)..."
lsof -ti :3377 | xargs kill 2>/dev/null || true

echo "   Cleaning up port 3000 (UI)..."
lsof -ti :3000 | xargs kill 2>/dev/null || true

echo "   Cleaning up port 3001 (UI server)..."
lsof -ti :3001 | xargs kill 2>/dev/null || true

echo "✅ Bloom stopped."
