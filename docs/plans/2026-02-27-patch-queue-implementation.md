# Patch Queue Skills Model — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the fork from committed applied state to a patch-queue model where src/ matches upstream and skills are applied at build time.

**Architecture:** Skills are applied sequentially at build time using `replaySkills()` from the existing skills engine. A new `installed-skills.yaml` declares the install order. Build wraps `tsc` with apply→compile→restore. Development uses `npm run dev` which applies once then watches.

**Tech Stack:** TypeScript, skills-engine (replay.ts, apply.ts, init.ts), git merge-file, systemd

---

## Phase 1: Capture uncaptured fork changes into skills

Before flipping to patch-queue, every fork-specific change in src/ must be captured in a skill. The audit found 12 uncaptured items.

### Task 1: Add uncaptured test files to add-reactions skill

The fork has test files that the reactions skill doesn't track.

**Files:**
- Modify: `.claude/skills/add-reactions/manifest.yaml`
- Create: `.claude/skills/add-reactions/add/src/db.test.ts`
- Create: `.claude/skills/add-reactions/modify/src/group-queue.test.ts`
- Create: `.claude/skills/add-reactions/modify/src/ipc-auth.test.ts`

**Step 1: Copy test files into skill**

```bash
cp src/db.test.ts .claude/skills/add-reactions/add/src/db.test.ts
cp src/group-queue.test.ts .claude/skills/add-reactions/modify/src/group-queue.test.ts
cp src/ipc-auth.test.ts .claude/skills/add-reactions/modify/src/ipc-auth.test.ts
```

**Step 2: Update manifest**

Add to the `adds` list:
```yaml
adds:
  - src/db.test.ts
```

Add to the `modifies` list:
```yaml
modifies:
  - src/group-queue.test.ts
  - src/ipc-auth.test.ts
```

**Step 3: Verify**

```bash
npx vitest run src/db.test.ts src/group-queue.test.ts src/ipc-auth.test.ts
```

Expected: all pass.

**Step 4: Commit**

```bash
git add .claude/skills/add-reactions/
git commit -m "fix(skills): capture uncaptured test files in add-reactions"
```

---

### Task 2: Add uncaptured test file to add-shabbat-mode skill

**Files:**
- Modify: `.claude/skills/add-shabbat-mode/manifest.yaml`
- Create: `.claude/skills/add-shabbat-mode/modify/src/task-scheduler.test.ts`

**Step 1: Copy test file**

```bash
cp src/task-scheduler.test.ts .claude/skills/add-shabbat-mode/modify/src/task-scheduler.test.ts
```

**Step 2: Update manifest**

Add `src/task-scheduler.test.ts` to `modifies` list.

**Step 3: Commit**

```bash
git add .claude/skills/add-shabbat-mode/
git commit -m "fix(skills): capture task-scheduler tests in add-shabbat-mode"
```

---

### Task 3: Add OWNER_NAME config to add-voice-recognition skill

OWNER_NAME is used for voice recognition continuous learning but isn't captured in any skill.

**Files:**
- Modify: `.claude/skills/add-voice-recognition/manifest.yaml`
- Create: `.claude/skills/add-voice-recognition/modify/src/config.ts`

**Step 1: Copy config.ts into skill**

```bash
mkdir -p .claude/skills/add-voice-recognition/modify/src
cp src/config.ts .claude/skills/add-voice-recognition/modify/src/config.ts
```

**Step 2: Update manifest**

Add `src/config.ts` to `modifies` list.

**Step 3: Verify OWNER_NAME is in the modify file**

```bash
grep OWNER_NAME .claude/skills/add-voice-recognition/modify/src/config.ts
```

Expected: shows OWNER_NAME export.

**Step 4: Commit**

```bash
git add .claude/skills/add-voice-recognition/
git commit -m "fix(skills): capture OWNER_NAME config in add-voice-recognition"
```

---

### Task 4: Add OAuth scripts to add-refresh-oauth skill

**Files:**
- Modify: `.claude/skills/add-refresh-oauth/manifest.yaml`
- Create: `.claude/skills/add-refresh-oauth/add/scripts/oauth/README.md`
- Create: `.claude/skills/add-refresh-oauth/add/scripts/oauth/refresh.sh`

**Step 1: Copy files**

