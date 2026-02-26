# Skill Combination CI Fix v2 — Design

## Problem

14 of 15 skill combination CI entries fail. Analysis reveals two distinct failure modes:

1. **Body conflicts (5 pairs)**: Skills modify the same code lines — `git merge-file` cannot auto-resolve. These are structurally incompatible and need to be skipped.
2. **Clean merge but CI fails (8 pairs)**: Three-way merge succeeds but skill application or compilation fails. 7 of 8 involve `add-reactions`. The reactions modify files likely have quality issues.

## Approach: Hybrid

### Part 1: `incompatible_with` manifest field

Add `incompatible_with` to skill manifests for pairs that have true body conflicts. Semantics:

- `conflicts`: Skills are mutually exclusive (can never coexist). CI skips these.
- `incompatible_with`: Skills CAN coexist but require manual merge. CI skips these too.

**5 pairs to mark:**

| Skill A | Skill B | Conflict |
|---------|---------|----------|
| discord | telegram | Both replace whatsapp init block in index.ts |
| discord | gmail | Both append tests at EOF in routing.test.ts |
| gmail | telegram | Both add JID tests at same positions in routing.test.ts |
| voice-recognition | voice-transcription | Both modify transcription block in whatsapp.ts |
| voice-recognition | voice-transcription-elevenlabs | Same as above |

**Implementation:**
- Add `incompatible_with` field to `SkillManifest` type
- Update `extractOverlapInfo` to include it
- Update `computeOverlapMatrix` to skip pairs where either declares the other incompatible
- Add field to relevant manifests

### Part 2: Fix Category B failures (8 pairs)

These merge cleanly but fail at compile/runtime. Debug each:

1. **Reactions pairs (7)**: Investigate why reactions modify files cause failures after clean merge. Likely issues: wrong code in modify files, missing type exports, stale content.
2. **shabbat-mode + telegram**: Investigate separately — may be npm or compile issue.

### Part 3: Upstream channel registry PR (separate)

Submit a PR to `qwibitai/nanoclaw` that refactors `src/index.ts` to use a channel registration pattern. This eliminates 3 of the 5 `incompatible_with` entries long-term (discord+telegram, discord+gmail, gmail+telegram).

**Scope:** `src/index.ts` and `src/types.ts` only. Add `registerChannel(name, factory)` helper. WhatsApp uses the same pattern.

## Success criteria

- CI matrix skips 5 incompatible pairs
- Remaining 10 pairs (including gmail+shabbat which already passes) all pass CI
- Upstream PR submitted separately
