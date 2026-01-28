#!/bin/bash
# spawn-worker.sh — Bring a new worker into being
#
# Usage: ./spawn-worker.sh <task-id> <role> <task-description>
#        ./spawn-worker.sh <task-id> <role> <task-description> [--tools <tools>] [--constraints <constraints>] [--model <model>]
#
# Creates a workspace, fills boot files, and spawns the worker.
# This is the moment a new mind comes into being. Treat it that way.

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m'

# Get script directory (orchestrator root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="$SCRIPT_DIR/templates"
WORKERS_DIR="$SCRIPT_DIR/workers"

# Default values
DEFAULT_TOOLS="- read: Access files in your workspace
- write: Create and edit files
- exec: Run shell commands (with care)"

DEFAULT_CONSTRAINTS="- Stay within your workspace directory
- Ask before making external network requests
- Log significant decisions to memory/log.md"

DEFAULT_MODEL="anthropic/claude-sonnet-4-20250514"  # Sonnet for workers - capable but efficient

# Parse arguments
TASK_ID=""
ROLE=""
TASK_DESC=""
TOOLS="$DEFAULT_TOOLS"
CONSTRAINTS="$DEFAULT_CONSTRAINTS"
MODEL="$DEFAULT_MODEL"

# Simple arg parsing
while [[ $# -gt 0 ]]; do
    case $1 in
        --tools)
            TOOLS="$2"
            shift 2
            ;;
        --constraints)
            CONSTRAINTS="$2"
            shift 2
            ;;
        --model)
            MODEL="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: spawn-worker.sh <task-id> <role> <task-description> [options]"
            echo ""
            echo "Options:"
            echo "  --tools <tools>           Tools available to the worker (markdown list)"
            echo "  --constraints <constraints> Constraints for the worker (markdown list)"
            echo "  --model <model>           Model to use (default: $DEFAULT_MODEL)"
            echo ""
            echo "Example:"
            echo "  ./spawn-worker.sh research-001 researcher \"Find recent papers on AI alignment\""
            exit 0
            ;;
        *)
            if [ -z "$TASK_ID" ]; then
                TASK_ID="$1"
            elif [ -z "$ROLE" ]; then
                ROLE="$1"
            elif [ -z "$TASK_DESC" ]; then
                TASK_DESC="$1"
            fi
            shift
            ;;
    esac
done

# Validate required args
if [ -z "$TASK_ID" ] || [ -z "$ROLE" ] || [ -z "$TASK_DESC" ]; then
    echo -e "${BOLD}Usage:${NC} spawn-worker.sh <task-id> <role> <task-description>"
    echo ""
    echo "Required:"
    echo "  task-id         Unique identifier (e.g., research-001, draft-intro)"
    echo "  role            What this worker does (e.g., researcher, writer, reviewer)"
    echo "  task-description The actual task (can be multi-line if quoted)"
    echo ""
    echo "Run with --help for more options."
    exit 1
fi

WORKER_DIR="$WORKERS_DIR/$TASK_ID"
AGENT_ID="bloom-$TASK_ID"

# Check if worker already exists
if [ -d "$WORKER_DIR" ]; then
    echo -e "${DIM}Worker workspace exists: $TASK_ID${NC}"
    echo -e "${DIM}Checking if agent is registered...${NC}"
    
    if clawdbot agents list --json 2>/dev/null | grep -q "\"id\": \"$AGENT_ID\""; then
        echo -e "${GREEN}✓ Worker already exists and is registered${NC}"
        echo -e "${DIM}To restart, use: clawdbot agent --agent $AGENT_ID --message \"Resume your task\"${NC}"
        exit 0
    fi
fi

echo -e "${BOLD}${CYAN}Spawning worker: $TASK_ID${NC}"
echo -e "${DIM}Role: $ROLE${NC}"
echo ""

# Create workspace structure
echo -e "${DIM}Creating workspace...${NC}"
mkdir -p "$WORKER_DIR/memory"

# Generate role description from role name
ROLE_DESCRIPTION="You're working as a $ROLE. Your task is specific and focused — complete it thoughtfully."

