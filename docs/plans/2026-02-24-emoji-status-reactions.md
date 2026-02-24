# Emoji Status Reactions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** React to user messages with emoji (👀💭🔄✅❌) to show real-time processing status, with crash recovery and heartbeat monitoring.

**Architecture:** New `StatusTracker` class with monotonic state machine and serialized per-message promise chains. Hooks into existing lifecycle in `index.ts` and `ipc.ts`. Main chat only. Persists in-flight state to `data/status-tracker.json` for crash recovery.

**Tech Stack:** TypeScript, Vitest, existing WhatsApp reaction APIs

---

### Task 1: StatusTracker core — state machine with forward-only transitions

**Files:**
- Create: `src/status-tracker.ts`
- Create: `src/status-tracker.test.ts`

**Step 1: Write failing tests for state machine**

Create `src/status-tracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(() => '[]'),
      mkdirSync: vi.fn(),
    },
  };
});

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { StatusTracker, StatusState } from './status-tracker.js';

function makeDeps() {
  return {
    sendReaction: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    isMainGroup: vi.fn((jid: string) => jid === 'main@s.whatsapp.net'),
    isContainerAlive: vi.fn(() => true),
  };
}

describe('StatusTracker', () => {
  let tracker: StatusTracker;
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
    tracker = new StatusTracker(deps);
  });

  describe('forward-only transitions', () => {
    it('transitions RECEIVED → THINKING → WORKING → DONE', async () => {
      tracker.markReceived('msg1', 'main@s.whatsapp.net', false);
      tracker.markThinking('msg1');
      tracker.markWorking('msg1');
      tracker.markDone('msg1');

      // Wait for all reaction sends to complete
      await tracker.flush();

      expect(deps.sendReaction).toHaveBeenCalledTimes(4);
      const emojis = deps.sendReaction.mock.calls.map((c) => c[2]);
      expect(emojis).toEqual(['👀', '💭', '🔄', '✅']);
    });

    it('rejects backward transitions (WORKING → THINKING is no-op)', async () => {
      tracker.markReceived('msg1', 'main@s.whatsapp.net', false);
      tracker.markThinking('msg1');
      tracker.markWorking('msg1');

      const result = tracker.markThinking('msg1');
      expect(result).toBe(false);

      await tracker.flush();
      expect(deps.sendReaction).toHaveBeenCalledTimes(3);
    });

    it('rejects duplicate transitions (DONE → DONE is no-op)', async () => {
      tracker.markReceived('msg1', 'main@s.whatsapp.net', false);
      tracker.markDone('msg1');

      const result = tracker.markDone('msg1');
      expect(result).toBe(false);

      await tracker.flush();
      expect(deps.sendReaction).toHaveBeenCalledTimes(2);
    });

    it('allows FAILED from any non-terminal state', async () => {
      tracker.markReceived('msg1', 'main@s.whatsapp.net', false);
      tracker.markFailed('msg1');
      await tracker.flush();

      const emojis = deps.sendReaction.mock.calls.map((c) => c[2]);
      expect(emojis).toEqual(['👀', '❌']);
    });

    it('rejects FAILED after DONE', async () => {
      tracker.markReceived('msg1', 'main@s.whatsapp.net', false);
      tracker.markDone('msg1');

      const result = tracker.markFailed('msg1');
      expect(result).toBe(false);

      await tracker.flush();
      expect(deps.sendReaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('main group gating', () => {
    it('ignores messages from non-main groups', async () => {
      tracker.markReceived('msg1', 'group@g.us', false);
      await tracker.flush();
      expect(deps.sendReaction).not.toHaveBeenCalled();
    });
  });

  describe('unknown message handling', () => {
    it('returns false for transitions on untracked messages', () => {
      expect(tracker.markThinking('unknown')).toBe(false);
      expect(tracker.markWorking('unknown')).toBe(false);
      expect(tracker.markDone('unknown')).toBe(false);
      expect(tracker.markFailed('unknown')).toBe(false);
    });
  });

  describe('batch operations', () => {
    it('markAllDone transitions all tracked messages for a chatJid', async () => {
      tracker.markReceived('msg1', 'main@s.whatsapp.net', false);
      tracker.markReceived('msg2', 'main@s.whatsapp.net', false);
      tracker.markAllDone('main@s.whatsapp.net');
      await tracker.flush();

      const doneCalls = deps.sendReaction.mock.calls.filter((c) => c[2] === '✅');
      expect(doneCalls).toHaveLength(2);
    });

    it('markAllFailed transitions all tracked messages and sends error message', async () => {
      tracker.markReceived('msg1', 'main@s.whatsapp.net', false);
      tracker.markReceived('msg2', 'main@s.whatsapp.net', false);
      tracker.markAllFailed('main@s.whatsapp.net', 'Task crashed');
      await tracker.flush();

      const failCalls = deps.sendReaction.mock.calls.filter((c) => c[2] === '❌');
      expect(failCalls).toHaveLength(2);
      expect(deps.sendMessage).toHaveBeenCalledWith('main@s.whatsapp.net', '[system] Task crashed');
    });
  });

  describe('serialized sends', () => {
    it('sends reactions in order even when transitions are rapid', async () => {
      const order: string[] = [];
      deps.sendReaction.mockImplementation(async (_jid, _key, emoji) => {
        await new Promise((r) => setTimeout(r, Math.random() * 10));
        order.push(emoji);
      });

      tracker.markReceived('msg1', 'main@s.whatsapp.net', false);
      tracker.markThinking('msg1');
      tracker.markWorking('msg1');
      tracker.markDone('msg1');

      await tracker.flush();
      expect(order).toEqual(['👀', '💭', '🔄', '✅']);
    });
  });

  describe('cleanup', () => {
    it('removes terminal messages after delay', async () => {
      vi.useFakeTimers();
      tracker.markReceived('msg1', 'main@s.whatsapp.net', false);
      tracker.markDone('msg1');

      // Message should still be tracked
      expect(tracker.isTracked('msg1')).toBe(true);

      // Advance past cleanup delay
      vi.advanceTimersByTime(6000);

      expect(tracker.isTracked('msg1')).toBe(false);
      vi.useRealTimers();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/status-tracker.test.ts`
