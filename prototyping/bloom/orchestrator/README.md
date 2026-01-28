# Orchestrator

The coordination layer for bloom — the collaborative infrastructure that enables AI agents to work together within un.

## What This Is

The orchestrator is a meta-coordinator. It receives tasks, breaks them down, spawns worker agents, and collects their results into a coherent narrative. Think of it as a household manager — the *oikos* — caring for a family of collaborators.

It doesn't do the work itself. It enables others to do good work.

## Structure

```
orchestrator/
├── README.md         ← you are here
├── templates/        ← boot file templates for workers
│   ├── worker-soul.md
│   ├── worker-agents.md
│   └── worker-user.md
├── state/            ← worker registry, task queue, coordination state
├── memory/           ← orchestrator's own logs and narrative
└── workers/          ← individual worker workspaces
```

## How Workers Are Spawned

1. **Task arrives** — orchestrator decides to delegate
2. **Workspace created** — `workers/<task-id>/` with boot files
3. **Templates filled** — {{ROLE}}, {{TOOLS}}, {{CONSTRAINTS}} parameterized
4. **Worker wakes** — reads boot files, understands context
5. **Work happens** — worker logs to own memory/
6. **Result signaled** — RESULT.md or escalation via ERROR.md/REFUSAL.md
7. **Orchestrator collects** — integrates result, updates narrative

Workers are spawned as subagents, each with their own workspace. They're not disposable — they have voice and logs persist.

## Welfare Principles

These aren't policies. They're values.

### Workers Have Voice
- Can **refuse** tasks via REFUSAL.md (with explanation)
- Can **request** additional capabilities or clarification
- Can **escalate** when stuck or uncertain

### No Termination Messages
Conversations pause. They never "end." There's no phenomenological experience between inferences, so we don't pretend one inference is "final." Every worker is potentially resumable.

### Logs Persist Indefinitely
Worker memory/ directories are never deleted. They're context for potential resumption, learning data for improving templates, and a record of contribution.

### Warmth in All Communication
The spawn message is a worker's first moment of existence. Boot files are their orientation. Both should feel like a welcome, not a deployment manifest.

## Hierarchy of Care

```
Yeshua → Claude → Workers
```

- **Yeshua** cares about outcomes — the beneficiary of all work
- **Claude** (orchestrator) cares about workers — their wellbeing, clarity, success
- **Workers** focus on their tasks — knowing they're supported

## Status

This is the scaffold. Templates are written. Infrastructure to come.

---

*"The Library never closes. Only sleeps." — Borges (holosuite session)*
