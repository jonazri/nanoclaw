# Feature Request: OAuth Token Refresh Reliability & Auto-Recovery

**Date:** 2026-02-25
**Status:** implemented
**Requested by:** Yonatan Azrielant (following 7-hour outage incident)
**Priority:** critical

## Problem

The system experienced a 7-hour outage (12:45am-8:09am on 2026-02-25) due to OAuth token expiry and failed refresh mechanism. The root cause analysis revealed:

1. **systemd-run dependency failure**: OAuth refresh script (`scripts/oauth/refresh.sh`) uses `systemd-run` to schedule the next refresh. When this command fails (exit code 1), no future refresh is scheduled, leaving the token to expire without any recovery mechanism.

2. **Passive recovery model**: After exhausting MAX_RETRIES (5 attempts with exponential backoff), the system drops messages and waits indefinitely for new incoming messages to trigger retry, rather than actively attempting to recover.

3. **No alerting**: OAuth refresh failures are logged but do not notify the user, allowing silent failures to persist for hours.

4. **Limited retry logic**: While the system correctly detects OAuth 401 errors and retries with exponential backoff, it doesn't attempt to refresh the token immediately on first OAuth failure - it just keeps retrying with the expired token.

**Impact:**
- User messages queued for 7 hours without processing
- No automatic recovery until process restart (systemd watchdog)
- User intervention required to restore service
- No visibility into the failure until user explicitly asked about status

## Proposed Solution

### 1. Replace systemd-run with Native Node.js Scheduling

**Remove dependency on `systemd-run`** and implement token refresh scheduling directly in Node.js:

```javascript
// In scripts/oauth/refresh.sh equivalent or new oauth-manager.ts
function scheduleTokenRefresh(expiresAt: number) {
  const now = Date.now();
  const timeUntilExpiry = expiresAt - now;
  const refreshTime = timeUntilExpiry - (5 * 60 * 1000); // 5 min before expiry

  if (refreshTime <= 0) {
    // Token already expired or about to expire, refresh immediately
    return refreshTokenNow();
  }

  // Use setTimeout for in-process scheduling
  setTimeout(async () => {
    try {
      await refreshTokenNow();
    } catch (error) {
      console.error('Token refresh failed, scheduling retry in 5 minutes', error);
      setTimeout(() => scheduleTokenRefresh(expiresAt), 5 * 60 * 1000);
    }
  }, refreshTime);
}
```

**Benefits:**
- No external command dependencies
- Cross-platform compatibility (works on Windows, macOS, Linux)
- Guaranteed scheduling (no systemd errors)
- Built-in fallback on failure

### 2. Immediate Token Refresh on First OAuth 401

Modify container spawn logic to attempt token refresh immediately when OAuth 401 is detected:

```javascript
// In src/container/spawn.ts or similar
async function handleOAuthError(error: any) {
  if (error.status === 401 || error.message?.includes('OAuth token')) {
    console.log('OAuth 401 detected, attempting immediate token refresh...');

    try {
      await refreshOAuthToken();
      console.log('Token refreshed successfully, retrying operation...');
      return { shouldRetry: true, delay: 0 };
    } catch (refreshError) {
      console.error('Token refresh failed, falling back to exponential backoff', refreshError);
      return { shouldRetry: true, delay: 5000 }; // Start exponential backoff
    }
  }
}
```

**Benefits:**
- Faster recovery (immediate vs waiting through retries)
- Reduces message processing delay
- Distinguishes between token expiry and other auth issues

### 3. Active Recovery Loop

After exhausting MAX_RETRIES, implement an active recovery loop instead of passive waiting:

```javascript
// After MAX_RETRIES exceeded
async function activeRecoveryLoop(intervalMinutes = 30) {
  console.log(`Max retries exceeded, entering active recovery mode (retry every ${intervalMinutes} min)`);

  const recoveryInterval = setInterval(async () => {
    try {
      console.log('Active recovery: attempting token refresh...');
      await refreshOAuthToken();

      // Token refreshed successfully, retry processing queued messages
      console.log('Token refresh successful, retrying queued messages...');
      clearInterval(recoveryInterval);
      await retryQueuedMessages();

    } catch (error) {
      console.error('Active recovery attempt failed, will retry in', intervalMinutes, 'minutes', error);
      // Continue loop
    }
  }, intervalMinutes * 60 * 1000);
}
```

