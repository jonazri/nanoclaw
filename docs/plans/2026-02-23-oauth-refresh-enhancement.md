# OAuth Token Refresh Enhancement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the OAuth refresh script actually refresh expired tokens instead of copying stale ones.

**Architecture:** Move `scripts/refresh-oauth.sh` to `scripts/oauth/refresh.sh`. Add expiry-aware logic: if the token in `~/.claude/.credentials.json` is still fresh, copy it to `.env`; if expired, run `claude -p "ok" --no-session-persistence` to trigger the CLI's internal refresh, then copy the new token. Update all references in TypeScript and container skill.

**Tech Stack:** Bash, Node.js/TypeScript (vitest), systemd timers

---

### Task 1: Create `scripts/oauth/refresh.sh` with expiry-aware logic

**Files:**
- Create: `scripts/oauth/refresh.sh`
- Delete: `scripts/refresh-oauth.sh`

**Step 1: Create the new script**

Create `scripts/oauth/refresh.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(dirname "$(realpath "$0")")"
PROJECT_ROOT="$(realpath "$SCRIPT_DIR/../..")"
CREDENTIALS="$HOME/.claude/.credentials.json"
DOTENV="$PROJECT_ROOT/.env"
LOGFILE="$PROJECT_ROOT/logs/oauth-refresh.log"
TIMER_NAME="nanoclaw-oauth-refresh-next"
BUFFER_MS=$((5 * 60 * 1000))  # 5 minutes

log() {
  echo "$(date -Iseconds) $*" >> "$LOGFILE"
}

# --- Read credentials ---
if [[ ! -f "$CREDENTIALS" ]]; then
  log "ERROR: $CREDENTIALS not found"
  exit 1
fi

access_token=$(jq -r '.claudeAiOauth.accessToken' "$CREDENTIALS")
expires_at=$(jq -r '.claudeAiOauth.expiresAt' "$CREDENTIALS")

if [[ -z "$access_token" || "$access_token" == "null" ]]; then
  log "ERROR: no accessToken in credentials"
  exit 1
fi

now_ms=$(($(date +%s) * 1000))
remaining_ms=$((expires_at - now_ms))

# --- Refresh if expired or expiring within buffer ---
if (( remaining_ms <= BUFFER_MS )); then
  log "Token expired or expiring soon (remaining_ms=$remaining_ms), invoking claude CLI to refresh"

  # Find claude binary — check PATH, then common locations
  CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
  if [[ -z "$CLAUDE_BIN" ]]; then
    for candidate in "$HOME/.claude/local/claude" "$HOME/.local/bin/claude"; do
      if [[ -x "$candidate" ]]; then
        CLAUDE_BIN="$candidate"
        break
      fi
    done
  fi

  if [[ -z "$CLAUDE_BIN" ]]; then
    log "ERROR: claude binary not found in PATH or common locations"
    exit 1
  fi

  if "$CLAUDE_BIN" -p "ok" --no-session-persistence 2>>"$LOGFILE" >/dev/null; then
    log "Claude CLI refreshed token successfully"
    # Re-read credentials after CLI refresh
    access_token=$(jq -r '.claudeAiOauth.accessToken' "$CREDENTIALS")
    expires_at=$(jq -r '.claudeAiOauth.expiresAt' "$CREDENTIALS")

    if [[ -z "$access_token" || "$access_token" == "null" ]]; then
      log "ERROR: no accessToken after CLI refresh"
      exit 1
    fi
  else
    log "ERROR: claude CLI refresh failed (exit $?). User may need to run 'claude login'."
    exit 1
  fi
else
  log "Token still fresh (remaining_ms=$remaining_ms), syncing to .env"
fi

# --- Update .env ---
if grep -q '^CLAUDE_CODE_OAUTH_TOKEN=' "$DOTENV" 2>/dev/null; then
  sed -i "s|^CLAUDE_CODE_OAUTH_TOKEN=.*|CLAUDE_CODE_OAUTH_TOKEN=${access_token}|" "$DOTENV"
else
  echo "CLAUDE_CODE_OAUTH_TOKEN=${access_token}" >> "$DOTENV"
fi
log "Updated .env with token (expires_at=$expires_at)"

# --- Schedule next run ---
systemctl --user stop "$TIMER_NAME.timer" 2>/dev/null || true
systemctl --user reset-failed "$TIMER_NAME.service" 2>/dev/null || true

now_ms=$(($(date +%s) * 1000))
remaining_ms=$((expires_at - now_ms))
schedule_buffer_ms=$((30 * 60 * 1000))

if (( remaining_ms > schedule_buffer_ms )); then
  next_run_ms=$((expires_at - schedule_buffer_ms))
else
  next_run_ms=$((now_ms + 5 * 60 * 1000))
  log "WARN: token expires in <30 min, scheduling retry in 5 min"
fi

next_run_sec=$((next_run_ms / 1000))
next_run_time=$(date -d "@$next_run_sec" -Iseconds)

if systemd-run --user \
  --unit="$TIMER_NAME" \
  --on-calendar="$(date -d "@$next_run_sec" '+%Y-%m-%d %H:%M:%S')" \
  --description="NanoClaw OAuth token refresh" \
  "$(realpath "$0")"; then
  log "Scheduled next refresh at $next_run_time"
else
  log "ERROR: systemd-run failed (exit $?), next refresh NOT scheduled"
fi
```

