# Skill Combination CI Fix v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make all valid skill combination CI entries pass by adding `incompatible_with` support and fixing Category B failures.

**Architecture:** Two-pronged fix: (1) Add `incompatible_with` manifest field so the CI matrix skips 5 body-conflict pairs, (2) fix the 8 Category B failures — reactions TypeScript compilation errors and vitest running unrelated skill tests.

**Tech Stack:** TypeScript, Vitest, YAML manifests, GitHub Actions

---

### Task 1: Write failing tests for `incompatible_with` in CI matrix

**Files:**
- Modify: `skills-engine/__tests__/ci-matrix.test.ts`

**Step 1: Write the failing tests**

Add these tests inside the `computeOverlapMatrix` describe block (after the existing `it('orders dependency first when b depends on a', ...)` test around line 157):

```typescript
    it('excludes pairs where either skill declares the other incompatible', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'add-discord', skill: 'discord', modifies: ['src/index.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: ['telegram'] },
        { name: 'add-telegram', skill: 'telegram', modifies: ['src/index.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: ['discord'] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(0);
    });

    it('excludes pair when only one side declares incompatible_with', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'add-voice-recognition', skill: 'voice-recognition', modifies: ['src/channels/whatsapp.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: ['voice-transcription'] },
        { name: 'add-voice-transcription', skill: 'voice-transcription', modifies: ['src/channels/whatsapp.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(0);
    });

    it('does not exclude pairs with empty incompatible_with', () => {
      const skills: SkillOverlapInfo[] = [
        { name: 'a', skill: 'a', modifies: ['src/config.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
        { name: 'b', skill: 'b', modifies: ['src/config.ts'], npmDependencies: [], conflicts: [], depends: [], incompatible_with: [] },
      ];

      const matrix = computeOverlapMatrix(skills);

      expect(matrix).toHaveLength(1);
    });
```

Also add a test inside the `extractOverlapInfo` describe block (after the existing `it('handles structured without npm_dependencies', ...)` test around line 215):

```typescript
    it('extracts incompatible_with from manifest', () => {
      const manifest = makeManifest({
        skill: 'discord',
        modifies: ['src/index.ts'],
        incompatible_with: ['telegram', 'gmail'],
      });

      const info = extractOverlapInfo(manifest, 'add-discord');

      expect(info.incompatible_with).toEqual(['telegram', 'gmail']);
    });

    it('defaults incompatible_with to empty array', () => {
      const manifest = makeManifest({
        skill: 'simple',
        modifies: ['src/index.ts'],
      });

      const info = extractOverlapInfo(manifest, 'add-simple');

      expect(info.incompatible_with).toEqual([]);
    });
```

**Important:** All existing `SkillOverlapInfo` objects in tests must also include `incompatible_with: []` to match the updated interface. Update every inline `SkillOverlapInfo` object in the file (there are ~15 of them).

**Step 2: Run tests to verify they fail**

Run: `npx vitest run skills-engine/__tests__/ci-matrix.test.ts`
Expected: FAIL — `incompatible_with` property doesn't exist on `SkillOverlapInfo`

**Step 3: Commit**

```bash
git add skills-engine/__tests__/ci-matrix.test.ts
git commit -m "test: add failing tests for incompatible_with CI matrix support"
```

---

### Task 2: Implement `incompatible_with` support in types and CI matrix

**Files:**
- Modify: `skills-engine/types.ts` (line ~20, near `tested_with`)
- Modify: `scripts/generate-ci-matrix.ts` (3 locations)

**Step 1: Add field to `SkillManifest`**

In `skills-engine/types.ts`, add after `tested_with?: string[];` (line 20):

```typescript
  incompatible_with?: string[];
```

**Step 2: Add field to `SkillOverlapInfo`**

In `scripts/generate-ci-matrix.ts`, add to the `SkillOverlapInfo` interface (after `depends: string[];` on line 19):

```typescript
  incompatible_with: string[];
```

**Step 3: Update `extractOverlapInfo`**

