# Skill Combination CI Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 16 skill combination CI test failures so every valid skill pair applies cleanly.

**Architecture:** Rebase all skill `modify/` files on `upstream/main` as the shared base. Update CI to use upstream as the `.nanoclaw/base/` reference. Fix `generate-ci-matrix.ts` to skip invalid combos (conflicting skills, unmet deps). Create missing `add-reactions/modify/` directory.

**Tech Stack:** TypeScript, bash, git, GitHub Actions, vitest

**Design doc:** `docs/plans/2026-02-25-skill-combination-ci-fix-design.md`

---

### Task 1: Create branch and CI upstream-base script

**Files:**
- Create: `scripts/set-upstream-base.ts`
- Modify: `.github/workflows/skill-tests.yml`
- Modify: `scripts/init-nanoclaw-dir.ts`

**Step 1: Create the branch**

```bash
git checkout -b fix/skill-combination-ci main
```

**Step 2: Write `scripts/set-upstream-base.ts`**

This script overwrites `.nanoclaw/base/` with upstream file versions using `git show upstream/main:<path>`. It reads `BASE_INCLUDES` from `skills-engine/constants.ts` so the file list stays DRY.

```typescript
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { BASE_DIR, BASE_INCLUDES } from '../skills-engine/constants.js';

const projectRoot = process.cwd();
const baseDir = path.join(projectRoot, BASE_DIR);

function copyFromUpstream(relPath: string): void {
  const destPath = path.join(baseDir, relPath);
  try {
    const content = execSync(`git show upstream/main:${relPath}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content);
  } catch {
    // File doesn't exist in upstream — skip
  }
}