```bash
mkdir -p .claude/skills/add-refresh-oauth/add/scripts/oauth
cp scripts/oauth/README.md .claude/skills/add-refresh-oauth/add/scripts/oauth/
cp scripts/oauth/refresh.sh .claude/skills/add-refresh-oauth/add/scripts/oauth/
```

**Step 2: Update manifest adds list**

```yaml
adds:
  - scripts/oauth/README.md
  - scripts/oauth/refresh.sh
```

**Step 3: Commit**

```bash
git add .claude/skills/add-refresh-oauth/
git commit -m "fix(skills): capture OAuth scripts in add-refresh-oauth"
```

---

### Task 5: Add enroll-voice script to add-voice-recognition skill

**Files:**
- Modify: `.claude/skills/add-voice-recognition/manifest.yaml`
- Create: `.claude/skills/add-voice-recognition/add/scripts/enroll-voice.ts`

**Step 1: Copy file**

```bash
cp scripts/enroll-voice.ts .claude/skills/add-voice-recognition/add/scripts/enroll-voice.ts
```

**Step 2: Update manifest adds list**

**Step 3: Commit**

```bash
git add .claude/skills/add-voice-recognition/
git commit -m "fix(skills): capture enroll-voice script in add-voice-recognition"
```

---

### Task 6: Add Dockerfile changes to add-google-home skill

The fork's Dockerfile adds `jq`, the google-home CLI, and `/workspace/ipc/responses`. These changes need to be in the google-home skill.

**Files:**
- Create: `.claude/skills/add-google-home/modify/container/Dockerfile`
- Modify: `.claude/skills/add-google-home/manifest.yaml`

**Step 1: Copy current Dockerfile**

```bash
mkdir -p .claude/skills/add-google-home/modify/container
cp container/Dockerfile .claude/skills/add-google-home/modify/container/Dockerfile
```

**Step 2: Update manifest**

Add `container/Dockerfile` to `modifies` list.

**Step 3: Commit**

```bash
git add .claude/skills/add-google-home/
git commit -m "fix(skills): capture Dockerfile changes in add-google-home"
```

---

### Task 7: Add npm dependencies to respective skills

Skills that add npm packages need them in their `structured.npm_dependencies`.

**Step 1: Check which skills need dependency updates**

```bash
git diff upstream/main -- package.json
```

Cross-reference each added dependency with the skill that uses it. Add to the skill's `manifest.yaml` under `structured.npm_dependencies` if missing.

Common ones:
- `@hebcal/core` → `add-shabbat-mode`
- `@elevenlabs/elevenlabs-js` → `add-voice-transcription-elevenlabs`

**Step 2: Update manifests and commit**

```bash
git add .claude/skills/add-shabbat-mode/manifest.yaml .claude/skills/add-voice-transcription-elevenlabs/manifest.yaml
git commit -m "fix(skills): capture npm dependencies in skill manifests"
```

---

### Task 8: Verify full coverage

Run the fork divergence audit to confirm all src/ changes are captured:

```bash
git diff upstream/main --name-only -- src/ container/agent-runner/
```

For each file listed, confirm it appears in at least one skill's `adds` or `modifies`.

---

## Phase 2: Build pipeline scripts

### Task 9: Create apply-skills.ts

This script applies all skills from `installed-skills.yaml` sequentially.

**Files:**
- Create: `scripts/apply-skills.ts`

**Step 1: Write the script**

