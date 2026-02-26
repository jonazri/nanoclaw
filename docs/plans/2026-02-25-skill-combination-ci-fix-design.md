# Fix Skill Combination CI Failures

## Problem

All 16 skill combination CI tests fail. Three root causes:

1. **Merge conflicts (7 combos)** — Skills' `modify/` files were captured from different historical snapshots of `src/index.ts`, not from upstream. Their three-way merges produce conflicts because the deltas are contradictory (each removes features the others add).

2. **Missing `modify/` directory (5 combos)** — `add-reactions` declares 6 modified files in its manifest but has no `modify/` directory. The reaction code exists in the codebase (applied manually) but was never packaged into the skill structure.

3. **Missing dependency (3 combos)** — `add-voice-transcription-elevenlabs` declares a dependency that can't be resolved. Plus one timeout as a downstream consequence.

## Design: Upstream as Baseline

### Core Principle

`.nanoclaw/base/<file>` always reflects the **upstream** version (`qwibitai/nanoclaw:main`). Skills express their changes as additive deltas from upstream only.

### Three-Way Merge Model

For any skill apply:
- `base` = upstream's version (stable, only changes on `/update`)
- `current` = user's working tree (upstream + local customizations + previously applied skills)
- `skill modify` = upstream + that skill's additions only

`git merge-file` sees two independent sets of changes from the shared base:
- current's delta = all local work
- skill's delta = only that skill's additions

As long as skills insert code in non-overlapping regions, merges are clean.

### `/update` Compatibility

The `/update` flow already resets base to upstream (line 240-245 of `update.ts`). This design aligns with the existing lifecycle:

```
Initial:       base = upstream v1
Apply skill A: base stays v1, current = v1 + customs + A
Apply skill B: base stays v1, current = v1 + customs + A + B
/update:       base -> upstream v2, current = merged(old, v1->v2 delta)
```

No changes to `apply.ts` or `update.ts` needed.

## Work Items

### 1. Reset `.nanoclaw/base/` to upstream

Replace all base files with their `upstream/main` versions. Files to reset:
- `src/index.ts`
- `src/config.ts`
- `src/routing.test.ts`
- `src/ipc.ts`
- `src/channels/whatsapp.ts`
- `src/channels/whatsapp.test.ts`
- `src/db.ts`
- `src/types.ts`
- `src/task-scheduler.ts`
- `src/container-runtime.test.ts`
- Any other files under `.nanoclaw/base/`

### 2. Regenerate merge-conflict skills (4 skills)

For each skill, regenerate `modify/` files as upstream + only that skill's additions:

| Skill | Files to regenerate |
|-------|-------------------|
| `add-discord` | `src/index.ts`, `src/config.ts`, `src/routing.test.ts` |
| `add-gmail` | `src/index.ts`, `src/config.ts`, `src/routing.test.ts` |
| `add-telegram` | `src/index.ts`, `src/config.ts`, `src/routing.test.ts` |
| `add-shabbat-mode` | `src/index.ts`, `src/ipc.ts`, `src/task-scheduler.ts` |

Process per skill:
1. Read the skill's `SKILL.md` to understand exactly what it adds
2. Read the current `modify/` file to identify the skill-specific additions
3. Start from `upstream/main` version of the file
4. Add only that skill's changes (imports, setup code, functions)
5. Verify the delta is minimal and additive

### 3. Create `add-reactions/modify/` directory

Populate 6 files based on upstream + reaction additions:
- `src/db.ts` — reaction CRUD functions
- `src/channels/whatsapp.ts` — handle `messages.reaction` events
- `src/types.ts` — Channel interface reaction methods
- `src/ipc.ts` — reaction IPC handler
- `src/index.ts` — wire `sendReaction` dependency
- `container/agent-runner/src/ipc-mcp-stdio.ts` — `react_to_message` tool

Reference: `add-reactions/SKILL.md` has complete code for each addition.

### 4. Fix `add-voice-transcription-elevenlabs` dependency

Check and fix the dependency declaration in its `manifest.yaml`.

### 5. Local verification

For each of the 16 combos:
1. Apply skill A with `npx tsx scripts/apply-skill.ts`
2. Apply skill B
3. Run `npx vitest run --config vitest.skills.config.ts`
4. Reset working tree and repeat for next combo

## Safety

- Work on a new branch off `main`
- Regenerate one skill at a time, verify locally before moving to the next
- The `.nanoclaw/base/` reset is safe because it's gitignored (`data/` and `.nanoclaw/` are gitignored) — wait, verify this
- No changes to `apply.ts` or `update.ts` — purely data fixes