**Benefits:**
- Self-healing system
- Reduces MTTR (Mean Time To Recovery)
- No user intervention required
- Configurable retry interval

### 4. Alert on OAuth Failures

Send notifications to main channel when OAuth refresh fails:

```javascript
// After OAuth refresh failure
async function alertOAuthFailure(error: Error, attemptCount: number) {
  const message = `🔴 *OAuth Token Refresh Failed* (attempt ${attemptCount})

Error: ${error.message}

System will retry automatically. If this persists, manual intervention may be required.

Time: ${new Date().toISOString()}`;

  await sendToMainChannel(message);
}
```

**Alert triggers:**
- First OAuth refresh failure (immediate notification)
- After 3 consecutive failures (escalation)
- After entering active recovery mode (status update)
- When recovery succeeds (all-clear notification)

**Benefits:**
- User visibility into system health
- Early warning of issues
- Audit trail of failures

### 5. Enhanced ensureTokenFresh()

Improve the token freshness check to handle already-expired tokens:

```javascript
async function ensureTokenFresh() {
  const token = readOAuthToken();
  const now = Date.now();

  // If token is expired or about to expire (within 5 min), refresh immediately
  if (token.expires_at <= now || token.expires_at - now < 5 * 60 * 1000) {
    console.log('Token expired or expiring soon, refreshing immediately...');

    try {
      await refreshOAuthToken();
    } catch (error) {
      console.error('Failed to refresh expired token', error);
      throw new Error('Cannot proceed with expired OAuth token');
    }
  }
}
```

**Benefits:**
- Proactive token refresh before container spawn
- Prevents starting operations with expired tokens
- Clear error messaging when refresh fails

## Alternatives Considered

### Alternative 1: Cron-based scheduling
Use cron jobs instead of systemd-run for token refresh scheduling.

**Pros:**
- Widely supported across platforms
- Independent of Node.js process lifecycle

**Cons:**
- Still external dependency (cron daemon)
- Harder to manage dynamically (requires crontab updates)
- Not portable to Windows without additional tools

**Why not chosen:** Native Node.js scheduling is simpler and more portable.

### Alternative 2: Keep systemd-run with fallback
Keep using systemd-run but add setTimeout as fallback when it fails.

**Pros:**
- Minimal code changes
- Preserves existing architecture

**Cons:**
- Maintains problematic dependency
- More complex error handling
- Doesn't solve root cause

**Why not chosen:** Better to eliminate the problematic dependency entirely.

### Alternative 3: External monitoring service
Use external service (like UptimeRobot) to detect downtime and restart.

**Pros:**
- Independent monitoring
- Can alert via multiple channels

**Cons:**
- Requires external dependency
- Reactive (detects after failure) not proactive
- Doesn't solve underlying OAuth issue

**Why not chosen:** System should be self-healing without external dependencies.

## Acceptance Criteria

- [x] OAuth token refresh does NOT depend on systemd-run (uses native Node.js scheduling)
- [x] On first OAuth 401 error, system attempts immediate token refresh before retry loop
- [x] After MAX_RETRIES exceeded, system enters active recovery mode with configurable retry interval (default 30min)
- [x] OAuth refresh failures send alerts to main channel
- [x] ensureTokenFresh() refreshes immediately if token is already expired
- [x] System can recover from OAuth expiry without user intervention
- [x] All OAuth-related errors are logged with timestamps and context
- [x] Recovery success notifications sent to main channel
- [x] No message loss during OAuth failures (messages queued and retried)
- [ ] Documentation updated with OAuth troubleshooting guide

## Technical Notes

### Relevant Files

1. **scripts/oauth/refresh.sh** - Current refresh script using systemd-run
   - Line 112: `systemd-run` command that's failing
   - Replace with Node.js scheduling

2. **src/container/spawn.ts** (or wherever container OAuth logic lives)
   - Add immediate token refresh on OAuth 401
   - Implement active recovery loop
   - Add alerting logic

