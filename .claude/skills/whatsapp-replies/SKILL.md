---
name: whatsapp-replies
description: "TODO: Add description"
---

# whatsapp-replies

TODO: Describe what this skill does.

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `whatsapp-replies` is in `applied_skills`, skip to Phase 4 (Verify).

## Phase 2: Apply Code Changes

### Apply the skill

```bash
npm run apply-skills
```

TODO: Document any post-apply steps (migrations, config, etc.)

### Validate code changes

```bash
npm test
npm run build
```

## Phase 3: Build and Restart

```bash
npm run build
```

Linux:
```bash
systemctl --user restart nanoclaw
```

macOS:
```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

## Phase 4: Verify

TODO: Add verification steps.

## Troubleshooting

TODO: Add common issues and solutions.
