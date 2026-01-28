# Bloom 🌸

Bloom is the AI orchestration layer for **un** — a warm hearth for spawning and managing intelligent workers.

## Architecture

```
bloom/
├── core/           # clawdbot engine (forked from moltbot/moltbot)
├── orchestrator/   # worker spawning, templates, task routing
├── ui/             # dashboard for monitoring and control
├── package.json    # unified workspace config
└── README.md
```

### Core (`core/`)

The core is a fork of [moltbot/moltbot](https://github.com/moltbot/moltbot), providing:
- Multi-channel messaging (WhatsApp, Discord, Telegram, Slack, etc.)
- AI gateway with model routing
- Agent framework with tool support
- Browser automation
- TTS and media handling

**Upstream tracking**: The core has an `upstream` remote configured to pull updates from moltbot:

```bash
# Fetch latest from upstream
pnpm upstream:fetch

# Merge upstream changes
pnpm upstream:merge
```

### Orchestrator (`orchestrator/`)

Worker spawning and template management:
- Agent templates (personas, capabilities)
- Task routing and load balancing
- Worker lifecycle management

### UI (`ui/`)

Dashboard for monitoring and control:
- Real-time worker status
- Task queue visualization
- Configuration interface

## Getting Started

### Prerequisites

- Node.js ≥ 22.12.0
- pnpm ≥ 10.23.0
- macOS 12.0+ (for the desktop app)

### Installation

```bash
# Install all dependencies
pnpm install

# Build everything
pnpm build
```

### Desktop App (macOS)

Bloom includes a native macOS app bundle that runs as a menu bar application:

```bash
# Install the app to /Applications
pnpm app:install

# Or manually launch from the dist folder
pnpm app:open
```

**What Bloom.app does when launched:**
1. 🚀 Starts the gateway (core engine) on port 3377
2. 🎨 Starts the UI server on port 3000  
3. 🌐 Opens your browser to http://localhost:3000
4. 📍 Runs in the menu bar (no dock icon)
5. 🔄 Auto-restarts processes if they crash

**Stopping Bloom:**
```bash
pnpm app:stop
```

**Logs are stored in:** `~/.bloom/logs/`

### Development

```bash
# Run the UI dev server
pnpm dev:ui

# Run core gateway
pnpm core:gateway

# Run core TUI
pnpm core:tui
```

## Workspace Commands

| Command | Description |
|---------|-------------|
| `pnpm install:all` | Install all workspace dependencies |
| `pnpm build` | Build all packages |
| `pnpm build:core` | Build core engine only |
| `pnpm build:ui` | Build UI only |
| `pnpm dev` | Run UI development server |
| `pnpm upstream:fetch` | Fetch updates from moltbot upstream |
| `pnpm upstream:merge` | Merge upstream changes into core |
| `pnpm app:install` | Install Bloom.app to /Applications |
| `pnpm app:open` | Launch Bloom.app |
| `pnpm app:stop` | Stop Bloom and all processes |
| `pnpm app:icon` | Regenerate the app icon |

## Updating Core

To pull in fixes and features from the upstream moltbot repository:

```bash
# Option 1: Using workspace scripts
pnpm upstream:merge

# Option 2: Manual
cd core
git fetch upstream
git merge upstream/main
# Resolve any conflicts
cd ..
pnpm install
pnpm build
```

## License

MIT