In `scripts/generate-ci-matrix.ts`, add to the return object in `extractOverlapInfo` (after the `depends` line, around line 38):

```typescript
    incompatible_with: manifest.incompatible_with ?? [],
```

**Step 4: Update `computeOverlapMatrix`**

In `scripts/generate-ci-matrix.ts`, update the skip logic inside `computeOverlapMatrix`. After the existing conflict check (lines 72-74):

```typescript
        // Skip conflicting skill pairs
        if (a.conflicts.includes(b.skill) || b.conflicts.includes(a.skill)) {
          continue;
        }
```

Add:

```typescript
        // Skip incompatible skill pairs (can coexist but need manual merge)
        if (a.incompatible_with.includes(b.skill) || b.incompatible_with.includes(a.skill)) {
          continue;
        }
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run skills-engine/__tests__/ci-matrix.test.ts`
Expected: ALL PASS (22 tests)

**Step 6: Commit**

```bash
git add skills-engine/types.ts scripts/generate-ci-matrix.ts
git commit -m "feat: add incompatible_with support to CI matrix generation"
```

---

### Task 3: Add `incompatible_with` to skill manifests

**Files:**
- Modify: `.claude/skills/add-discord/manifest.yaml`
- Modify: `.claude/skills/add-telegram/manifest.yaml`
- Modify: `.claude/skills/add-gmail/manifest.yaml`
- Modify: `.claude/skills/add-voice-recognition/manifest.yaml`

**Step 1: Add `incompatible_with` to each manifest**

Each manifest gets a new `incompatible_with` field. Add it after the `conflicts` field.

**add-discord/manifest.yaml** — add:
```yaml
incompatible_with:
  - telegram
  - gmail
```

**add-telegram/manifest.yaml** — add:
```yaml
incompatible_with:
  - discord
  - gmail
```

**add-gmail/manifest.yaml** — add:
```yaml
incompatible_with:
  - discord
  - telegram
```

**add-voice-recognition/manifest.yaml** — add:
```yaml
incompatible_with:
  - voice-transcription
  - voice-transcription-elevenlabs
```

**Step 2: Verify matrix generation**

Run: `npx tsx scripts/generate-ci-matrix.ts`

Expected: Output should contain 10 pairs (was 15, minus 5 incompatible). Verify these 5 pairs are excluded:
- discord + telegram
- discord + gmail
- gmail + telegram
- voice-recognition + voice-transcription
- voice-recognition + voice-transcription-elevenlabs

**Step 3: Commit**

```bash
git add .claude/skills/add-discord/manifest.yaml .claude/skills/add-telegram/manifest.yaml .claude/skills/add-gmail/manifest.yaml .claude/skills/add-voice-recognition/manifest.yaml
git commit -m "feat: mark 5 skill pairs as incompatible_with for CI"
```

---

### Task 4: Fix vitest.skills.config.ts to scope tests to applied skills

The CI currently runs ALL skill tests (`.claude/skills/**/tests/*.test.ts`), which includes tests for unapplied skills (e.g., gmail tests run when only shabbat + telegram are applied).

**Files:**
- Modify: `vitest.skills.config.ts`
- Modify: `.github/workflows/skill-tests.yml`

**Step 1: Update vitest.skills.config.ts**

Replace the entire file with:

