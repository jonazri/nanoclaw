# Feature Request Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the main container agent write PRDs for the host to review and implement via a Claude Code slash command.

**Architecture:** Two files — a container skill that teaches the agent to write PRDs to `groups/main/feature-requests/`, and a host slash command that scans that directory and kicks off the brainstorming → planning → implementation pipeline. No host code changes.

**Tech Stack:** Markdown files, Claude Code skills (YAML frontmatter + markdown)

---

### Task 1: Create the feature-requests directory structure

**Files:**
- Create: `groups/main/feature-requests/.gitkeep`
- Create: `groups/main/feature-requests/completed/.gitkeep`

**Step 1: Create directories and gitkeep files**

```bash
mkdir -p groups/main/feature-requests/completed
touch groups/main/feature-requests/.gitkeep
touch groups/main/feature-requests/completed/.gitkeep
```

**Step 2: Move existing feature request to new location**

The existing `groups/main/FEATURE_REQUEST_filesystem_watcher.md` should be moved into the new directory with the correct naming convention.

```bash
mv groups/main/FEATURE_REQUEST_filesystem_watcher.md groups/main/feature-requests/2026-02-24-filesystem-watcher.md
```

Then edit the moved file to add `**Status:** new` to the frontmatter (after the `**Date:**` line).

**Step 3: Commit**

```bash
git add groups/main/feature-requests/ groups/main/FEATURE_REQUEST_filesystem_watcher.md
git commit -m "chore: create feature-requests directory, move existing PRD"
```

---

### Task 2: Create the container skill

**Files:**
- Create: `container/skills/feature-request/SKILL.md`

**Step 1: Write the container skill**

Create `container/skills/feature-request/SKILL.md` with this content:

```markdown
---
name: feature-request
description: Write a feature request PRD for the host to review and implement. Use when you identify a capability gap, receive a user suggestion that requires host-side code changes, or have an idea for improving the system.
---

# Feature Requests

Write structured PRDs (Product Requirement Documents) to propose features for the host to build.

## When to use

- You identify a missing capability that requires host-side code changes
- A user suggests a feature that you can't implement from inside the container
- You notice a recurring workaround that could be solved with a new feature
- You have an idea for improving the system architecture

Do NOT use for:
- Things you can do yourself (writing files, scheduling tasks, sending messages)
- Changes to your own CLAUDE.md or memory files
- Requests that only need container-side skill additions

## How to write a PRD

### 1. Check for duplicates first

Read existing PRDs to avoid duplicates:

```bash
ls /workspace/group/feature-requests/
ls /workspace/group/feature-requests/completed/
```

If a similar request exists, append to its `## Related` section instead of creating a new file.

### 2. Write the PRD

Create a new file at `/workspace/group/feature-requests/YYYY-MM-DD-{slug}.md`:

- Use today's date
- Slug should be lowercase, hyphenated, descriptive (e.g., `filesystem-watcher`, `voice-commands`)

Use this template exactly:

