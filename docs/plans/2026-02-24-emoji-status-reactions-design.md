# Emoji Status Reactions

React to user messages with emoji to indicate processing status in real time.

## Scope

Main chat only. No emoji status reactions in group chats.

## Status Lifecycle

| Emoji | State | Trigger Point | Code Location |
|-------|-------|--------------|---------------|
| 👀 | RECEIVED | Message seen in poll loop | `startMessageLoop()` — main-chat messages detected |
| 💭 | THINKING | Container spawning | `processGroupMessages()` — before `runAgent()` |
| 🔄 | WORKING | First streaming output | `onOutput` callback — first non-null `result.result` |
| ✅ | DONE | Processing complete | After `runAgent()` returns success |
| ❌ | FAILED | Error/crash | Error paths + startup recovery |

Per-message tracking: each incoming user message gets 👀 immediately. Batch processing transitions 💭/🔄/✅/❌ react to the last message in the batch. Earlier messages keep 👀 and get cleared to ✅ on completion.

## Atomicity and Race Protection

### Race conditions addressed

1. **Out-of-order delivery**: Rapid state transitions could cause slow reactions to land at WhatsApp after fast ones.
2. **Concurrent batches**: Message A processing starts, user sends B piped to active container — both tracked independently.
3. **Recovery vs normal flow**: Container crashes, recovery and error handler both try ❌.
4. **Message loop vs processGroupMessages**: 2s poll loop and processing run concurrently.

### Monotonic state machine with serialized sends

State transitions are forward-only:

```
RECEIVED(0) → THINKING(1) → WORKING(2) → DONE(3)
                                        → FAILED(3)
Any non-terminal state → FAILED(3)
```

Core principles:

1. **Synchronous state gate, async send queue.** In-memory `Map<messageId, TrackedMessage>` is source of truth, mutated synchronously. Each `mark*()` call reads current state, validates the transition (forward-only), updates the map, then enqueues the reaction send onto a per-message promise chain.

2. **Per-message promise chain.** Each tracked message has a `sendChain: Promise<void>`. New sends chain onto it: `msg.sendChain = msg.sendChain.then(() => sendReaction(...))`. Guarantees WhatsApp receives reactions in order.

3. **Transition validation.** Numeric ordering: RECEIVED=0, THINKING=1, WORKING=2, DONE=3, FAILED=3. Transition valid only if `newState > currentState`. Makes races harmless — duplicate ❌ is a no-op, stale 💭 after ✅ is rejected.

4. **Persistence is fire-and-forget.** Write `data/status-tracker.json` after each state change, don't await. On crash, recovery treats any non-terminal state as failed.

5. **Cleanup after terminal states.** Messages reaching DONE or FAILED are removed from the map after 5s delay to prevent unbounded growth.

## Recovery and Heartbeat

### Startup recovery

When orchestrator starts, before message loop begins:

1. Read `data/status-tracker.json`
2. For every entry in non-terminal state (RECEIVED, THINKING, WORKING): transition to FAILED(❌) and send error message to main chat: `"[system] Restarted — reprocessing your message."`
3. Clear the persistence file
4. Proceed with existing `recoverPendingMessages()` (re-enqueues unprocessed messages, starting a new 👀→✅ cycle)

### Heartbeat via IPC poll (every 1s)

Piggybacks on the existing `processIpcFiles()` cycle. At end of each poll:

- For each tracked message in THINKING or WORKING state:
  - Is the group's container still alive? (check GroupQueue state)
  - If dead and status not updated → FAILED(❌) + error message
  - If tracked > CONTAINER_TIMEOUT without progressing → FAILED(❌) + "timed out"

Catches zombie scenarios (OOM kill, Docker daemon crash) that bypass normal error paths.

### Graceful shutdown

No special handling. Persistence file is current. Restart recovery handles orphaned states.

### Error messages

| Scenario | Message |
|----------|---------|
| Startup recovery | `"[system] Restarted — reprocessing your message."` |
| Container crash | `"[system] Task crashed — retrying."` |
| Container timeout | `"[system] Task timed out — retrying."` |
| Max retries exceeded | `"[system] Failed after multiple retries. Send your message again to retry."` |

## Integration Points

### New file

`src/status-tracker.ts` — StatusTracker class with dependency injection:

```typescript
interface StatusTrackerDeps {
  sendReaction: (chatJid: string, messageKey: MessageKey, emoji: string) => Promise<void>;
  sendMessage: (chatJid: string, text: string) => Promise<void>;
  isMainGroup: (chatJid: string) => boolean;
  isContainerAlive: (chatJid: string) => boolean;
}
```

### Hook points in `src/index.ts`

1. **👀 RECEIVED** — `startMessageLoop()` inside `for (const [chatJid, groupMessages])` loop, for main group messages only.
2. **💭 THINKING** — `processGroupMessages()` before `runAgent()`, on last message in batch.
3. **🔄 WORKING** — `processGroupMessages()` onOutput callback, on first non-null result.
4. **✅ DONE** — `processGroupMessages()` after successful `runAgent()` return.
5. **❌ FAILED** — `processGroupMessages()` error branches.
6. **Recovery** — `main()` after `loadState()`, before `recoverPendingMessages()`.

### Hook point in `src/ipc.ts`

Heartbeat check at end of `processIpcFiles()` cycle.

### Files NOT modified

`whatsapp.ts`, `types.ts`, `router.ts`, `db.ts`, `group-queue.ts`, `container-runner.ts`. The StatusTracker is purely additive.