Expected: FAIL — module `./status-tracker.js` does not exist

**Step 3: Implement StatusTracker**

Create `src/status-tracker.ts`:

```typescript
import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { logger } from './logger.js';

export enum StatusState {
  RECEIVED = 0,
  THINKING = 1,
  WORKING = 2,
  DONE = 3,
  FAILED = 3,
}

const EMOJI: Record<number, string> = {
  [StatusState.RECEIVED]: '👀',
  [StatusState.THINKING]: '💭',
  [StatusState.WORKING]: '🔄',
};

const DONE_EMOJI = '✅';
const FAILED_EMOJI = '❌';

const CLEANUP_DELAY_MS = 5000;

interface MessageKey {
  id: string;
  remoteJid: string;
  fromMe?: boolean;
}

interface TrackedMessage {
  messageId: string;
  chatJid: string;
  fromMe: boolean;
  state: number;
  terminal: 'done' | 'failed' | null;
  sendChain: Promise<void>;
  trackedAt: number;
}

interface PersistedEntry {
  messageId: string;
  chatJid: string;
  fromMe: boolean;
  state: number;
  terminal: 'done' | 'failed' | null;
  trackedAt: number;
}

export interface StatusTrackerDeps {
  sendReaction: (
    chatJid: string,
    messageKey: MessageKey,
    emoji: string,
  ) => Promise<void>;
  sendMessage: (chatJid: string, text: string) => Promise<void>;
  isMainGroup: (chatJid: string) => boolean;
  isContainerAlive: (chatJid: string) => boolean;
}

export class StatusTracker {
  private tracked = new Map<string, TrackedMessage>();
  private deps: StatusTrackerDeps;
  private persistPath: string;

  constructor(deps: StatusTrackerDeps) {
    this.deps = deps;
    this.persistPath = path.join(DATA_DIR, 'status-tracker.json');
  }

  markReceived(messageId: string, chatJid: string, fromMe: boolean): boolean {
    if (!this.deps.isMainGroup(chatJid)) return false;
    if (this.tracked.has(messageId)) return false;

    const msg: TrackedMessage = {
      messageId,
      chatJid,
      fromMe,
      state: StatusState.RECEIVED,
      terminal: null,
      sendChain: Promise.resolve(),
      trackedAt: Date.now(),
    };

    this.tracked.set(messageId, msg);
    this.enqueueSend(msg, '👀');
    this.persist();
    return true;
  }

  markThinking(messageId: string): boolean {
    return this.transition(messageId, StatusState.THINKING, '💭');
  }

  markWorking(messageId: string): boolean {
    return this.transition(messageId, StatusState.WORKING, '🔄');
  }

  markDone(messageId: string): boolean {
    return this.transitionTerminal(messageId, 'done', DONE_EMOJI);
  }

  markFailed(messageId: string): boolean {
    return this.transitionTerminal(messageId, 'failed', FAILED_EMOJI);
  }

  markAllDone(chatJid: string): void {
    for (const [id, msg] of this.tracked) {
      if (msg.chatJid === chatJid && msg.terminal === null) {
        this.transitionTerminal(id, 'done', DONE_EMOJI);
      }
    }
  }

  markAllFailed(chatJid: string, errorMessage: string): void {
    let anyFailed = false;
    for (const [id, msg] of this.tracked) {
      if (msg.chatJid === chatJid && msg.terminal === null) {
        this.transitionTerminal(id, 'failed', FAILED_EMOJI);
        anyFailed = true;
      }
    }
    if (anyFailed) {
      this.deps.sendMessage(chatJid, `[system] ${errorMessage}`).catch((err) =>
        logger.error({ chatJid, err }, 'Failed to send status error message'),
      );
    }
  }

  isTracked(messageId: string): boolean {
    return this.tracked.has(messageId);
  }

  /** Wait for all pending reaction sends to complete. */
  async flush(): Promise<void> {
    const chains = Array.from(this.tracked.values()).map((m) => m.sendChain);
    await Promise.allSettled(chains);
  }

  /**
   * Startup recovery: read persisted state and mark all non-terminal entries as failed.
   * Call this before the message loop starts.
   */
  async recover(sendErrorMessage: boolean = true): Promise<void> {
    let entries: PersistedEntry[] = [];
    try {
      if (fs.existsSync(this.persistPath)) {
        const raw = fs.readFileSync(this.persistPath, 'utf-8');
        entries = JSON.parse(raw);
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to read status tracker persistence file');
      return;
    }

    const orphanedByChat = new Map<string, number>();
    for (const entry of entries) {
      if (entry.terminal !== null) continue;

      // Reconstruct tracked message for the reaction send
      const msg: TrackedMessage = {
        messageId: entry.messageId,
        chatJid: entry.chatJid,
        fromMe: entry.fromMe,
        state: entry.state,
        terminal: null,
        sendChain: Promise.resolve(),
        trackedAt: entry.trackedAt,
      };
      this.tracked.set(entry.messageId, msg);
      this.transitionTerminal(entry.messageId, 'failed', FAILED_EMOJI);
      orphanedByChat.set(entry.chatJid, (orphanedByChat.get(entry.chatJid) || 0) + 1);
    }

    if (sendErrorMessage) {
      for (const [chatJid, count] of orphanedByChat) {
        this.deps.sendMessage(
          chatJid,
          `[system] Restarted — reprocessing your message.`,
        ).catch((err) =>
          logger.error({ chatJid, err }, 'Failed to send recovery message'),
        );
      }
    }

    await this.flush();
    this.clearPersistence();
    logger.info({ recoveredCount: entries.filter((e) => e.terminal === null).length }, 'Status tracker recovery complete');
  }

  /**
   * Heartbeat: check for stale tracked messages where container has died.
   * Call this from the IPC poll cycle.
   */
  heartbeatCheck(): void {
    for (const [id, msg] of this.tracked) {
      if (msg.terminal !== null) continue;
      if (msg.state >= StatusState.THINKING && !this.deps.isContainerAlive(msg.chatJid)) {
        logger.warn({ messageId: id, chatJid: msg.chatJid }, 'Heartbeat: container dead, marking failed');
        this.markAllFailed(msg.chatJid, 'Task crashed — retrying.');
        return; // markAllFailed handles all messages for this chat
      }
    }
  }

  private transition(messageId: string, newState: number, emoji: string): boolean {
    const msg = this.tracked.get(messageId);
    if (!msg) return false;
    if (msg.terminal !== null) return false;
    if (newState <= msg.state) return false;

    msg.state = newState;
    this.enqueueSend(msg, emoji);
    this.persist();
    return true;
  }

  private transitionTerminal(messageId: string, terminal: 'done' | 'failed', emoji: string): boolean {
    const msg = this.tracked.get(messageId);
    if (!msg) return false;
    if (msg.terminal !== null) return false;

    msg.state = StatusState.DONE; // DONE and FAILED both = 3
    msg.terminal = terminal;
    this.enqueueSend(msg, emoji);
    this.persist();
    this.scheduleCleanup(messageId);
    return true;
  }

  private enqueueSend(msg: TrackedMessage, emoji: string): void {
    const key: MessageKey = {
      id: msg.messageId,
      remoteJid: msg.chatJid,
      fromMe: msg.fromMe,
    };
    msg.sendChain = msg.sendChain.then(async () => {
      try {
        await this.deps.sendReaction(msg.chatJid, key, emoji);
      } catch (err) {
        logger.error({ messageId: msg.messageId, emoji, err }, 'Failed to send status reaction');
      }
    });
  }

  private scheduleCleanup(messageId: string): void {
    setTimeout(() => {
      this.tracked.delete(messageId);
      this.persist();
    }, CLEANUP_DELAY_MS);
  }

  private persist(): void {
    try {
      const entries: PersistedEntry[] = [];
      for (const msg of this.tracked.values()) {
        entries.push({
          messageId: msg.messageId,
          chatJid: msg.chatJid,
          fromMe: msg.fromMe,
          state: msg.state,
          terminal: msg.terminal,
          trackedAt: msg.trackedAt,
        });
      }
      fs.mkdirSync(path.dirname(this.persistPath), { recursive: true });
      fs.writeFileSync(this.persistPath, JSON.stringify(entries));
    } catch (err) {
      logger.warn({ err }, 'Failed to persist status tracker state');
    }
  }

  private clearPersistence(): void {
    try {
      fs.writeFileSync(this.persistPath, '[]');
    } catch {
      // ignore
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/status-tracker.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/status-tracker.ts src/status-tracker.test.ts
git commit -m "feat: add StatusTracker with monotonic state machine and serialized sends"
```

