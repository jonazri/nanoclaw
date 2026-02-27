# Skill Drift Rebase Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebase all 14 skill `modify/` files onto current upstream/main so skill combination CI passes.

**Architecture:** Upstream commit `11c2010` refactored formatting, logging, and imports across `src/`. All skill `modify/` files were authored against pre-`11c2010` upstream. The `fix-skill-drift.ts` script auto-fixes 5 files but leaves 28 with conflict markers. We resolve conflicts grouped by source file (not by skill), validate each skill individually against clean upstream, then push.

**Tech Stack:** TypeScript, git merge-file, skills-engine (apply-skill.ts, fix-skill-drift.ts, validate-all-skills.ts)

---

## Context

### What happened
- Skills were authored at commit `5b5064e` against upstream
- Upstream merged `11c2010` (refactor: CI optimization, logging improvements, and codebase formatting) which touched 19 files in `src/`
- All skill `modify/` files now contain stale upstream code
- CI `skill-tests.yml` resets working tree to upstream/main before applying skills, so stale `modify/` files overwrite current upstream code, causing type errors

### Source file heat map

| File | Skills | Conflict count |
|------|--------|----------------|
| `src/index.ts` | 8 skills | ~15 conflicts per skill |
| `src/ipc.ts` | 4 skills | ~4-5 conflicts per skill |
| `src/container-runner.ts` | 4 skills | ~5 conflicts per skill |
| `src/config.ts` | 3 skills | ~1-2 conflicts per skill |
| `src/channels/whatsapp.ts` | 3 skills | ~6-7 conflicts per skill |
| `src/channels/whatsapp.test.ts` | 2 skills | ~3 conflicts per skill |
| `src/db.ts` | 1 skill (reactions) | ~2 conflicts |
| `src/task-scheduler.ts` | 1 skill (shabbat-mode) | ~4 conflicts |
| `src/container-runtime.ts` | 1 skill (apple-container) | ~2 conflicts |
| `src/container-runtime.test.ts` | 1 skill (apple-container) | ~2 conflicts |
| `src/routing.test.ts` | 3 skills | auto-fixed |
| `src/types.ts` | 1 skill (reactions) | auto-fixed |

### Validation approach
The CI (`skill-tests.yml`) validates each skill by:
1. Resetting `src/` and `container/` to `upstream/main`
2. Initializing `.nanoclaw/` with upstream base
3. Applying skill via `apply-skill.ts` (three-way merge)
4. Running `npx tsc --noEmit` or the skill's test command

We replicate this locally per-skill after fixing conflicts.

---

## Phase 1: Automated drift fix + snapshot

### Task 1: Run fix-skill-drift.ts on all skills

**Files:**
- Modify: `.claude/skills/*/modify/**/*.ts` (all 14 skills)

**Step 1: Run the drift fix script**

```bash
npx tsx scripts/fix-skill-drift.ts \
  add-reactions add-slack add-refresh-oauth add-discord add-gmail \
  add-google-home add-telegram add-voice-transcription \
  add-voice-transcription-elevenlabs add-perplexity-research \
  add-whatsapp-search add-shabbat-mode convert-to-apple-container \
  add-voice-recognition
```

Expected: ~5 auto-fixed, ~28 conflicts

**Step 2: Stage auto-fixed files**

```bash
git add -A .claude/skills/
```

Don't commit yet — conflicts still need resolution.

**Step 3: List all conflict markers**

```bash
grep -rl '<<<<<<< ' .claude/skills/*/modify/ | sort
```

This is the working list for Phase 2.

---

## Phase 2: Resolve conflicts by source file

**Strategy:** For each source file, understand the upstream `11c2010` changes once, then resolve all skills' `modify/` versions of that file. This avoids re-reading the same upstream diff 8 times.