function walkUpstream(dirPath: string): void {
  let listing: string;
  try {
    listing = execSync(`git ls-tree -r --name-only upstream/main ${dirPath}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return;
  }
  for (const line of listing.trim().split('\n')) {
    if (line) copyFromUpstream(line);
  }
}

// Clean existing base
if (fs.existsSync(baseDir)) {
  fs.rmSync(baseDir, { recursive: true, force: true });
}
fs.mkdirSync(baseDir, { recursive: true });

for (const include of BASE_INCLUDES) {
  if (include.endsWith('/')) {
    walkUpstream(include);
  } else {
    copyFromUpstream(include);
  }
}

console.log('Base set to upstream/main');
```

**Step 3: Update `.github/workflows/skill-tests.yml`**

In the `test-combinations` job, add upstream fetch and base override steps:

```yaml
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci

      - name: Fetch upstream
        run: git remote add upstream https://github.com/qwibitai/nanoclaw.git && git fetch upstream main

      - name: Initialize nanoclaw dir
        run: npx tsx scripts/init-nanoclaw-dir.ts

      - name: Set upstream base
        run: npx tsx scripts/set-upstream-base.ts

      # ... rest unchanged
```

**Step 4: Run tests locally**

```bash
npx vitest run skills-engine/__tests__/
```

**Step 5: Commit**

```bash
git add scripts/set-upstream-base.ts .github/workflows/skill-tests.yml
git commit -m "ci: add upstream base setup for skill combination tests"
```

---

### Task 2: Fix generate-ci-matrix to skip invalid combos

**Files:**
- Modify: `scripts/generate-ci-matrix.ts`
- Modify: `scripts/generate-ci-matrix.test.ts` (if exists, otherwise skill-tests in `skills-engine/__tests__/`)

**Step 1: Write a failing test**

Add a test to the existing CI matrix test file (or create one) that verifies:
- Conflicting skill pairs are excluded
- Dependencies are respected in skill ordering

```typescript
it('excludes conflicting skill pairs', () => {
  // voice-transcription conflicts with voice-transcription-elevenlabs
  // The matrix should not include this pair
});

it('orders skills respecting dependencies', () => {
  // voice-recognition depends on voice-transcription-elevenlabs
  // If paired, elevenlabs should come first
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run scripts/generate-ci-matrix.test.ts
```

**Step 3: Update `generate-ci-matrix.ts`**

Modify `computeOverlapMatrix` to:

1. Read `conflicts` and `depends` from manifests (need to pass full manifests, not just overlap info)
2. Skip pairs where `a.conflicts` includes `b.skill` or vice versa
3. Order skills in each pair so dependencies come first

Changes to `extractOverlapInfo`:
- Add `conflicts: string[]` and `depends: string[]` and `skill: string` (manifest name) fields to `SkillOverlapInfo`

Changes to `computeOverlapMatrix`:
- After finding an overlap, check if `a.conflicts.includes(b.skill) || b.conflicts.includes(a.skill)` → skip
- If `a.depends.includes(b.skill)` → order as `[b, a]`
- If `b.depends.includes(a.skill)` → order as `[a, b]`

**Step 4: Run test to verify it passes**

```bash
npx vitest run scripts/generate-ci-matrix.test.ts
```

**Step 5: Commit**

```bash
git add scripts/generate-ci-matrix.ts scripts/generate-ci-matrix.test.ts
git commit -m "ci: skip conflicting combos, respect dependency ordering in matrix"
```

---

### Task 3: Fix voice-recognition dependency

**Files:**
- Modify: `.claude/skills/add-voice-recognition/manifest.yaml`

**Step 1: Change the dependency**

The current manifest hard-depends on `voice-transcription-elevenlabs`. But the skill should work with either transcription variant. Since both transcription skills add `src/transcription.ts` with the same interface, voice-recognition should declare `depends: []` and instead use `tested_with` to document the intended pairing.

Change in `manifest.yaml`:
```yaml
depends: []
tested_with:
  - voice-transcription-elevenlabs
  - voice-transcription
```

Note: voice-recognition modifies `src/transcription.ts`, which is ADDED by either transcription skill. The `applySkill` flow handles missing files by just copying from skill's modify — this won't conflict.

Actually, since `src/transcription.ts` doesn't exist in the base repo and is added by the transcription skill, voice-recognition needs the transcription skill to be applied first. We should keep a dependency but make it accept either variant. Since the manifest schema uses `depends: string[]` where ALL must be satisfied, and we need OR logic, the cleanest fix is:

Remove the explicit depends and have the CI matrix test both valid orderings. The apply will succeed if transcription is applied first (creates the file) and voice-recognition second (modifies it). If voice-recognition is first, it will fail because the file doesn't exist — but that's expected and correct.

**Decision:** Set `depends: []` and let the CI ordering handle it. Document the requirement in SKILL.md.

**Step 2: Commit**

```bash
git add .claude/skills/add-voice-recognition/manifest.yaml
git commit -m "fix: relax voice-recognition dependency to work with either transcription variant"
```

---

### Task 4: Regenerate add-discord modify files from upstream

**Files:**
- Modify: `.claude/skills/add-discord/modify/src/index.ts`
- Modify: `.claude/skills/add-discord/modify/src/config.ts`
- Modify: `.claude/skills/add-discord/modify/src/routing.test.ts`

**Approach:** For each file, start from `git show upstream/main:<path>` and add ONLY Discord-specific additions identified from the current modify files and SKILL.md.

**Step 1: Regenerate `modify/src/index.ts`**

Start from upstream `src/index.ts` (498 lines). Add Discord-specific changes:

**Imports to add:**
```typescript
import { DiscordChannel } from './channels/discord.js';
```

**In `main()` function, after WhatsApp channel setup, add:**
```typescript
  // Discord channel
  if (process.env.DISCORD_BOT_TOKEN) {
    const discord = new DiscordChannel({
      onMessage: handleInboundMessage,
      onChatMetadata: handleChatMetadata,
      registeredGroups: () => registeredGroups,
    });
    await discord.connect();
    channels.push(discord);
    logger.info('Discord channel connected');
  }
```

Use `git show upstream/main:src/index.ts` as the base, apply the additions, save to `.claude/skills/add-discord/modify/src/index.ts`.

**Step 2: Regenerate `modify/src/config.ts`**

Start from upstream `src/config.ts`. Add Discord-specific constants — review current modify file to identify exact additions.

**Step 3: Regenerate `modify/src/routing.test.ts`**

Start from upstream `src/routing.test.ts` (100 lines). Add Discord JID test:

```typescript
  it('Discord JID: starts with dc:', () => {
    const jid = 'dc:1234567890123456';
    expect(jid.startsWith('dc:')).toBe(true);
  });
```

And Discord-specific getAvailableGroups tests (includes Discord channels, marks registered Discord channels).

**Step 4: Verify by applying locally**

```bash
npx tsx scripts/init-nanoclaw-dir.ts
npx tsx scripts/set-upstream-base.ts  # or use git show to set base manually
npx tsx scripts/apply-skill.ts .claude/skills/add-discord
```

Expected: `{ "success": true, "skill": "discord", ... }`

**Step 5: Reset working tree and commit**

```bash
git checkout -- src/  # reset applied changes
git add .claude/skills/add-discord/modify/
git commit -m "fix: regenerate add-discord modify files from upstream base"
```

---

### Task 5: Regenerate add-gmail modify files from upstream

Same approach as Task 4 but for Gmail.

**Files:**
- Modify: `.claude/skills/add-gmail/modify/src/index.ts`
- Modify: `.claude/skills/add-gmail/modify/src/config.ts`
- Modify: `.claude/skills/add-gmail/modify/src/routing.test.ts`

**Gmail-specific additions to upstream `src/index.ts`:**
```typescript
import { GmailChannel } from './channels/gmail.js';
```
Plus Gmail channel setup in `main()`.

**Step: Verify, reset, commit**

```bash
git add .claude/skills/add-gmail/modify/
git commit -m "fix: regenerate add-gmail modify files from upstream base"
```

---

### Task 6: Regenerate add-telegram modify files from upstream

Same approach as Task 4 but for Telegram.

**Files:**
- Modify: `.claude/skills/add-telegram/modify/src/index.ts`
- Modify: `.claude/skills/add-telegram/modify/src/config.ts`
- Modify: `.claude/skills/add-telegram/modify/src/routing.test.ts`

**Telegram-specific additions to upstream `src/index.ts`:**
```typescript
import { TelegramChannel } from './channels/telegram.js';
```
Plus Telegram channel setup in `main()` and Telegram JID tests in routing.test.ts.

**Step: Verify, reset, commit**

```bash
git add .claude/skills/add-telegram/modify/
git commit -m "fix: regenerate add-telegram modify files from upstream base"
```

---

### Task 7: Regenerate add-shabbat-mode modify files from upstream

**Files:**
- Modify: `.claude/skills/add-shabbat-mode/modify/src/index.ts`
- Modify: `.claude/skills/add-shabbat-mode/modify/src/ipc.ts`
- Modify: `.claude/skills/add-shabbat-mode/modify/src/task-scheduler.ts`

**Shabbat-specific additions to upstream `src/index.ts`:**
```typescript
import { initShabbatSchedule, isShabbatOrYomTov } from './shabbat.js';
```
Plus `isShabbatOrYomTov()` guard in `processGroupMessages()` and `initShabbatSchedule()` call in `main()`.

**Shabbat-specific additions to upstream `src/ipc.ts`:**
```typescript
import { isShabbatOrYomTov } from './shabbat.js';
```
Plus early-return guard in `processIpcFiles()`.

**Shabbat-specific additions to upstream `src/task-scheduler.ts`:**
```typescript
import { isShabbatOrYomTov } from './shabbat.js';
```
Plus guard in task execution loop.

**Step: Verify each file, reset, commit**

```bash
git add .claude/skills/add-shabbat-mode/modify/
git commit -m "fix: regenerate add-shabbat-mode modify files from upstream base"
```

---

### Task 8: Create add-reactions/modify/ directory

**Files:**
- Create: `.claude/skills/add-reactions/modify/src/db.ts`
- Create: `.claude/skills/add-reactions/modify/src/channels/whatsapp.ts`
- Create: `.claude/skills/add-reactions/modify/src/types.ts`
- Create: `.claude/skills/add-reactions/modify/src/ipc.ts`
- Create: `.claude/skills/add-reactions/modify/src/index.ts`
- Create: `.claude/skills/add-reactions/modify/container/agent-runner/src/ipc-mcp-stdio.ts`

**Approach:** Start from each upstream file. Add ONLY the reaction-specific code described in `add-reactions/SKILL.md`.

**Key additions per file (from SKILL.md):**

- **src/db.ts**: Add `Reaction` interface, `reactions` table schema, and CRUD functions: `storeReaction`, `getReactionsForMessage`, `getMessagesByReaction`, `getReactionsByUser`, `getReactionStats`, `getMessageFromMe`, `getLatestMessage`
- **src/channels/whatsapp.ts**: Handle `messages.reaction` events in the Baileys event handler, call `onReaction` callback, add `sendReaction` method
- **src/types.ts**: Add `sendReaction` and `onReaction` to `Channel` interface
- **src/ipc.ts**: Add reaction IPC message handler for `type: 'reaction'`
- **src/index.ts**: Wire `sendReaction` from channel into the dependency chain
- **container/agent-runner/src/ipc-mcp-stdio.ts**: Add `react_to_message` MCP tool definition

**Step 1:** For each file, `git show upstream/main:<path>`, apply reaction additions, save to modify dir.

**Step 2: Verify**

```bash
npx tsx scripts/init-nanoclaw-dir.ts
# set upstream base
npx tsx scripts/apply-skill.ts .claude/skills/add-reactions
```

**Step 3: Reset and commit**

```bash
git checkout -- src/ container/
git add .claude/skills/add-reactions/modify/
git commit -m "fix: create add-reactions modify directory with upstream-based files"
```

---

### Task 9: Regenerate voice skill modify files from upstream

**Files:**
- Modify: `.claude/skills/add-voice-transcription/modify/src/channels/whatsapp.ts`
- Modify: `.claude/skills/add-voice-transcription/modify/src/channels/whatsapp.test.ts`
- Modify: `.claude/skills/add-voice-transcription-elevenlabs/modify/src/channels/whatsapp.ts`
- Modify: `.claude/skills/add-voice-transcription-elevenlabs/modify/src/channels/whatsapp.test.ts`
- Modify: `.claude/skills/add-voice-recognition/modify/src/channels/whatsapp.ts` (if exists)

**Approach:** Same as Tasks 4-7. Start from upstream, add only skill-specific code.

**Step: Verify, reset, commit per skill**

---

### Task 10: Local verification of all valid combos

**Step 1: Identify valid combos**

After the matrix generator excludes conflicts and respects deps, verify the matrix:

```bash
npx tsx scripts/generate-ci-matrix.ts
```

Review output — conflicting pairs (voice-transcription + voice-transcription-elevenlabs) should be gone.

**Step 2: Test each combo locally**

For each combo in the matrix:

```bash
# Fresh init with upstream base
npx tsx scripts/init-nanoclaw-dir.ts
git remote add upstream https://github.com/qwibitai/nanoclaw.git 2>/dev/null; git fetch upstream main
npx tsx scripts/set-upstream-base.ts

# Apply skills
npx tsx scripts/apply-skill.ts .claude/skills/<skill-a>
npx tsx scripts/apply-skill.ts .claude/skills/<skill-b>

# Run skill tests
npx vitest run --config vitest.skills.config.ts

# Reset for next combo
git checkout -- .
rm -rf .nanoclaw/
```

**Step 3: Fix any remaining merge conflicts**

If a specific combo still conflicts, examine the git merge-file output and adjust the skill modify file so additions are in non-overlapping regions of the upstream file.

---

### Task 11: Push and verify CI

**Step 1: Push branch and create PR**

```bash
git push -u origin fix/skill-combination-ci
gh pr create --title "fix(ci): upstream-based skill combination tests" --body "..."
```

**Step 2: Monitor CI**

```bash
gh pr checks <pr-number> --watch
```

**Step 3: Fix any CI-only failures**

If tests pass locally but fail in CI, check for environment differences (Node version, git version, missing upstream remote).