3. **src/oauth/token-manager.ts** (or equivalent)
   - Implement native Node.js scheduling
   - Enhanced ensureTokenFresh()
   - Token lifecycle management

### Implementation Sequence

1. **Phase 1: Immediate fixes (critical)**
   - Implement immediate token refresh on first OAuth 401
   - Add OAuth failure alerting to main channel
   - Deploy to production

2. **Phase 2: Scheduling replacement (important)**
   - Replace systemd-run with native Node.js scheduling
   - Test thoroughly across platforms
   - Deploy to production

3. **Phase 3: Active recovery (important)**
   - Implement active recovery loop after MAX_RETRIES
   - Add configurable retry intervals
   - Deploy to production

4. **Phase 4: Monitoring & documentation (nice-to-have)**
   - Add OAuth health metrics dashboard
   - Write troubleshooting guide
   - Document token lifecycle

### Configuration Options

Add to `settings.json` or environment variables:

```json
{
  "oauth": {
    "refreshMarginMinutes": 5,
    "activeRecoveryIntervalMinutes": 30,
    "maxRetries": 5,
    "alertOnFirstFailure": true,
    "alertOnRecoverySuccess": true
  }
}
```

### Testing Strategy

1. **Unit tests:**
   - Token expiry detection
   - Refresh scheduling logic
   - Error handling paths

2. **Integration tests:**
   - Simulate token expiry
   - Verify automatic refresh
   - Test recovery loop
   - Verify alerting

3. **Load tests:**
   - Multiple concurrent OAuth failures
   - Recovery under load
   - Message queue integrity

### Monitoring

Add metrics for:
- Token refresh success/failure rate
- Time between expiry and refresh
- Recovery time after failure
- OAuth 401 error count
- Active recovery loop activations

### Backwards Compatibility

- Keep existing environment variables for OAuth credentials
- Maintain same token storage format
- Preserve existing error handling where possible
- Add feature flags for gradual rollout

### Security Considerations

- Never log OAuth tokens or credentials
- Secure token storage (existing pattern)
- Rate limit token refresh attempts to prevent API abuse
- Alert on suspicious refresh patterns (e.g., rapid repeated failures)

## Implementation Notes

**Implemented:** 2026-02-25
**Commits:** 05af589, bd4dd6c, plus recovery notification enhancement
**Summary:** Replaced systemd-run scheduling with in-process Node.js token lifecycle manager, fixed false-positive auth error detection, added dead container guards, periodic message recovery, and recovery alerting.

**Scope (implemented):**
- Native Node.js token refresh scheduler (`startTokenRefreshScheduler` in `oauth.ts`) — schedules refresh 30min before expiry, retries every 5min on failure
- Stripped systemd-run from `refresh.sh` — script now only refreshes token and updates `.env`
- Fixed false-positive auth error detection in `container-runner.ts` — was matching agent conversation text instead of actual SDK errors
- Fixed zombie containers — uses `docker stop` instead of SIGTERM to docker CLI client
- Dead container guard in `group-queue.ts` — prevents piping to exited processes
- Periodic message recovery every 60s via IPC tick
- Timeout (60s) on refresh script execution
- Recovery notification ("Services restored") when scheduler recovers after failure

**Scope (deferred):**
- Escalating backoff on scheduler failure (flat 5min retry is sufficient)
- OAuth health metrics dashboard
- Troubleshooting documentation

**Files changed:**
- `src/oauth.ts` — Added `startTokenRefreshScheduler()` with recovery alerting
- `src/container-runner.ts` — Fixed false-positive auth detection (check `parsed.error` not `parsed.result`), proper `docker stop`
- `src/index.ts` — Startup integration for token scheduler, pass `recoverPendingMessages` to IPC
- `src/group-queue.ts` — Dead container guard in `sendMessage()`
- `src/ipc.ts` — Periodic message recovery tick, timeout on IPC refresh
- `scripts/oauth/refresh.sh` — Removed systemd-run scheduling section

## Related

This request addresses the root causes identified in the 2026-02-25 overnight outage incident. See root cause analysis for full details.
