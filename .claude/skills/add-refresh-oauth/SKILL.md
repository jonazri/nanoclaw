---
name: add-refresh-oauth
description: Let the container agent request OAuth token refreshes via IPC when it encounters mid-session auth errors.
---

# Add Refresh OAuth

Gives the container agent a way to request an OAuth token refresh from the host, so it can recover from expired tokens without restarting.

The host-side IPC handler runs `scripts/oauth/refresh.sh` which checks credentials, refreshes via the Claude CLI if needed, and updates `.env`.

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `refresh-oauth` is in `applied_skills`, skip to Phase 3.

## Phase 2: Apply

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-refresh-oauth
```

This adds:
- `container/skills/refresh-oauth/SKILL.md` — agent-facing docs
- `scripts/oauth/refresh.sh` — token refresh script
- `scripts/oauth/README.md` — documentation

And modifies:
- `src/ipc.ts` — adds `refresh_oauth` IPC case handler

Rebuild the container so the agent picks up the new skill:

```bash
./container/build.sh
```

## Phase 3: Verify

Ask the agent to trigger a test refresh, then check the logs:

```bash
tail -20 logs/oauth-refresh.log
```
