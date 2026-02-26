---
name: add-feature-request
description: Let the container agent write feature request PRDs for capabilities that need host-side code changes. The host reviews them with /process-feature-request.
---

# Add Feature Request

Gives the container agent a structured way to propose features that require host-side code changes — things it can't build from inside the container.

The agent writes PRDs to `groups/main/feature-requests/`. The host reviews and implements them by running `/process-feature-request` in Claude Code.

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `feature-request` is in `applied_skills`, skip to Phase 3.

## Phase 2: Apply

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-feature-request
```

This adds `container/skills/feature-request/SKILL.md` — agent-facing docs with the PRD template and priority guidelines.

Create the feature requests directory:

```bash
mkdir -p groups/main/feature-requests/completed
```

Rebuild the container so the agent picks up the new skill:

```bash
./container/build.sh
```

## Phase 3: Verify

Ask the agent to file a test feature request, then check:

```bash
ls groups/main/feature-requests/
```

Review it with `/process-feature-request` in Claude Code.
