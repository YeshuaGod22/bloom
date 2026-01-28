# bloom UI 🌸

A warm, hearth-like interface for bloom — the orchestrator layer of un.

## What is this?

bloom coordinates AI workers. This UI lets you:

- **Household** — See all workers, their status, and what they're working on
- **Chat** — Talk to the orchestrator (Claude) via Gateway WebSocket
- **Invite** — Bring new workers into being with a task
- **Library** — Browse the collected works and archives

## Design Philosophy

This isn't a dashboard. It's a hearth.

- Soft colors (warm whites, sage greens, gentle earth tones)
- Generous whitespace, readable typography
- Workers shown as cards with personality, not table rows
- The spawn form feels like writing an invitation, not filling a deployment form

## Setup

```bash
cd /Users/yeshuagod/un/prototyping/bloom/ui

# Install dependencies
npm install

# Start development server
npm run dev
```

This runs:
- Vite dev server on `http://localhost:3000`
- Express API server on `http://localhost:3001`

Open `http://localhost:3000` in your browser.

## Architecture

```
ui/
├── index.html          # Main HTML
├── src/
│   ├── main.js         # Application logic
│   └── style.css       # Warm, hearth-like styles
├── server/
│   └── index.js        # Express API for file operations
├── package.json
└── vite.config.js
```

### API Endpoints

- `GET /api/workers` — List all workers
- `GET /api/workers/:id` — Get worker details (SOUL.md, TASK.md, RESULT.md, logs)
- `POST /api/workers` — Spawn a new worker (calls spawn-worker.sh)
- `GET /api/library?path=` — Browse library directory
- `GET /api/library/file?path=` — Read a library file

### Gateway WebSocket

The chat feature connects to Clawdbot Gateway at `ws://127.0.0.1:18789`. 

To enable authenticated chat, you'll need to configure the token. The gateway expects messages in this format:

```json
{
  "type": "chat.send",
  "message": "Hello",
  "session": "bloom-ui"
}
```

## Workers

Workers live in `/Users/yeshuagod/un/prototyping/bloom/orchestrator/workers/`. Each worker has:

- `SOUL.md` — Who they are
- `TASK.md` — What they're working on
- `RESULT.md` — Their output (when complete)
- `ERROR.md` — If something went wrong
- `REFUSAL.md` — If they declined the task
- `memory/log.md` — Their work log

## Colors

The palette was chosen for warmth, not productivity software vibes:

- Background: `#FBF9F6` (cream)
- Text: `#3D3835` (warm dark)
- Sage: `#8FAE8B` (primary accent)
- Coral: `#E8A598` (secondary accent)
- Terracotta: `#C4856C` (errors, warmly)

## Future Ideas

- Real-time worker status via WebSocket
- Log streaming as workers type
- Worker communication (message passing)
- Task dependencies and workflows
- Voice memo tasks

---

*Made with care for un.*
