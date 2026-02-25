---
name: process-feature-request
description: Review and implement feature requests written by the container agent. Scans groups/main/feature-requests/ for new PRDs and walks through brainstorming, planning, and implementation.
---

# Process Feature Requests

Review PRDs written by the container agent and turn them into working implementations.

## Workflow

### 1. Scan for new requests

Read all `.md` files in `groups/main/feature-requests/` (excluding `completed/` and `.gitkeep`). Parse the `**Status:**` field from each file.

Show PRDs with `Status: new` as the primary inbox. Also flag any PRDs with `Status: in-review` or `Status: in-progress` as stalled requests that may need attention (these were started but not completed in a previous session).

If an argument was provided (e.g., `/process-feature-request filesystem-watcher`), filter to PRDs matching that slug.

If no new or stalled requests exist, tell the user and exit.

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

3. **Execute** — Update status to `in-progress`, then use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement.

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
