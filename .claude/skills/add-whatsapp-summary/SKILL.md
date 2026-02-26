---
name: add-whatsapp-summary
description: Add a 3-stage multi-agent pipeline for daily and weekly WhatsApp group summaries. Discovers active groups, extracts per-group updates, ranks by importance, and sends a consolidated summary.
---

# Add WhatsApp Summary

Gives the container agent a structured pipeline for generating daily and weekly WhatsApp group summaries using parallel sub-agents.

The pipeline runs in 3 stages:
1. **Per-group extraction** (parallel, one agent per group)
2. **Cross-group ranking** and deduplication
3. **Final synthesis** and WhatsApp delivery

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `whatsapp-summary` is in `applied_skills`, skip to Phase 3.

## Phase 2: Apply

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-whatsapp-summary
```

This adds `container/skills/whatsapp-summary/SKILL.md` — agent-facing docs with the full pipeline coordinator instructions, stage prompts, and formatting rules.

Rebuild the container so the agent picks up the new skill:

```bash
./container/build.sh
```

## Phase 3: Verify

Set up a scheduled task for daily summaries (8 PM ET) and/or weekly summaries (Sunday 9 AM ET), or ask the agent to run a summary manually to test.