```typescript
import { defineConfig } from 'vitest/config';

const appliedSkills = (process.env.APPLIED_SKILLS || '').split(',').filter(Boolean);

const include = appliedSkills.length > 0
  ? appliedSkills.map((s) => `.claude/skills/${s}/tests/*.test.ts`)
  : ['.claude/skills/**/tests/*.test.ts'];

export default defineConfig({
  test: {
    include,
  },
});
```

**Step 2: Update CI workflow to pass applied skills**

In `.github/workflows/skill-tests.yml`, update the "Run skill tests" step (around line 79) to pass the applied skills as an env var:

```yaml
      - name: Run skill tests
        env:
          APPLIED_SKILLS: ${{ join(matrix.entry.skills, ',') }}
        run: npx vitest run --config vitest.skills.config.ts
```

**Step 3: Verify locally**

Run: `APPLIED_SKILLS=add-shabbat-mode npx vitest run --config vitest.skills.config.ts`
Expected: Only runs shabbat tests (if they exist), not gmail/discord/telegram tests.

Run: `npx vitest run --config vitest.skills.config.ts`
Expected: Still runs all tests when no env var is set (backwards compatible).

**Step 4: Commit**

```bash
git add vitest.skills.config.ts .github/workflows/skill-tests.yml
git commit -m "fix: scope skill tests to applied skills in CI"
```

---

### Task 5: Debug and fix reactions TypeScript compilation errors

When reactions is applied alongside another skill, `npx tsc --noEmit` fails. The reactions modify files were regenerated from upstream in a previous session but may have type errors.

**Files:**
- Potentially modify any file in `.claude/skills/add-reactions/modify/`

**Step 1: Reproduce the error locally**

Create a temporary test setup that mimics CI:

```bash
# From project root
cd /home/yaz/code/yonibot/nanoclaw

# Save current state
git stash

# Reset src/ to upstream
git checkout upstream/main -- src/ container/ package.json
npm ci

# Initialize nanoclaw dir and set upstream base
npx tsx scripts/init-nanoclaw-dir.ts
npx tsx scripts/set-upstream-base.ts

# Apply reactions solo
npx tsx scripts/apply-skill.ts .claude/skills/add-reactions
```

If this fails with tsc errors, the reactions modify files have issues regardless of other skills. Capture the full error output.

If it succeeds solo, try applying shabbat-mode first, then reactions:

```bash
# Reset again
git checkout upstream/main -- src/ container/ package.json
npm ci
npx tsx scripts/set-upstream-base.ts

npx tsx scripts/apply-skill.ts .claude/skills/add-shabbat-mode
npx tsx scripts/apply-skill.ts .claude/skills/add-reactions
```

**Step 2: Fix the TypeScript errors**

Based on the error output, fix the relevant modify files. Common issues to check:
- **Missing exports**: Reactions db.ts modify should export `getMessageFromMe`, `getLatestMessage`, `storeReaction`, `getReactionsForMessage`, `getMessagesByReaction`, `getReactionsByUser`, `getReactionStats`, and the `Reaction` interface
- **Type mismatches**: Reactions types.ts modify adds `sendReaction?` and `reactToLatestMessage?` to Channel interface — verify signatures match what whatsapp.ts implements
- **Import conflicts**: After merge, check for duplicate imports or missing imports in index.ts and ipc.ts
- **Stale file content**: If upstream files have changed since modify files were generated, regenerate them from the current upstream

**Step 3: Verify the fix**

Re-run the reproduction steps from Step 1. `npx tsc --noEmit` should pass.

**Step 4: Restore working tree**

```bash
git checkout .
git stash pop
```

**Step 5: Commit**

```bash
git add .claude/skills/add-reactions/modify/
git commit -m "fix: correct TypeScript errors in reactions modify files"
```

---

### Task 6: Full local verification

**Step 1: Run unit tests**

Run: `npx vitest run skills-engine/__tests__/ci-matrix.test.ts`
Expected: ALL PASS

**Step 2: Verify matrix output**

Run: `npx tsx scripts/generate-ci-matrix.ts`
Expected: 10 pairs (5 incompatible pairs excluded). Verify the output looks correct:
- gmail + shabbat-mode (already passes)
- All reactions pairs (should now pass after Task 5 fix)
- shabbat-mode + telegram (should now pass after Task 4 vitest fix)
- Other valid pairs

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests pass (no regressions).

---

### Task 7: Push and verify CI

**Step 1: Push to origin**

```bash
git push origin fix/skill-combination-ci
```

**Step 2: Monitor CI**

Check PR #12 CI results. All 10 test-combinations entries should pass.

**Step 3: Update PR description**

Update the PR description to reflect the v2 changes:
- `incompatible_with` manifest field (5 pairs skipped)
- Vitest scoped to applied skills
- Reactions modify files fixed