```
# Feature Request: {Title}

**Date:** YYYY-MM-DD
**Status:** new
**Requested by:** {who — user's name or "Andy (self-identified)"}
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

### 3. Notify the user

After writing the PRD, tell the user you've filed a feature request. Example:

> I've filed a feature request for {title}. You can review it by running `/process-feature-request` in Claude Code.

## Checking request status

Read your PRDs to check their status:
- `feature-requests/*.md` — pending or in-progress requests
- `feature-requests/completed/*.md` — implemented requests (check `## Implementation Notes` for details)

## Priority guidelines

| Priority | When to use |
|----------|-------------|
| critical | Blocks core functionality, causes errors or data loss |
| important | Significant UX improvement, frequently requested |
| nice-to-have | Quality-of-life improvement, optimization, nice but not urgent |
```

**Step 2: Verify the skill follows container skill conventions**

Check that the frontmatter matches the pattern in other container skills (name, description fields in YAML).

**Step 3: Commit**

```bash
git add container/skills/feature-request/SKILL.md
git commit -m "feat: add feature-request container skill for agent PRD writing"
```

---

### Task 3: Create the host slash command

**Files:**
- Create: `.claude/skills/process-feature-request/SKILL.md`

**Step 1: Write the host slash command skill**

Create `.claude/skills/process-feature-request/SKILL.md` with this content:

```markdown
---
name: process-feature-request
description: Review and implement feature requests written by the container agent. Scans groups/main/feature-requests/ for new PRDs and walks through brainstorming, planning, and implementation.
---

# Process Feature Requests

Review PRDs written by the container agent and turn them into working implementations.

## Workflow

### 1. Scan for new requests

Read all `.md` files in `groups/main/feature-requests/` (excluding `completed/` and `.gitkeep`). Parse the `**Status:**` field from each file. List only those with `Status: new`.

If an argument was provided (e.g., `/process-feature-request filesystem-watcher`), filter to PRDs matching that slug.

If no new requests exist, tell the user and exit.

### 2. Present the inbox

Show a numbered list of new PRDs:

```
Feature request inbox:
1. [2026-02-24] Filesystem Watcher (nice-to-have) — filesystem-watcher.md
2. [2026-02-25] Voice Commands (important) — voice-commands.md
```

Ask which one to process (or "all" for batch review).

### 3. Review the PRD

Read the selected PRD fully. Present a summary to the user:
- What the agent is requesting
- Why (the problem statement)
- The agent's proposed solution
- Priority level

Ask the user: "How do you want to proceed?"
- **Implement** — proceed with brainstorming and implementation
- **Defer** — leave as `new` for later
- **Reject** — move to `completed/` with status `rejected` and a note
- **Needs refinement** — leave as `new`, note what's unclear (the agent will see the note next time it reads the file)

### 4. Implement (if approved)

Update the PRD's status to `in-review`:

```
**Status:** in-review
```

Then follow this pipeline:

1. **Brainstorm** — Invoke `superpowers:brainstorming` with the PRD as context. Explore the design space, propose approaches, get user approval on a design.

2. **Plan** — The brainstorming skill transitions to `superpowers:writing-plans` for a detailed implementation plan.

3. **Execute** — Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement.

4. **Verify** — Use `superpowers:verification-before-completion` to confirm the implementation works.

5. **Finish** — Use `superpowers:finishing-a-development-branch` for merge/PR decisions.

### 5. Complete the request

After implementation:

1. Append an `## Implementation Notes` section to the PRD:

```markdown
## Implementation Notes

**Implemented:** YYYY-MM-DD
**Branch/commit:** {branch name or commit hash}
**Summary:** {1-2 sentences about what was built}
**Files changed:**
- `path/to/file1.ts` — description
- `path/to/file2.ts` — description
```

2. Update status to `implemented`
3. Move the file to `groups/main/feature-requests/completed/`

```bash
mv groups/main/feature-requests/YYYY-MM-DD-slug.md groups/main/feature-requests/completed/
```

4. Commit the status change.

### 6. Rebuild if needed

If the implementation changed host code:

```bash
npm run build
systemctl --user restart nanoclaw  # Linux
```

If the implementation changed container skills:

```bash
./container/build.sh
```

## Rejection flow

When rejecting a request:

1. Append a `## Rejection Notes` section explaining why
2. Update status to `rejected`
3. Move to `completed/`

The agent can read completed requests and learn from rejections.
```

**Step 2: Verify the skill follows host skill conventions**

Check that the frontmatter matches other `.claude/skills/*/SKILL.md` files (name, description fields).

**Step 3: Commit**

```bash
git add .claude/skills/process-feature-request/SKILL.md
git commit -m "feat: add /process-feature-request slash command for host PRD review"
```

---

### Task 4: Update main agent CLAUDE.md

**Files:**
- Modify: `groups/main/CLAUDE.md`

**Step 1: Add feature request capability to "What You Can Do" section**

After the existing "React to messages" bullet, add:

```markdown
- **File feature requests** using the `feature-request` skill — write PRDs for capabilities that need host-side code changes
```

**Step 2: Add feature requests section**

After the "## Scheduling Tasks" section, add a new section:

```markdown
## Feature Requests

When you identify a capability that requires host-side code changes (things you can't do from inside the container), use the `feature-request` skill to write a PRD.

PRDs are stored in `/workspace/group/feature-requests/`. The host reviews them by running `/process-feature-request` in Claude Code.

Check `feature-requests/completed/` to see what's been implemented or rejected.
```

**Step 3: Commit**

```bash
git add groups/main/CLAUDE.md
git commit -m "docs: add feature request instructions to main agent CLAUDE.md"
```

---

### Task 5: Register the skill in CLAUDE.md skills table

**Files:**
- Modify: `CLAUDE.md` (project root)

**Step 1: Add to Skills table**

In the `## Skills` table in the project root `CLAUDE.md`, add:

```markdown
| `/process-feature-request` | Review and implement PRDs written by the container agent |
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: register /process-feature-request in project skills table"
```

---

### Task 6: Verify end-to-end

**Step 1: Confirm the container skill will be synced**

The container runner syncs skills from `container/skills/` to each group's `.claude/skills/`. Verify `container/skills/feature-request/SKILL.md` exists and will be picked up:

```bash
ls container/skills/feature-request/SKILL.md
```

**Step 2: Confirm the host slash command is discoverable**

```bash
ls .claude/skills/process-feature-request/SKILL.md
```

**Step 3: Confirm the moved PRD is valid**

```bash
cat groups/main/feature-requests/2026-02-24-filesystem-watcher.md | head -10
```

Verify it has the `**Status:** new` field.

**Step 4: Confirm no build errors**

```bash
npm run build
```

The implementation is pure markdown/skill files — no TypeScript changes — so this should pass unchanged.

**Step 5: Final commit (if any fixups needed)**

```bash
git status
```
