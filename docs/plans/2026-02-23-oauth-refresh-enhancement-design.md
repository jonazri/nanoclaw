# OAuth Token Refresh Enhancement

## Problem

`scripts/refresh-oauth.sh` only copies the existing access token from `~/.claude/.credentials.json` to `.env`. When the token expires, the script loops copying the same stale token — it never actually refreshes. Users must manually run `claude login` to recover.

## Design

### New refresh logic

Move from a blind copy to an expiry-aware refresh:

1. Read `expiresAt` from `~/.claude/.credentials.json`
2. If token is still fresh (>5 min remaining): copy `accessToken` to `.env`, schedule next run
3. If token is expired or expiring soon: run `claude -p "ok" --no-session-persistence` to trigger the CLI's internal token refresh, then re-read the now-updated credentials and copy to `.env`
4. If the CLI refresh fails: log the error (user needs `claude login`)

### File reorganization

Move `scripts/refresh-oauth.sh` → `scripts/oauth/refresh.sh` and add `scripts/oauth/README.md` documenting the mechanism.

### Updated references

- `src/oauth.ts` — update script path
- `src/ipc.ts` — update script path
- `container/skills/refresh-oauth/SKILL.md` — no change needed (container triggers IPC, host resolves path)

### Token lifecycle

```
Claude CLI manages ~/.claude/.credentials.json
  ├── accessToken (short-lived, ~8h)
  ├── refreshToken (long-lived)
  └── expiresAt (epoch ms)

NanoClaw syncs accessToken → .env → data/env/env → container
  ├── Pre-flight check before each container spawn (src/oauth.ts)
  ├── Retry-on-auth-error with refresh (src/index.ts, src/task-scheduler.ts)
  ├── IPC trigger from container (src/ipc.ts)
  └── Scheduled systemd timer (scripts/oauth/refresh.sh)
```

### Trade-offs

- `claude -p "ok"` costs one minimal API call but avoids reverse-engineering Anthropic's OAuth endpoint
- The CLI handles refresh internally on startup, so this piggybacks on that
- Only invoked when token is actually expired — fresh tokens just get copied