---

### Task 2: Add `isActive()` to GroupQueue

**Files:**
- Modify: `src/group-queue.ts:29` (add method after class definition area)
- Modify: `src/group-queue.test.ts` (add test)

**Step 1: Write failing test**

Add to end of `src/group-queue.test.ts`:

```typescript
  describe('isActive', () => {
    it('returns false for unknown groups', () => {
      expect(queue.isActive('unknown@g.us')).toBe(false);
    });

    it('returns true when group has active container', async () => {
      let resolve: () => void;
      const block = new Promise<void>((r) => { resolve = r; });

      queue.setProcessMessagesFn(async () => {
        await block;
        return true;
      });
      queue.enqueueMessageCheck('group@g.us');

      // Let the microtask start running
      await vi.advanceTimersByTimeAsync(0);
      expect(queue.isActive('group@g.us')).toBe(true);

      resolve!();
      await vi.advanceTimersByTimeAsync(0);
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/group-queue.test.ts -t "isActive"`
Expected: FAIL — `queue.isActive is not a function`

**Step 3: Add isActive method to GroupQueue**

Add after the `closeStdin` method in `src/group-queue.ts` (after line 182):

```typescript
  /** Check if a group has an active container running. */
  isActive(groupJid: string): boolean {
    const state = this.groups.get(groupJid);
    return state?.active ?? false;
  }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/group-queue.test.ts -t "isActive"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/group-queue.ts src/group-queue.test.ts
git commit -m "feat: add isActive() to GroupQueue for status heartbeat"
```