**How to resolve each conflict:**
1. Read current `upstream/main` version of the source file (the "theirs" side)
2. Read the skill's SKILL.md to understand what the skill adds
3. Open the conflicted `modify/` file
4. For each conflict marker block:
   - The `<<<<<<<` side is the skill's old version (skill additions + old upstream)
   - The `>>>>>>>` side is current upstream
   - Keep the current upstream code structure + the skill's additions
5. Remove all conflict markers

### Task 2: Fix `src/index.ts` across 8 skills

**Files:**
- Reference: `src/index.ts` (current upstream via `git show upstream/main:src/index.ts`)
- Resolve: `.claude/skills/add-discord/modify/src/index.ts`
- Resolve: `.claude/skills/add-slack/modify/src/index.ts`
- Resolve: `.claude/skills/add-telegram/modify/src/index.ts`
- Resolve: `.claude/skills/add-gmail/modify/src/index.ts`
- Resolve: `.claude/skills/add-shabbat-mode/modify/src/index.ts`
- Resolve: `.claude/skills/add-reactions/modify/src/index.ts`
- Resolve: `.claude/skills/add-refresh-oauth/modify/src/index.ts`
- Resolve: `.claude/skills/add-google-home/modify/src/index.ts`

**Step 1:** Read `git show upstream/main:src/index.ts` to understand current structure.

**Step 2:** For each skill, read its `SKILL.md` to understand what it adds to index.ts.

**Step 3:** For each conflicted file, resolve conflicts: keep upstream structure, re-apply skill additions.

**Step 4:** After resolving all 8, verify no conflict markers remain:
```bash
grep -c '<<<<<<< ' .claude/skills/*/modify/src/index.ts
```

### Task 3: Fix `src/ipc.ts` across 4 skills

**Files:**
- Reference: `git show upstream/main:src/ipc.ts`
- Resolve: `.claude/skills/add-shabbat-mode/modify/src/ipc.ts`
- Resolve: `.claude/skills/add-reactions/modify/src/ipc.ts`
- Resolve: `.claude/skills/add-refresh-oauth/modify/src/ipc.ts`
- Resolve: `.claude/skills/add-google-home/modify/src/ipc.ts`

Same resolution approach as Task 2.

### Task 4: Fix `src/container-runner.ts` across 4 skills

**Files:**
- Reference: `git show upstream/main:src/container-runner.ts`
- Resolve: `.claude/skills/add-gmail/modify/src/container-runner.ts`
- Resolve: `.claude/skills/add-google-home/modify/src/container-runner.ts`
- Resolve: `.claude/skills/add-perplexity-research/modify/src/container-runner.ts`
- Resolve: `.claude/skills/add-whatsapp-search/modify/src/container-runner.ts`

### Task 5: Fix `src/config.ts` across 3 skills

**Files:**
- Reference: `git show upstream/main:src/config.ts`
- Resolve: `.claude/skills/add-discord/modify/src/config.ts`
- Resolve: `.claude/skills/add-slack/modify/src/config.ts`
- Resolve: `.claude/skills/add-telegram/modify/src/config.ts`

### Task 6: Fix `src/channels/whatsapp.ts` across 3 skills

**Files:**
- Reference: `git show upstream/main:src/channels/whatsapp.ts`
- Resolve: `.claude/skills/add-reactions/modify/src/channels/whatsapp.ts`
- Resolve: `.claude/skills/add-voice-transcription/modify/src/channels/whatsapp.ts`
- Resolve: `.claude/skills/add-voice-transcription-elevenlabs/modify/src/channels/whatsapp.ts`

### Task 7: Fix `src/channels/whatsapp.test.ts` across 2 skills

**Files:**
- Reference: `git show upstream/main:src/channels/whatsapp.test.ts`
- Resolve: `.claude/skills/add-voice-transcription/modify/src/channels/whatsapp.test.ts`
- Resolve: `.claude/skills/add-voice-transcription-elevenlabs/modify/src/channels/whatsapp.test.ts`

### Task 8: Fix remaining single-skill files