**Step 2: Make it executable and delete the old script**

Run: `chmod +x scripts/oauth/refresh.sh && rm scripts/refresh-oauth.sh`

**Step 3: Commit**

```bash
git add scripts/oauth/refresh.sh
git rm scripts/refresh-oauth.sh
git commit -m "feat: expiry-aware OAuth refresh with claude CLI fallback

Moves scripts/refresh-oauth.sh → scripts/oauth/refresh.sh.
When the token is still fresh, copies it to .env as before.
When expired, runs 'claude -p ok --no-session-persistence' to
trigger the CLI's internal token refresh, then copies the new token."
```

---

### Task 2: Create `scripts/oauth/README.md`

**Files:**
- Create: `scripts/oauth/README.md`

**Step 1: Write the documentation**

```markdown
# OAuth Token Refresh

Keeps the Claude API OAuth token in `.env` in sync with `~/.claude/.credentials.json`.

## How it works

Claude Code CLI manages OAuth credentials at `~/.claude/.credentials.json`, which contains:

- `accessToken` — short-lived (~8h), used for API calls
- `refreshToken` — long-lived, used by the CLI to obtain new access tokens
- `expiresAt` — epoch milliseconds when the access token expires

NanoClaw containers don't have access to this file. Instead, the host copies the access token
into `.env` (as `CLAUDE_CODE_OAUTH_TOKEN`), which gets mounted into containers.

### Refresh logic (`refresh.sh`)

1. Read `expiresAt` from credentials
2. **Token fresh** (>5 min remaining) → copy `accessToken` to `.env`, schedule next run
3. **Token expired** → run `claude -p "ok" --no-session-persistence` to trigger the CLI's
   internal refresh, re-read the updated credentials, copy to `.env`
4. **CLI refresh fails** → log error and exit (user needs `claude login`)

### Scheduling

The script schedules its own next run via `systemd-run --user`:
- Normal: 30 minutes before token expiry
- Token nearly expired: retry in 5 minutes

### Entry points

The script is invoked from three places:

| Caller | When | File |
|--------|------|------|
| Pre-flight check | Before each container spawn | `src/oauth.ts` |
| Auth error retry | After 401 from container | `src/index.ts`, `src/task-scheduler.ts` |
| IPC trigger | Container requests refresh | `src/ipc.ts` |

### Logs

All operations log to `logs/oauth-refresh.log`.

### Manual refresh

Run the script directly:

    bash scripts/oauth/refresh.sh

Or trigger from inside a container via IPC:

    echo '{"type":"refresh_oauth"}' > /workspace/ipc/tasks/refresh-oauth-$(date +%s).json
```

**Step 2: Commit**

```bash
git add scripts/oauth/README.md
git commit -m "docs: add README for OAuth refresh mechanism"
```

---

### Task 3: Update TypeScript references

**Files:**
- Modify: `src/oauth.ts:49` — update script path
- Modify: `src/ipc.ts:396` — update script path

**Step 1: Update `src/oauth.ts`**

Change line 49 from:
```typescript
const script = path.join(process.cwd(), 'scripts', 'refresh-oauth.sh');
```
to:
```typescript
const script = path.join(process.cwd(), 'scripts', 'oauth', 'refresh.sh');
```

**Step 2: Update `src/ipc.ts`**

Change line 396 from:
```typescript
const script = path.join(process.cwd(), 'scripts', 'refresh-oauth.sh');
```
to:
```typescript
const script = path.join(process.cwd(), 'scripts', 'oauth', 'refresh.sh');
```

**Step 3: Build to verify no errors**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 4: Commit**

```bash
git add src/oauth.ts src/ipc.ts
git commit -m "refactor: update OAuth refresh script path to scripts/oauth/"
```

---

### Task 4: Update container skill docs

**Files:**
- Modify: `container/skills/refresh-oauth/SKILL.md:20`

**Step 1: Update the skill description**

The container skill doesn't reference the script path directly (it uses IPC), but update the description to explain that the host now actually refreshes expired tokens:

Change line 20 from:
```
The host picks this up within a few seconds, syncs the latest token from `~/.claude/.credentials.json` into `.env`, and reschedules the next refresh.
```
to:
```
The host picks this up within a few seconds. If the token is still fresh, it syncs it from `~/.claude/.credentials.json` into `.env`. If expired, it invokes the Claude CLI to refresh the token first, then syncs the new one. See `scripts/oauth/README.md` for details.
```

**Step 2: Commit**

```bash
git add container/skills/refresh-oauth/SKILL.md
git commit -m "docs: update refresh-oauth skill to reflect new refresh behavior"
```

---

### Task 5: Verify end-to-end

**Step 1: Run the build**

Run: `npm run build`
Expected: Clean build.

**Step 2: Run existing tests**

Run: `npm test`
Expected: All existing tests pass (no regressions from path changes).

**Step 3: Dry-run the script**

Run: `bash scripts/oauth/refresh.sh`
Expected: Logs to `logs/oauth-refresh.log` showing either "Token still fresh, syncing to .env" or "invoking claude CLI to refresh".

**Step 4: Verify .env was updated**

Run: `grep CLAUDE_CODE_OAUTH_TOKEN .env | head -c 40`
Expected: `CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...`

**Step 5: Commit any remaining changes (if needed)**