```typescript
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { initNanoclawDir } from '../skills-engine/init.js';
import { replaySkills, findSkillDir } from '../skills-engine/replay.js';
import { readState } from '../skills-engine/state.js';

const INSTALLED_SKILLS_PATH = '.nanoclaw/installed-skills.yaml';
const SKILLS_DIR = '.claude/skills';

interface InstalledSkills {
  skills: string[];
}

async function main() {
  // Read installed skills list
  if (!fs.existsSync(INSTALLED_SKILLS_PATH)) {
    console.log('No installed-skills.yaml found. Nothing to apply.');
    process.exit(0);
  }

  const raw = fs.readFileSync(INSTALLED_SKILLS_PATH, 'utf-8');
  const config: InstalledSkills = yaml.parse(raw);

  if (!config.skills || config.skills.length === 0) {
    console.log('No skills listed in installed-skills.yaml.');
    process.exit(0);
  }

  // Initialize .nanoclaw/ if not present (snapshots current src/ as base)
  if (!fs.existsSync('.nanoclaw/base')) {
    console.log('Initializing .nanoclaw/ directory...');
    initNanoclawDir();
  }

  // Check if already applied
  try {
    const state = readState();
    if (state.applied_skills.length > 0) {
      console.log(`Skills already applied (${state.applied_skills.length} skills). Use clean-skills first to re-apply.`);
      process.exit(0);
    }
  } catch {
    // No state yet — fresh apply
  }

  // Locate all skill directories
  const skillDirs: Record<string, string> = {};
  for (const skillName of config.skills) {
    const dir = findSkillDir(skillName);
    if (!dir) {
      console.error(`Skill directory not found for: ${skillName}`);
      process.exit(1);
    }
    skillDirs[skillName] = dir;
  }

  console.log(`Applying ${config.skills.length} skills: ${config.skills.join(', ')}`);

  // Apply sequentially using replaySkills
  const result = await replaySkills({
    skills: config.skills,
    skillDirs,
  });

  if (!result.success) {
    console.error('Skill application failed!');
    if (result.mergeConflicts?.length) {
      console.error('Merge conflicts in:', result.mergeConflicts.join(', '));
    }
    if (result.error) console.error(result.error);
    process.exit(1);
  }

  console.log(`Successfully applied ${config.skills.length} skills.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

**Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add scripts/apply-skills.ts
git commit -m "feat: add apply-skills script for patch-queue model"
```

---

### Task 10: Create clean-skills.ts

Restores src/ and container/ to clean upstream state by resetting to `.nanoclaw/base/`.

**Files:**
- Create: `scripts/clean-skills.ts`

**Step 1: Write the script**

The script should:
1. Read `.nanoclaw/state.yaml` to find applied skills
2. Collect all files touched by applied skills (adds + modifies)
3. For each file: restore from `.nanoclaw/base/` (or delete if add-only)
4. Reset `state.yaml` to empty applied_skills
5. Refuse to run if working tree has uncommitted changes to src/ (dirty detection)

Use `readState()`, `writeState()` from `skills-engine/state.ts`.

**Step 2: Verify and commit**

---

### Task 11: Create package-skill.ts

Extracts current src/ changes vs applied state into a new skill directory.

**Files:**
- Create: `scripts/package-skill.ts`

**Step 1: Write the script**

The script should:
1. Take skill name as argument
2. Diff current src/ against the last applied state (from state.yaml file hashes)
3. New files → `add/` directory
4. Modified files → `modify/` directory (copy full file)
5. Generate `manifest.yaml` skeleton with adds, modifies, detected npm deps
6. Print instructions for completing SKILL.md

This is an evolution of the `customize.ts` mechanism but outputs a full skill
directory instead of a patch file.

**Step 2: Verify and commit**

---

### Task 12: Update package.json scripts

**Files:**
- Modify: `package.json`

**Step 1: Update scripts**

```json
{
  "scripts": {
    "build": "npx tsx scripts/apply-skills.ts && tsc && npx tsx scripts/clean-skills.ts",
    "build:quick": "tsc",
    "dev": "npx tsx scripts/apply-skills.ts && tsx watch src/index.ts",
    "start": "node dist/index.js",
    "apply-skills": "tsx scripts/apply-skills.ts",
    "clean-skills": "tsx scripts/clean-skills.ts",
    "package-skill": "tsx scripts/package-skill.ts"
  }
}
```

Notes:
- `build` wraps apply→compile→clean. Produces dist/ with applied code, restores src/.
- `build:quick` skips skill application (for when src/ is already applied).
- `dev` applies skills then watches. src/ stays applied during development.
- Existing scripts (`test`, `typecheck`, `format`, etc.) unchanged.

**Step 2: Commit**

```bash
git add package.json
git commit -m "feat: update build scripts for patch-queue model"
```

---

## Phase 3: Verify sequential application

### Task 13: Create installed-skills.yaml

**Files:**
- Create: `.nanoclaw/installed-skills.yaml`

**Step 1: Determine the canonical install order**

The order must avoid merge conflicts during sequential application. Based on
pairwise testing, a safe order is one where skills with more shared file
modifications are applied adjacently (so later skills merge against their
predecessors cleanly).

Start with the most foundational (fewest dependencies), end with the most
complex:

```yaml
# .nanoclaw/installed-skills.yaml
# Canonical skill install order for this fork.
# Skills are applied sequentially at build time.
# Order matters: each skill merges against the accumulated state.
skills:
  - add-reactions
  - add-refresh-oauth
  - add-google-home
  - add-shabbat-mode
  - add-voice-transcription-elevenlabs
  - add-voice-recognition
  - add-whatsapp-search
  - add-perplexity-research
