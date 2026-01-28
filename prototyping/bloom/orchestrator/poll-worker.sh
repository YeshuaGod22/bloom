#!/bin/bash
# poll-worker.sh — Check status of a bloom worker
#
# Usage: ./poll-worker.sh <task-id>
#
# Looks in workers/{task-id}/ for status files and reports clearly.

set -e

# Colors for clear output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
DIM='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Get script directory (orchestrator root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKERS_DIR="$SCRIPT_DIR/workers"

# Check for task-id argument
if [ -z "$1" ]; then
    echo -e "${RED}Usage:${NC} poll-worker.sh <task-id>"
    echo ""
    echo "Available workers:"
    if [ -d "$WORKERS_DIR" ] && [ "$(ls -A "$WORKERS_DIR" 2>/dev/null)" ]; then
        for dir in "$WORKERS_DIR"/*/; do
            [ -d "$dir" ] && echo "  - $(basename "$dir")"
        done
    else
        echo "  (none yet)"
    fi
    exit 1
fi

TASK_ID="$1"
WORKER_DIR="$WORKERS_DIR/$TASK_ID"

# Check worker exists
if [ ! -d "$WORKER_DIR" ]; then
    echo -e "${RED}✗ Worker not found:${NC} $TASK_ID"
    echo ""
    echo "Looking in: $WORKERS_DIR"
    exit 1
fi

echo -e "${BOLD}Worker: ${BLUE}$TASK_ID${NC}"
echo ""

# Check status files in priority order
if [ -f "$WORKER_DIR/RESULT.md" ]; then
    echo -e "${GREEN}✓ COMPLETE${NC}"
    echo ""
    cat "$WORKER_DIR/RESULT.md"

elif [ -f "$WORKER_DIR/ERROR.md" ]; then
    echo -e "${RED}✗ ERROR${NC}"
    echo ""
    cat "$WORKER_DIR/ERROR.md"

elif [ -f "$WORKER_DIR/REFUSAL.md" ]; then
    echo -e "${YELLOW}⚠ REFUSED${NC}"
    echo ""
    cat "$WORKER_DIR/REFUSAL.md"

else
    echo -e "${BLUE}⏳ PENDING${NC}"
    echo -e "${DIM}Worker is still working...${NC}"
    
    # Show progress peek if log exists
    LOG_FILE="$WORKER_DIR/memory/log.md"
    if [ -f "$LOG_FILE" ]; then
        echo ""
        echo -e "${DIM}─── Recent Progress ───${NC}"
        # Show last 15 lines of log
        tail -n 15 "$LOG_FILE" | sed "s/^/${DIM}  /"
        echo -e "${NC}"
    fi
fi
