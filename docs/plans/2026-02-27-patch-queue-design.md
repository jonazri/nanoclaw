# Patch Queue Skills Model — Design Document

> Convert the fork from "committed applied state" to a patch-queue model where
> src/ matches upstream exactly and skills are applied at build time.

## Problem

The fork maintains 4,133 lines of applied skill modifications committed in
src/. This causes three compounding problems:

1. **Upstream merge friction** — every upstream merge conflicts with applied
   skill code.
2. **Skill drift** — when upstream or the fork changes src/, every skill's
   modify/ files need manual updating.
3. **Re-applicability** — starting from clean upstream and re-applying
   customizations requires manual conflict resolution.

## Goal

Enable an agile development cycle:

1. Iterate fast on the fork (edit src/ freely)
2. Package stable features into portable skills
3. Clean the fork back to upstream
4. Catch up with upstream without merge hell
5. Upstream skills to NanoClaw when ready

## State Model

The system has three states:

| State | src/ contains | When |
|-------|--------------|------|
| **Clean** | Upstream exactly | After `git pull`, before build |
| **Applied** | Upstream + all skills merged | After `npm run build` or `npm run dev` |
| **Dirty** | Applied + manual edits | During feature development |

Transitions:

- **Clean → Applied**: `npm run apply-skills` (automated at build time)
- **Applied → Dirty**: Developer edits src/ freely
- **Dirty → Skill**: `npm run package-skill <name>` (extracts changes)
- **Applied → Clean**: `npm run clean-skills` (restores upstream src/)
- **Clean → Clean**: `git pull upstream main` (trivial merge)

`.nanoclaw/state.yaml` tracks which skills are applied, upstream base snapshot,
and file hashes for dirty detection. A pre-commit hook warns if src/ is in an
unexpected state.

## Build Pipeline

```
npm run build
  └─ apply-skills (if src/ is clean)
  └─ tsc (compile applied src/ → dist/)
  └─ restore src/ to clean state

npm run dev
  └─ apply-skills (one-time)
  └─ tsx watch (src/ stays applied, developer edits freely)
  └─ on exit: prompt to clean or leave applied

npm run deploy
  └─ git pull origin main
  └─ npm run build
  └─ systemctl --user restart nanoclaw
```

Key behaviors:

- **Idempotent** — if skills are already applied, apply step is skipped
- **Safe clean** — uses `.nanoclaw/base/` to know upstream state, only
  reverts files that skills touched
- **Dirty detection** — if src/ has manual edits beyond applied skills,
  build warns but proceeds; `clean-skills` refuses (would lose work)
- **dist/ is the artifact** — compiled output always reflects fully-applied
  state regardless of src/ state

The service definition doesn't change — still runs `node dist/index.js`.

## Skill Installation & Ordering

A manifest declares which skills are installed and in what order:

```yaml
# .nanoclaw/installed-skills.yaml
skills:
  - add-reactions
  - add-refresh-oauth
  - add-shabbat-mode
  - add-google-home
  - add-voice-transcription-elevenlabs
  - add-voice-recognition
  - add-whatsapp-search
  - add-perplexity-research
```

Key behaviors:

- **Order matters** — skills are applied sequentially. Earlier skills' changes
  are the "current" state that later skills merge against. This eliminates the
  pairwise combination problem.
- **Adding a skill** — append to the list, run `npm run build`.
- **Removing a skill** — delete from the list, run `npm run build`. Clean→apply
  only applies what's listed.
- **Conflict resolution** — fixed once in the apply order, not in every pairwise
  combination.

## Development Workflow

**Starting a feature:**
```bash
npm run dev                    # applies all installed skills, starts watch
# src/ is now "applied" — full working codebase
# edit src/ freely, iterate fast, test locally
```

**Packaging when ready:**
```bash
npm run package-skill my-feature
# creates .claude/skills/add-my-feature/
#   add/    — new files
#   modify/ — changed files (full snapshots for three-way merge)
#   manifest.yaml — auto-generated
# review, add SKILL.md, adjust manifest
```

**Cleaning up:**
```bash
# add new skill to installed-skills.yaml
npm run clean-skills           # reverts src/ to upstream
npm run build                  # re-applies all skills including new one
npx vitest run                 # verify everything works
git add .claude/skills/add-my-feature/ .nanoclaw/installed-skills.yaml
git commit -m "feat: add my-feature skill"
```

**Catching up with upstream:**
```bash
git fetch upstream
git merge upstream/main        # trivial — src/ matches upstream
npm run build                  # re-applies skills against new upstream
npx vitest run                 # catch real conflicts
```

**Upstreaming a skill:**
```bash
# skill is self-contained in .claude/skills/add-my-feature/
# copy to upstream repo, open PR — no fork-specific code leaks
```

## Migration Path

### Step 1: Audit fork-specific changes not in any skill

Identify src/ changes not captured in existing skills:

- `src/config.ts` — OWNER_NAME (7 lines)
- `skills-engine/__tests__/ci-matrix.test.ts` — fork CI test (388 lines)
- `.github/workflows/skill-drift.yml`, `skill-tests.yml` — fork CI
- `scripts/generate-ci-matrix.ts`, `validate-all-skills.ts`,
  `fix-skill-drift.ts` — fork scripts

Package these as a `fork-infrastructure` skill or fold into existing skills.

### Step 2: Build the new pipeline

Add `apply-skills`, `clean-skills`, `package-skill` scripts. Modify
`npm run build` and `npm run dev`. Test the round-trip: clean → apply → build →
clean reproduces the same result.

### Step 3: Create installed-skills.yaml

Declare the canonical install order. Verify sequential application produces
the same compiled output as the current committed src/.

### Step 4: The big flip

One commit:

- Revert src/ to match upstream/main
- Commit `.nanoclaw/installed-skills.yaml`
- Update build scripts in `package.json`
- Add pre-commit hook for state validation

After this, `npm run build` produces the same dist/ as before, but src/ is
clean in git.

### Step 5: Simplify CI

- Combination matrix CI — remove or reduce (fixed order eliminates pairwise
  testing)
- Drift detection CI — simplify to "verify skills apply cleanly"

## What Changes, What Doesn't

**Changes:**

| Component | Before | After |
|-----------|--------|-------|
| `src/` in git | Upstream + all applied | Upstream exactly |
| `npm run build` | `tsc` | apply → tsc → restore |
| `npm run dev` | `tsx watch` | apply → tsx watch |
| Adding a feature | Edit src/, commit | Edit src/, package, commit skill |
| Upstream merge | Painful (4,133 line diff) | Trivial |
| Skill drift | Manual modify/ fixes | Auto-resolved by three-way merge |
| Combination CI | 32 pairwise tests | Unnecessary |

**Doesn't change:**

- Skills engine code (`skills-engine/`) — used as-is
- Skill structure (manifest.yaml, add/, modify/, SKILL.md)
- Container system
- Service definition (`node dist/index.js`)
- `.claude/skills/` directory location
- Three-way merge algorithm (`git merge-file`)

**New files:**

- `.nanoclaw/installed-skills.yaml` — skill install order
- `scripts/apply-skills.ts` — sequential skill application
- `scripts/clean-skills.ts` — restore src/ to upstream
- `scripts/package-skill.ts` — extract changes into a skill
- `.claude/skills/fork-infrastructure/` — CI workflows, scripts, fork config

**Removed/simplified:**

- `scripts/generate-ci-matrix.ts` — optional validation only
- `.github/workflows/skill-tests.yml` — simplified
- `.github/workflows/skill-drift.yml` — simplified