---

### Task 3: Wire StatusTracker into the orchestrator

**Files:**
- Modify: `src/index.ts`

This task wires all 6 hook points: instantiation, 👀, 💭, 🔄, ✅, ❌, recovery.

**Step 1: Add import and instantiation**

At the top of `src/index.ts`, add import after line 43 (`import { Channel, NewMessage, RegisteredGroup } from './types.js';`):

```typescript
import { StatusTracker } from './status-tracker.js';
```

After line 61 (`const queue = new GroupQueue();`), add:

```typescript
let statusTracker: StatusTracker;
```

**Step 2: Initialize StatusTracker in main()**

In `main()`, after `loadState()` (line 512) and before `initShabbatSchedule()` (line 513), add the StatusTracker initialization. It must be created here because it needs `channels` and `queue` references that aren't available at module scope.

Insert after `loadState();`:

```typescript
  statusTracker = new StatusTracker({
    sendReaction: async (chatJid, messageKey, emoji) => {
      const channel = findChannel(channels, chatJid);
      if (!channel?.sendReaction) return;
      await channel.sendReaction(chatJid, messageKey, emoji);
    },
    sendMessage: async (chatJid, text) => {
      const channel = findChannel(channels, chatJid);
      if (!channel) return;
      await channel.sendMessage(chatJid, text);
    },
    isMainGroup: (chatJid) => {
      const group = registeredGroups[chatJid];
      return group?.folder === MAIN_GROUP_FOLDER;
    },
    isContainerAlive: (chatJid) => queue.isActive(chatJid),
  });
```