```

Note: This file is NOT gitignored (unlike the rest of `.nanoclaw/`). Add an
exception to `.gitignore`:

```gitignore
.nanoclaw/
!.nanoclaw/installed-skills.yaml
```

**Step 2: Commit**

```bash
git add .nanoclaw/installed-skills.yaml .gitignore
git commit -m "feat: create installed-skills.yaml with canonical install order"
```

---

### Task 14: Test sequential application in isolation

Verify that applying all skills in the declared order produces a working build.

**Step 1: Create a test script**

```bash
#!/bin/bash
# scripts/scratch/test-sequential-apply.sh
set -e

echo "=== Testing sequential skill application ==="

# Save current state
git stash --include-untracked -q 2>/dev/null || true

# Reset src/ to upstream
git checkout upstream/main -- src/ container/ package.json
npm ci --silent

# Initialize .nanoclaw with upstream base
npx tsx scripts/init-nanoclaw-dir.ts
# Base is already upstream (we just checked out upstream/main)

# Apply skills in order
npx tsx scripts/apply-skills.ts

# Typecheck
npx tsc --noEmit
echo "Typecheck: PASS"

# Run tests
npx vitest run
echo "Tests: PASS"

# Restore
git checkout -- .
git clean -fd --exclude=node_modules -q
git stash pop -q 2>/dev/null || true

echo "=== Sequential application: ALL PASS ==="
```

**Step 2: Run it**

```bash
bash scripts/scratch/test-sequential-apply.sh
```

Expected: typecheck and all tests pass.

**Step 3: Fix any failures**

If sequential application produces conflicts or test failures, adjust the
install order in `installed-skills.yaml` or fix skill modify/ files. The most
common issue would be skills that touch the same lines — resolve by adjusting
anchor points (same technique used in the skill-drift-rebase PR).

---

### Task 15: Compare sequential output vs current src/

Verify the sequentially-applied src/ matches the current committed src/.

**Step 1: After Task 14's sequential apply, before restoring**

```bash
diff -rq src/ /tmp/current-src/ --exclude=node_modules
```

(Where `/tmp/current-src/` is a copy of the current committed src/.)

Any differences indicate uncaptured changes (go back to Phase 1) or
ordering-dependent merge artifacts (adjust install order).

---

## Phase 4: The big flip

### Task 16: Revert src/ and container/ to upstream

This is the one-commit switch. Everything up to this point is preparation.

**Step 1: Create the commit**

```bash
# Revert src/ and container/ to upstream
git checkout upstream/main -- src/ container/

# Restore package.json to upstream (skill deps handled by structured operations)
git checkout upstream/main -- package.json

# Run npm install to match upstream deps
npm install

# Commit
git add src/ container/ package.json package-lock.json
git commit -m "refactor: revert src/ to upstream — patch-queue model

src/ now matches upstream/main exactly. All fork customizations
live as skills in .claude/skills/ and are applied at build time
via npm run build.

See docs/plans/2026-02-27-patch-queue-design.md for details."
```

**Step 2: Verify build works**

```bash
npm run build
```

Expected: apply-skills runs, tsc compiles, clean-skills restores src/.

**Step 3: Verify service starts**

```bash
node dist/index.js
```

Expected: NanoClaw starts with all features active (skills were applied
during build).

**Step 4: Restart service**

```bash
systemctl --user restart nanoclaw
```

---

## Phase 5: Update CI

### Task 17: Simplify skill CI workflows

**Files:**
- Modify: `.github/workflows/skill-tests.yml`
- Modify: `.github/workflows/skill-drift.yml` (if exists)

**Step 1: Update skill-tests.yml**

The combination matrix is no longer needed. Replace with a single job that:
1. Checks out the repo
2. Runs `npm run build` (which applies all skills and compiles)
3. Runs `npx vitest run`

**Step 2: Update skill-drift.yml**

Change from "detect drift and fix modify/ files" to "verify skills apply
cleanly against current upstream." The check becomes: can `npm run build`
succeed? If not, a skill has a real conflict with upstream changes.

**Step 3: Commit**

```bash
git add .github/workflows/
git commit -m "ci: simplify skill workflows for patch-queue model"
```

---

## Phase 6: Documentation and workflow

### Task 18: Update CLAUDE.md with new workflow

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add patch-queue documentation**

Add a new section to CLAUDE.md after the "Development" section:

```markdown
## Build Model (Patch Queue)