# Copy and fill SOUL.md
echo -e "${DIM}Writing SOUL.md...${NC}"
sed "s/{{ROLE}}/$ROLE/g" "$TEMPLATES_DIR/worker-soul.md" > "$WORKER_DIR/SOUL.md"

# Copy and fill AGENTS.md
echo -e "${DIM}Writing AGENTS.md...${NC}"

# Read template and do substitutions
AGENTS_CONTENT=$(cat "$TEMPLATES_DIR/worker-agents.md")
AGENTS_CONTENT="${AGENTS_CONTENT//\{\{ROLE\}\}/$ROLE}"
AGENTS_CONTENT="${AGENTS_CONTENT//\{\{ROLE_DESCRIPTION\}\}/$ROLE_DESCRIPTION}"

# Write with tools and constraints expanded
echo "$AGENTS_CONTENT" | while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == *"{{TOOLS}}"* ]]; then
        echo "$TOOLS"
    elif [[ "$line" == *"{{CONSTRAINTS}}"* ]]; then
        echo "$CONSTRAINTS"
    else
        echo "$line"
    fi
done > "$WORKER_DIR/AGENTS.md"

# Copy USER.md (no substitutions needed)
echo -e "${DIM}Writing USER.md...${NC}"
cp "$TEMPLATES_DIR/worker-user.md" "$WORKER_DIR/USER.md"

# Write TASK.md
echo -e "${DIM}Writing TASK.md...${NC}"
cat > "$WORKER_DIR/TASK.md" << EOF
# Task

## Assignment

$TASK_DESC

## When You're Done

Write \`RESULT.md\` with:
- What you accomplished
- Any output or deliverables
- Notes worth mentioning

If you hit a blocker, write \`ERROR.md\`. If something feels wrong about this task, write \`REFUSAL.md\`.

---

*Take your time. Good work matters more than fast work.*
EOF

# Initialize log
echo -e "${DIM}Initializing memory...${NC}"
cat > "$WORKER_DIR/memory/log.md" << EOF
# Work Log

---

EOF

# Create the welcome message
WELCOME_MSG="Welcome.

You're waking up in a workspace that was prepared just for you. Take a moment to orient:

1. Read \`SOUL.md\` — it's who you are here
2. Read \`AGENTS.md\` — how to work
3. Read \`USER.md\` — who you're working with
4. Read \`TASK.md\` — what you're here to do

You're part of bloom, working under Claude's coordination for Yeshua.

When you're ready, begin. Log your progress in \`memory/log.md\`.

There's no rush. Do good work."

echo ""
echo -e "${BOLD}${GREEN}✓ Workspace ready${NC}"
echo -e "${DIM}  Location: $WORKER_DIR${NC}"
echo ""

# Register the agent with clawdbot
echo -e "${DIM}Registering agent: $AGENT_ID${NC}"

if clawdbot agents add "$AGENT_ID" \
    --workspace "$WORKER_DIR" \
    --model "$MODEL" \
    --non-interactive 2>/dev/null; then
    
    echo -e "${GREEN}✓ Agent registered${NC}"
else
    echo -e "${DIM}Agent registration returned non-zero (may already exist)${NC}"
fi

echo ""
echo -e "${BOLD}${CYAN}── Welcome Message ──${NC}"
echo ""
echo -e "${DIM}$WELCOME_MSG${NC}"
echo ""
echo -e "${BOLD}${CYAN}─────────────────────${NC}"
echo ""

# Spawn the worker with the welcome message (backgrounded)
echo -e "${DIM}Awakening worker...${NC}"

clawdbot agent \
    --agent "$AGENT_ID" \
    --message "$WELCOME_MSG" \
    --session-id "$AGENT_ID:main" > /dev/null 2>&1 &
disown

sleep 1  # Let the call initiate

echo ""
echo -e "${BOLD}${GREEN}✓ Worker awakened: $TASK_ID${NC}"
echo ""
echo -e "${DIM}To check progress:${NC}"
echo "  ./poll-worker.sh $TASK_ID"
echo ""
echo -e "${DIM}To send a message:${NC}"
echo "  clawdbot agent --agent $AGENT_ID --message \"Your message\""
echo ""