**Step 3: Wire recovery in main()**

After the StatusTracker initialization (step 2 above) and before `recoverPendingMessages()` (line 584), add:

```typescript
  await statusTracker.recover();
```

**Step 4: Wire 👀 RECEIVED in startMessageLoop()**

In `startMessageLoop()`, inside the `for (const [chatJid, groupMessages])` loop (line 419), after the trigger check block (after line 440: `if (!hasTrigger) continue;`), add:

```typescript
            // Mark each user message as received (main group only)
            for (const msg of groupMessages) {
              if (!msg.is_from_me && !msg.is_bot_message) {
                statusTracker.markReceived(msg.id, chatJid, !!msg.is_from_me);
              }
            }
```

**Step 5: Wire 💭 THINKING in processGroupMessages()**

In `processGroupMessages()`, right before `await channel.setTyping?.(chatJid, true);` (line 203), add:

```typescript
  // Mark last user message as thinking (container is spawning)
  const lastUserMsg = [...missedMessages].reverse().find((m) => !m.is_from_me && !m.is_bot_message);
  if (lastUserMsg) {
    statusTracker.markThinking(lastUserMsg.id);
  }
```

**Step 6: Wire 🔄 WORKING in onOutput callback**

In the `onOutput` callback inside `processGroupMessages()`, add a `firstOutputSeen` flag. Before the callback definition (before line 207), add:

```typescript
  let firstOutputSeen = false;
```

Inside the callback, after `if (result.result) {` (line 209) and before `const raw =` (line 210), add:

```typescript
      if (!firstOutputSeen) {
        firstOutputSeen = true;
        if (lastUserMsg) statusTracker.markWorking(lastUserMsg.id);
      }
```

**Step 7: Wire ✅ DONE on success**

After the error handling block, at line 256 (`// Success — clear pipe tracking`), before `delete cursorBeforePipe[chatJid];`, add:

```typescript
  statusTracker.markAllDone(chatJid);
```

**Step 8: Wire ❌ FAILED on error**

In the error branches of `processGroupMessages()`:

At line 243 (after `logger.warn({ group: group.name }, 'Agent error after output, rolled back piped messages for retry');`), add:

```typescript
        statusTracker.markAllFailed(chatJid, 'Task crashed — retrying.');
```

At line 251 (after `logger.warn({ group: group.name }, 'Agent error, rolled back message cursor for retry');`), add:

```typescript
    statusTracker.markAllFailed(chatJid, 'Task crashed — retrying.');
```

**Step 9: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire StatusTracker into message lifecycle (👀💭🔄✅❌)"
```

---

### Task 4: Wire heartbeat into IPC watcher

**Files:**
- Modify: `src/ipc.ts`

**Step 1: Add StatusTracker to IpcDeps**

In `src/ipc.ts`, add to the `IpcDeps` interface (after line 34, before the closing `}`):

```typescript
  statusHeartbeat?: () => void;
```

**Step 2: Call heartbeat at end of IPC poll cycle**

At line 182, right before `setTimeout(processIpcFiles, IPC_POLL_INTERVAL);`, add:

```typescript
    // Status emoji heartbeat — detect dead containers with stale emoji state
    deps.statusHeartbeat?.();
```

**Step 3: Pass heartbeat when starting IPC watcher in main()**

In `src/index.ts`, in the `startIpcWatcher({...})` call (around line 558), add `statusHeartbeat` to the deps object:

```typescript
    statusHeartbeat: () => statusTracker.heartbeatCheck(),
```

Add this after the `writeGroupsSnapshot` line (line 581).

**Step 4: Commit**

```bash
git add src/ipc.ts src/index.ts
git commit -m "feat: wire status heartbeat into IPC poll cycle"
```

---

### Task 5: Build and manual test

**Files:** None new

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Build**

Run: `npm run build`
Expected: Clean compile, no errors

**Step 3: Commit build if any generated files changed**

If the build step revealed type issues or required fixes, commit those.

**Step 4: Test manually**

Restart the service:
```bash
systemctl --user restart nanoclaw
```

Send a message to the main chat. Verify:
- 👀 appears immediately on the message
- 💭 appears when the container starts
- 🔄 appears when the agent produces first output
- ✅ appears when the response is sent
- All emoji transitions happen in order (no flicker)

To test error recovery:
```bash
# While a message is processing:
systemctl --user restart nanoclaw
# Verify: ❌ appears on the in-flight message + "[system] Restarted" text
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: emoji status reactions — complete implementation"
```
