# Feature Request: Filesystem Watcher for Skills Directory

**Date:** 2026-02-24
**Status:** new
**Requested by:** Yonatan
**Priority:** nice-to-have

## Problem

Currently, agents need to poll the `/home/node/.claude/skills` directory to detect when new capabilities are added. This is inefficient and creates unnecessary load.

**Current workaround:** Scheduled task that runs every hour, calculates MD5 hash of skills directory, and compares to stored value.

## Proposed Solution

Implement a native filesystem watcher service that monitors the skills directory and notifies agents when changes occur. Three options considered below; IPC Event Stream is recommended.

### Option 1: IPC Event Stream (Recommended)
```json
{
  "type": "skills_changed",
  "timestamp": "2026-02-24T13:00:00Z",
  "changed_files": [
    "/home/node/.claude/skills/whatsapp/react-support.md"
  ],
  "event_type": "created"
}
```

Host service uses `inotifywait` to monitor `/home/node/.claude/skills` and publishes change events to `/workspace/ipc/events/skills-*.json`.

### Option 2: Webhook System
When skills change, trigger a webhook that spawns an agent with context about what changed.

### Option 3: Notification File
Write to `/workspace/ipc/notifications/skills_updated.flag` with timestamp when skills change. Agents can check this file (much cheaper than hashing entire directory).

## Alternatives Considered

- **Polling (current approach):** Works but wastes resources and has up to 1-hour delay.
- **Webhook system:** More complex infrastructure for marginal benefit over IPC events.
- **Notification file:** Simpler than IPC events but still requires polling the flag file.

## Acceptance Criteria

- [ ] Skills directory changes are detected within seconds
- [ ] Agent receives notification with details of what changed
- [ ] No polling overhead — event-driven only
- [ ] Works for CREATE, MODIFY, and DELETE events
- [ ] Extensible to monitor other directories

## Technical Notes

- `inotify` is already available in Linux kernel
- `inotifywait` from `inotify-tools` package is standard tool
- Low overhead — event-driven, no polling
- Can filter to specific event types (CREATE, MODIFY, DELETE)
- Pattern could extend to monitoring `registered_groups.json`, config files, scheduled task definitions

## Related

Use case example: User says "Message me once WhatsApp reaction support is added." With this feature, the agent gets notified instantly instead of discovering it up to an hour later via polling.
