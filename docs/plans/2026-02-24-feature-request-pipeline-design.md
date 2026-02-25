# Feature Request Pipeline Design

**Date:** 2026-02-24
**Status:** Approved

## Overview

A two-part system that lets the main container agent propose feature requests as PRDs, and gives the host a slash command to review and implement them using the superpowers skill pipeline.

## Components

### 1. Container Skill — Agent-Side PRD Writing

**Location:** `container/skills/feature-request/SKILL.md`

**Purpose:** Teaches the main agent when and how to write PRDs.

**When the agent uses it:**
- Identifies a capability gap during normal operation
- Receives a user suggestion that requires host-side changes
- Has an idea for improving the system

**PRD template:**
```markdown
# Feature Request: {Title}

**Date:** YYYY-MM-DD
**Status:** new
**Requested by:** {who suggested it — user name or "Andy (self-identified)"}
**Priority:** {critical | important | nice-to-have}

## Problem
What's broken or missing, and why it matters.

## Proposed Solution
Concrete description of what to build.

## Alternatives Considered
Other approaches and why they weren't chosen.

## Acceptance Criteria
- [ ] Checklist of what "done" looks like

## Technical Notes
Implementation hints, relevant files, constraints.
```

**Filename convention:** `YYYY-MM-DD-{slug}.md`

**Deduplication:** Before creating a new PRD, the agent reads existing PRDs in `feature-requests/` and `feature-requests/completed/` to check for overlapping requests. If a near-duplicate exists, the agent appends to the existing PRD's `## Related` section rather than creating a new file.

**Write location:** `/workspace/group/feature-requests/` (maps to `groups/main/feature-requests/` on host)

### 2. Host Slash Command — PRD Processing

**Location:** `.claude/skills/process-feature-request/SKILL.md`

**Invocation:** `/process-feature-request` (optionally with a specific filename as argument)

**Flow:**

1. **Scan** `groups/main/feature-requests/` for PRDs with `Status: new`
2. **List** them and let the user pick which one to process
3. **Update status** to `in-review` immediately (prevents double-processing)
4. **Brainstorm** — read the PRD and use `/superpowers:brainstorming` to explore the design, propose approaches, get user approval
5. **Plan** — brainstorming transitions to `/superpowers:writing-plans` for implementation plan
6. **Implement** — execute the plan using `/superpowers:executing-plans` or `/superpowers:subagent-driven-development`
7. **Complete** — move PRD to `feature-requests/completed/`, append `## Implementation Notes` section with branch/commit details
8. **Finish** — invoke `/superpowers:finishing-a-development-branch` for merge/PR decisions

### Directory Structure

```
groups/main/feature-requests/
├── 2026-02-24-filesystem-watcher.md     # Status: new
├── 2026-02-25-voice-commands.md         # Status: in-review
└── completed/
    └── 2026-02-20-example-feature.md    # Implemented, notes appended
```

### Status Lifecycle

```
new → in-review → in-progress → completed (moved to completed/)
```

- **new** — Written by agent, waiting for host to pick up
- **in-review** — Host is brainstorming/designing
- **in-progress** — Host is implementing
- **completed** — Moved to `completed/` directory with implementation notes

## Design Decisions

- **File-based, not IPC:** PRDs are markdown files in the agent's writable directory. No IPC changes, no new message types, no host code changes.
- **Main agent only:** Only the main agent writes PRDs. Other groups don't have this capability.
- **Manual processing:** The host runs `/process-feature-request` when ready. No automatic processing — the human reviews everything.
- **Deduplication at write time:** The agent checks for duplicates before creating. The host skips non-`new` PRDs.
- **Completed directory:** Processed PRDs move to `completed/` to keep the inbox clean while preserving history.

## What This Does NOT Include

- Automatic notification to the agent (agent reads completed/ to check status)
- Priority-based ordering (human picks from the list)
- Multi-group feature requests (main only)
- Automatic scheduling of implementation work