This fork uses a **patch-queue model**. `src/` in git matches upstream/main
exactly. All fork customizations live as skills in `.claude/skills/` and are
applied at build time.

### Key commands

```bash
npm run build          # Apply skills → compile → restore src/
npm run build:quick    # Compile only (src/ must be pre-applied)
npm run dev            # Apply skills → watch mode (src/ stays applied)
npm run apply-skills   # Apply all installed skills to src/
npm run clean-skills   # Restore src/ to upstream state
npm run package-skill  # Extract src/ changes into a new skill
```

### Development workflow

1. **Always work in a git worktree** — never edit directly on main to avoid
   breaking the live service:
   ```bash
   git worktree add ../gabay-feature feat/my-feature
   cd ../gabay-feature
   npm run dev
   ```
2. Edit src/ freely during development
3. When feature is ready: `npm run package-skill my-feature`
4. Clean up: add skill to `.nanoclaw/installed-skills.yaml`, run `npm run build`
5. Commit the skill files, not the src/ changes

### Upstream merges

```bash
git fetch upstream && git merge upstream/main   # trivial — src/ matches
npm run build                                    # re-applies skills
npx vitest run                                   # verify
```

### Adding a skill

Append to `.nanoclaw/installed-skills.yaml` and run `npm run build`.

### Removing a skill

Delete from `.nanoclaw/installed-skills.yaml` and run `npm run build`.
```

**Step 2: Remove outdated instructions**

Remove or update any existing documentation that refers to the old committed-
state model.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add patch-queue workflow to CLAUDE.md"
```

---

### Task 19: Add pre-commit hook for state validation

**Files:**
- Modify: `.husky/pre-commit` (or create)

**Step 1: Add validation**

The hook should warn (not block) if src/ files differ from upstream. This
catches accidental commits of applied state.

```bash
# Check if src/ matches upstream — warn if diverged
if ! git diff --quiet upstream/main -- src/ 2>/dev/null; then
  echo "WARNING: src/ differs from upstream/main."
  echo "If you're committing skill files, this is expected during development."
  echo "Run 'npm run clean-skills' before committing if src/ should be clean."
fi
```

**Step 2: Commit**

```bash
git add .husky/
git commit -m "chore: add pre-commit warning for applied src/ state"
```

---

## Phase 7: Live verification

### Task 20: End-to-end verification

**Step 1: Full rebuild from clean state**

```bash
npm run clean-skills   # ensure src/ is clean
npm run build          # apply → compile → restore
```

**Step 2: Verify service**

```bash
systemctl --user restart nanoclaw
# Send a test message via WhatsApp
# Verify response works
```

**Step 3: Verify upstream merge**

```bash
git fetch upstream
git merge upstream/main    # should be trivial or no-op
npm run build              # re-apply skills
npx vitest run             # verify
```

**Step 4: Verify dev workflow**

```bash
git worktree add ../gabay-test-worktree test/patch-queue-verify
cd ../gabay-test-worktree
npm run dev
# Verify hot reload works with applied skills
# Ctrl+C to stop
cd ../gabay
git worktree remove ../gabay-test-worktree
```

---

## Parallelism Notes

- **Tasks 1-7** (capture uncaptured changes) can be parallelized — each
  touches a different skill.
- **Tasks 9-11** (pipeline scripts) can be parallelized — independent scripts.
- **Task 14** depends on Tasks 9 and 13.
- **Task 16** (the big flip) depends on Task 14 passing.
- **Tasks 17-19** can be parallelized after Task 16.

## Risk Mitigations

- **Task 14 is the safety gate** — if sequential application doesn't reproduce
  the current build, stop and fix before proceeding to Task 16.
- **Task 16 is reversible** — `git revert` restores the old committed state.
- **Always use worktrees** — the live service on main is never affected during
  development.