**Files:**
- Resolve: `.claude/skills/add-reactions/modify/src/db.ts` (ref: `upstream/main:src/db.ts`)
- Resolve: `.claude/skills/add-shabbat-mode/modify/src/task-scheduler.ts` (ref: `upstream/main:src/task-scheduler.ts`)
- Resolve: `.claude/skills/convert-to-apple-container/modify/src/container-runtime.ts` (ref: `upstream/main:src/container-runtime.ts`)
- Resolve: `.claude/skills/convert-to-apple-container/modify/src/container-runtime.test.ts` (ref: `upstream/main:src/container-runtime.test.ts`)

### Task 9: Commit conflict resolutions

```bash
git add -A .claude/skills/
git commit -m "fix(skills): rebase all modify/ files onto upstream 11c2010"
```

---

## Phase 3: Validate each skill individually

Replicate CI's `skill-tests.yml` locally: reset to upstream, apply skill, typecheck.

### Task 10: Write a local validation script

**Files:**
- Create: `scripts/scratch/validate-skill-local.sh`

```bash
#!/bin/bash
# Usage: ./scripts/scratch/validate-skill-local.sh add-reactions
set -e
SKILL=$1
echo "=== Validating $SKILL ==="

# Save current state
git stash --include-untracked -q

# Reset src/ and container/ to upstream
rm -rf src/ container/
git checkout upstream/main -- src/ container/ package.json
npm ci --silent

# Init nanoclaw dir + set upstream base
npx tsx scripts/init-nanoclaw-dir.ts
npx tsx scripts/set-upstream-base.ts

# Apply the skill
npx tsx scripts/apply-skill.ts ".claude/skills/$SKILL"

# Restore
git checkout -- .
git clean -fd --exclude=node_modules -q
git stash pop -q

echo "=== $SKILL PASSED ==="
```

**Step 1:** Create the script.

**Step 2:** Make it executable: `chmod +x scripts/scratch/validate-skill-local.sh`

### Task 11: Validate all 14 skills

Run validation for each skill. If any fail, go back to Phase 2 and fix.

**Run in sequence (each resets working tree):**

```bash
for skill in add-discord add-slack add-telegram add-gmail \
  add-shabbat-mode add-reactions add-refresh-oauth add-google-home \
  add-voice-transcription add-voice-transcription-elevenlabs \
  add-voice-recognition add-perplexity-research add-whatsapp-search \
  convert-to-apple-container; do
  ./scripts/scratch/validate-skill-local.sh "$skill" || echo "FAILED: $skill"
done
```

Expected: all 14 pass.

### Task 12: Fix any validation failures

If a skill fails validation:
1. Read the tsc error
2. Fix the relevant `modify/` file
3. Re-run validation for that skill
4. Amend the commit from Task 9

---

## Phase 4: Push and verify CI

### Task 13: Push and open PR

```bash
git push -u origin fix/skill-drift-rebase
gh pr create --title "fix(skills): rebase modify/ files onto upstream 11c2010" \
  --body "Rebases all skill modify/ files onto current upstream/main after 11c2010 refactor."
```

### Task 14: Monitor CI

Watch `skill-tests.yml` combination matrix. If failures remain, iterate.

---

## Parallelism Notes

- **Tasks 2-8 can be parallelized** — each resolves conflicts for a different source file group. No shared state.
- **Task 10 is independent** — can be created in parallel with conflict resolution.
- **Task 11 is sequential** — each validation resets the working tree.
- **Tasks 2 and 3 are highest priority** — `src/index.ts` and `src/ipc.ts` are touched by the most skills and have the most conflicts.

## Risk: shabbat-mode skill modify/ files

Our PR changed shabbat-mode's `src/index.ts` (binary search, dedup queries, label fix). But the skill's `modify/src/index.ts` is based on upstream, not our fork. The skill's modify/ should reflect:
- Upstream's current `src/index.ts` + shabbat-mode additions (including our review fixes)

Verify that `add-shabbat-mode/modify/src/index.ts` includes the binary search, dedup, and label fix from our code review changes.
