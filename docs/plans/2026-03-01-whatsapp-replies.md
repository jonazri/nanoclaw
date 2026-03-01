# WhatsApp Replies Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `whatsapp-replies` skill that lets the agent see reply/quote context on inbound messages and send threaded replies via an extended `send_message` MCP tool.

**Architecture:** All changes are made to `src/` directly while `npm run dev` keeps skills applied. At the end, `npm run package-skill whatsapp-replies` extracts the delta into `.claude/skills/whatsapp-replies/`. The skill must be inserted in `.nanoclaw/installed-skills.yaml` after `whatsapp-search`.

**Tech Stack:** TypeScript, Baileys (`@whiskeysockets/baileys`), SQLite (`better-sqlite3`), Vitest, Zod, Qdrant (via existing RAG service), `tsx` for the import script.

---

## Prep: Start dev mode

```bash
cd /home/yaz/code/yonibot/whatsapp-replies
npm run dev
```

Wait for "Skills applied" output. This applies all existing skills to `src/` so your edits accumulate on top of them correctly.

---

## Task 1: Extend `NewMessage` type and `Channel` interface

**Files:**
- Modify: `src/types.ts`

**Step 1: Edit `src/types.ts`**

In the `NewMessage` interface (after `is_bot_message`), add:
```typescript
  replied_to_id?: string;
  replied_to_sender?: string;
  replied_to_content?: string;
```

Add a new `QuotedMessageKey` interface just before the `Channel` interface:
```typescript
export interface QuotedMessageKey {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  participant?: string; // Group sender of the quoted message
  content?: string;    // Text content for WhatsApp's preview
}
```

Update `Channel.sendMessage` to accept an optional third parameter:
```typescript
sendMessage(jid: string, text: string, quotedKey?: QuotedMessageKey): Promise<void>;
```

**Step 2: Verify types compile**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(whatsapp-replies): extend NewMessage and Channel with reply types"
```

---

## Task 2: DB migration — add reply columns and `getMessageById`

**Files:**
- Modify: `src/db.ts`
- Modify: `src/db.test.ts`

**Step 1: Write the failing tests**

Add to `src/db.test.ts`, after the `getNewMessages` describe block:

```typescript
describe('reply context storage', () => {
  it('stores and retrieves replied_to fields on a message', () => {
    storeMessage({
      id: 'reply-1',
      chat_jid: 'group@g.us',
      sender: 'alice@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'This is my reply',
      timestamp: '2024-01-01T00:01:00.000Z',
      replied_to_id: 'original-1',
      replied_to_sender: 'Bob',
      replied_to_content: 'Original message',
    });

    const msgs = getMessagesSince('group@g.us', '2024-01-01T00:00:00.000Z', 'Bot');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].replied_to_id).toBe('original-1');
    expect(msgs[0].replied_to_sender).toBe('Bob');
    expect(msgs[0].replied_to_content).toBe('Original message');
  });

  it('returns undefined for replied_to fields when not set', () => {
    storeMessage({
      id: 'plain-1',
      chat_jid: 'group@g.us',
      sender: 'alice@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'No reply context',
      timestamp: '2024-01-01T00:02:00.000Z',
    });

    const msgs = getMessagesSince('group@g.us', '2024-01-01T00:01:30.000Z', 'Bot');
    expect(msgs[0].replied_to_id).toBeUndefined();
  });
});

describe('getMessageById', () => {
  it('returns a message by id and chatJid', () => {
    storeMessage({
      id: 'lookup-1',
      chat_jid: 'group@g.us',
      sender: 'alice@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'Findable message',
      timestamp: '2024-01-01T00:03:00.000Z',
    });

    const msg = getMessageById('lookup-1', 'group@g.us');
    expect(msg).toBeDefined();
    expect(msg!.id).toBe('lookup-1');
    expect(msg!.content).toBe('Findable message');
  });

  it('returns undefined when id not found', () => {
    expect(getMessageById('nonexistent', 'group@g.us')).toBeUndefined();
  });

  it('returns undefined when chatJid does not match', () => {
    storeMessage({
      id: 'lookup-2',
      chat_jid: 'group@g.us',
      sender: 'alice@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'Message',
      timestamp: '2024-01-01T00:04:00.000Z',
    });

    expect(getMessageById('lookup-2', 'other@g.us')).toBeUndefined();
  });
});
```

Also add `getMessageById` to the import at the top of the test file.

**Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/db.test.ts
```
Expected: `getMessageById is not a function` (or similar).

**Step 3: Implement in `src/db.ts`**

In `createSchema`, add the three columns to the `CREATE TABLE IF NOT EXISTS messages` statement:
```sql
replied_to_id TEXT,
replied_to_sender TEXT,
replied_to_content TEXT,
```

Add a migration block after the existing `is_bot_message` migration try/catch:
```typescript
try {
  database.exec(`ALTER TABLE messages ADD COLUMN replied_to_id TEXT`);
  database.exec(`ALTER TABLE messages ADD COLUMN replied_to_sender TEXT`);
  database.exec(`ALTER TABLE messages ADD COLUMN replied_to_content TEXT`);
} catch {
  /* columns already exist */
}
```

Update `storeMessage` to write the new fields:
```typescript
export function storeMessage(msg: NewMessage): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages
      (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message,
       replied_to_id, replied_to_sender, replied_to_content)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id, msg.chat_jid, msg.sender, msg.sender_name, msg.content,
    msg.timestamp, msg.is_from_me ? 1 : 0, msg.is_bot_message ? 1 : 0,
    msg.replied_to_id ?? null, msg.replied_to_sender ?? null, msg.replied_to_content ?? null,
  );
}
```

Apply the same change to `storeMessageDirect` (same columns, same order).

Update the `SELECT` in `getNewMessages` and `getMessagesSince` to include the three new columns:
```sql
SELECT id, chat_jid, sender, sender_name, content, timestamp,
       replied_to_id, replied_to_sender, replied_to_content
```

Add `getMessageById` at the end of the db functions section:
```typescript
export function getMessageById(id: string, chatJid: string): NewMessage | undefined {
  return db
    .prepare(
      `SELECT id, chat_jid, sender, sender_name, content, timestamp,
              is_from_me, is_bot_message,
              replied_to_id, replied_to_sender, replied_to_content
       FROM messages WHERE id = ? AND chat_jid = ?`,
    )
    .get(id, chatJid) as NewMessage | undefined;
}
```

**Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/db.test.ts
```
Expected: all pass.

**Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat(whatsapp-replies): add reply columns to messages table + getMessageById"
```

---

## Task 3: Extract reply context on inbound WhatsApp messages

**Files:**
- Modify: `src/channels/whatsapp.ts`
- Modify: `src/channels/whatsapp.test.ts`

**Step 1: Write the failing tests**

In `src/channels/whatsapp.test.ts`, in the `describe('message handling')` block, add after the existing `extendedTextMessage` test:

```typescript
it('extracts reply context from extendedTextMessage.contextInfo', async () => {
  const opts = createTestOpts();
  const channel = new WhatsAppChannel(opts);
  await connectChannel(channel);

  await triggerMessages([
    {
      key: {
        id: 'reply-msg-1',
        remoteJid: 'registered@g.us',
        participant: '5551234@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        extendedTextMessage: {
          text: 'Great point!',
          contextInfo: {
            stanzaId: 'original-msg-id',
            participant: 'bob@s.whatsapp.net',
            quotedMessage: { conversation: 'The original message' },
          },
        },
      },
      pushName: 'Alice',
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  ]);

  expect(opts.onMessage).toHaveBeenCalledWith(
    'registered@g.us',
    expect.objectContaining({
      content: 'Great point!',
      replied_to_id: 'original-msg-id',
      replied_to_sender: 'bob@s.whatsapp.net',
      replied_to_content: 'The original message',
    }),
  );
});

it('passes undefined reply fields when no contextInfo present', async () => {
  const opts = createTestOpts();
  const channel = new WhatsAppChannel(opts);
  await connectChannel(channel);

  await triggerMessages([
    {
      key: {
        id: 'plain-msg-1',
        remoteJid: 'registered@g.us',
        participant: '5551234@s.whatsapp.net',
        fromMe: false,
      },
      message: { conversation: 'Just a plain message' },
      pushName: 'Alice',
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  ]);

  const call = vi.mocked(opts.onMessage).mock.calls[0][1];
  expect(call.replied_to_id).toBeUndefined();
  expect(call.replied_to_sender).toBeUndefined();
  expect(call.replied_to_content).toBeUndefined();
});

it('extracts reply context from imageMessage.contextInfo', async () => {
  const opts = createTestOpts();
  const channel = new WhatsAppChannel(opts);
  await connectChannel(channel);

  await triggerMessages([
    {
      key: {
        id: 'img-reply-1',
        remoteJid: 'registered@g.us',
        participant: '5551234@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        imageMessage: {
          caption: 'Look at this',
          contextInfo: {
            stanzaId: 'quoted-id',
            participant: 'carol@s.whatsapp.net',
            quotedMessage: { conversation: 'Quoted text' },
          },
        },
      },
      pushName: 'Alice',
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  ]);

  expect(opts.onMessage).toHaveBeenCalledWith(
    'registered@g.us',
    expect.objectContaining({
      replied_to_id: 'quoted-id',
      replied_to_sender: 'carol@s.whatsapp.net',
    }),
  );
});
```

**Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/channels/whatsapp.test.ts
```
Expected: the three new tests fail (replied_to_id is undefined).

**Step 3: Implement in `src/channels/whatsapp.ts`**

Add a helper function near the top of the file (before the class), after imports:

```typescript
/**
 * Extract text content from a Baileys quoted message proto.
 */
function extractQuotedText(quotedMessage: Record<string, unknown> | null | undefined): string | undefined {
  if (!quotedMessage) return undefined;
  const q = quotedMessage as {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
  };
  return q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || undefined;
}
```

In the `messages.upsert` handler, find the section that builds the `NewMessage` object and extract contextInfo. The contextInfo is on whichever message type is present. Add this logic after `content` is determined:

```typescript
// Extract reply/quote context if present
const contextInfo =
  msg.message?.extendedTextMessage?.contextInfo ||
  msg.message?.imageMessage?.contextInfo ||
  msg.message?.videoMessage?.contextInfo ||
  null;

const repliedToId = contextInfo?.stanzaId || undefined;
const repliedToSender = contextInfo?.participant || undefined;
const repliedToContent = extractQuotedText(
  contextInfo?.quotedMessage as Record<string, unknown> | null | undefined
);
```

Then include them in the `onMessage` call:
```typescript
this.opts.onMessage(chatJid, {
  id: msg.key.id || '',
  chat_jid: chatJid,
  sender,
  sender_name: senderName,
  content,
  timestamp,
  is_from_me: fromMe,
  is_bot_message: isBotMessage,
  replied_to_id: repliedToId,
  replied_to_sender: repliedToSender,
  replied_to_content: repliedToContent,
});
```

**Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/channels/whatsapp.test.ts
```
Expected: all pass.

**Step 5: Commit**

```bash
git add src/channels/whatsapp.ts src/channels/whatsapp.test.ts
git commit -m "feat(whatsapp-replies): extract contextInfo from inbound Baileys messages"
```

---

## Task 4: Format reply context in agent prompt XML

**Files:**
- Modify: `src/router.ts`
- Modify: `src/formatting.test.ts`

**Step 1: Write the failing tests**

In `src/formatting.test.ts`, in the `describe('formatMessages')` block, add:

```typescript
it('includes reply context as nested XML when present', () => {
  const msg = makeMsg({
    replied_to_id: 'abc123',
    replied_to_sender: 'Bob',
    replied_to_content: 'Original message here',
  });
  const result = formatMessages([msg]);
  expect(result).toContain('replied_to_id="abc123"');
  expect(result).toContain('replied_to_sender="Bob"');
  expect(result).toContain('<reply_to>Original message here</reply_to>');
});

it('omits reply attributes when not present', () => {
  const result = formatMessages([makeMsg()]);
  expect(result).not.toContain('replied_to_id');
  expect(result).not.toContain('<reply_to>');
});

it('escapes special chars in reply context', () => {
  const msg = makeMsg({
    replied_to_id: 'x1',
    replied_to_sender: 'A & B',
    replied_to_content: '<script>xss</script>',
  });
  const result = formatMessages([msg]);
  expect(result).toContain('replied_to_sender="A &amp; B"');
  expect(result).toContain('&lt;script&gt;xss&lt;/script&gt;');
});
```

**Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/formatting.test.ts
```
Expected: the three new tests fail.

**Step 3: Implement in `src/router.ts`**

Replace the `formatMessages` function:

```typescript
export function formatMessages(messages: NewMessage[]): string {
  const lines = messages.map((m) => {
    const replyAttrs = m.replied_to_id
      ? ` replied_to_id="${escapeXml(m.replied_to_id)}" replied_to_sender="${escapeXml(m.replied_to_sender || '')}"`
      : '';
    const replyTag = m.replied_to_content
      ? `\n  <reply_to>${escapeXml(m.replied_to_content)}</reply_to>`
      : '';
    const content = `${replyTag}\n  ${escapeXml(m.content)}`.trimEnd();
    if (replyTag) {
      return `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}"${replyAttrs}>${content}\n</message>`;
    }
    return `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}"${replyAttrs}>${escapeXml(m.content)}</message>`;
  });
  return `<messages>\n${lines.join('\n')}\n</messages>`;
}
```

**Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/formatting.test.ts
```
Expected: all pass.

**Step 5: Run full test suite to catch regressions**

```bash
npx vitest run
```
Expected: all pass.

**Step 6: Commit**

```bash
git add src/router.ts src/formatting.test.ts
git commit -m "feat(whatsapp-replies): include reply context in formatMessages XML"
```

---

## Task 5: Support `quotedKey` on outbound `sendMessage`

**Files:**
- Modify: `src/channels/whatsapp.ts`
- Modify: `src/channels/whatsapp.test.ts`

**Step 1: Write the failing tests**

In `src/channels/whatsapp.test.ts`, add a new describe block after the message handling block:

```typescript
describe('sendMessage with quotedKey', () => {
  it('passes quoted option to Baileys when quotedKey provided', async () => {
    const opts = createTestOpts();
    const channel = new WhatsAppChannel(opts);
    await connectChannel(channel);

    await channel.sendMessage('registered@g.us', 'My reply', {
      id: 'original-id',
      remoteJid: 'registered@g.us',
      fromMe: false,
      participant: 'bob@s.whatsapp.net',
      content: 'The original text',
    });

    expect(fakeSocket.sendMessage).toHaveBeenCalledWith(
      'registered@g.us',
      expect.objectContaining({ text: expect.stringContaining('My reply') }),
      expect.objectContaining({
        quoted: expect.objectContaining({
          key: expect.objectContaining({ id: 'original-id' }),
        }),
      }),
    );
  });

  it('sends plain message when no quotedKey provided', async () => {
    const opts = createTestOpts();
    const channel = new WhatsAppChannel(opts);
    await connectChannel(channel);

    await channel.sendMessage('registered@g.us', 'Plain message');

    // Called with only 2 args (no quoted option)
    const call = vi.mocked(fakeSocket.sendMessage).mock.calls[0];
    expect(call[2]).toBeUndefined();
  });

  it('queues message with quotedKey when disconnected', async () => {
    const opts = createTestOpts();
    const channel = new WhatsAppChannel(opts);
    // Do NOT connect — channel stays disconnected

    await channel.sendMessage('registered@g.us', 'Queued reply', {
      id: 'qid', remoteJid: 'registered@g.us', fromMe: false,
    });

    // Should not have called sock.sendMessage
    expect(fakeSocket.sendMessage).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/channels/whatsapp.test.ts
```
Expected: the `quotedKey` tests fail.

**Step 3: Implement in `src/channels/whatsapp.ts`**

Import `QuotedMessageKey` from types at the top:
```typescript
import { Channel, OnInboundMessage, OnChatMetadata, RegisteredGroup, QuotedMessageKey } from '../types.js';
```

Update the outgoing queue type:
```typescript
private outgoingQueue: Array<{ jid: string; text: string; quotedKey?: QuotedMessageKey }> = [];
```

Update `sendMessage` signature and body:
```typescript
async sendMessage(jid: string, text: string, quotedKey?: QuotedMessageKey): Promise<void> {
  const prefixed = ASSISTANT_HAS_OWN_NUMBER ? text : `${ASSISTANT_NAME}: ${text}`;

  if (!this.connected) {
    this.outgoingQueue.push({ jid, text: prefixed, quotedKey });
    logger.info({ jid, length: prefixed.length, queueSize: this.outgoingQueue.length }, 'WA disconnected, message queued');
    return;
  }
  try {
    const sendOpts = quotedKey
      ? { quoted: { key: quotedKey, message: { conversation: quotedKey.content || '' } } }
      : undefined;
    await this.sock.sendMessage(jid, { text: prefixed }, sendOpts);
    logger.info({ jid, length: prefixed.length }, 'Message sent');
  } catch (err) {
    this.outgoingQueue.push({ jid, text: prefixed, quotedKey });
    logger.warn({ jid, err, queueSize: this.outgoingQueue.length }, 'Failed to send, message queued');
  }
}
```

Update `flushOutgoingQueue` to pass `quotedKey` through:
```typescript
const sendOpts = item.quotedKey
  ? { quoted: { key: item.quotedKey, message: { conversation: item.quotedKey.content || '' } } }
  : undefined;
await this.sock.sendMessage(item.jid, { text: item.text }, sendOpts);
```

**Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/channels/whatsapp.test.ts
```
Expected: all pass.

**Step 5: Commit**

```bash
git add src/channels/whatsapp.ts src/channels/whatsapp.test.ts
git commit -m "feat(whatsapp-replies): support quotedKey in sendMessage for threaded replies"
```

---

## Task 6: IPC handler — route `quotedMessageId` to `sendMessage`

**Files:**
- Modify: `src/ipc.ts`

**Step 1: Edit `src/ipc.ts`**

Add `getMessageById` to the import from `./db.js`:
```typescript
import { createTask, deleteTask, getMessageById, getTaskById, updateTask } from './db.js';
```

Add `QuotedMessageKey` to the import from `./types.js`:
```typescript
import { QuotedMessageKey, RegisteredGroup } from './types.js';
```

Update `IpcDeps.sendMessage` signature:
```typescript
sendMessage: (jid: string, text: string, quotedKey?: QuotedMessageKey) => Promise<void>;
```

In the `processIpcFiles` function, in the `data.type === 'message'` branch, replace the `deps.sendMessage` call with:
```typescript
let quotedKey: QuotedMessageKey | undefined;
if (data.quotedMessageId) {
  const quotedMsg = getMessageById(data.quotedMessageId, data.chatJid);
  if (quotedMsg) {
    quotedKey = {
      id: quotedMsg.id,
      remoteJid: quotedMsg.chat_jid,
      fromMe: quotedMsg.is_from_me ?? false,
      participant: quotedMsg.sender !== quotedMsg.chat_jid ? quotedMsg.sender : undefined,
      content: quotedMsg.content,
    };
  } else {
    logger.warn({ chatJid: data.chatJid, quotedMessageId: data.quotedMessageId }, 'Quoted message not found, sending as plain message');
  }
}
await deps.sendMessage(data.chatJid, data.text, quotedKey);
```

Also add `quotedMessageId?: string` to the `data` parameter type in `processIpcFiles`.

**Step 2: Update `src/index.ts` — pass `quotedKey` through the IPC `sendMessage` dep**

Find the `startIpcWatcher` call in `main()`. The `sendMessage` dep there reads:
```typescript
sendMessage: (jid, text) => {
  const channel = findChannel(channels, jid);
  if (!channel) throw new Error(`No channel for JID: ${jid}`);
  return channel.sendMessage(jid, text);
},
```

Update to:
```typescript
sendMessage: (jid, text, quotedKey?) => {
  const channel = findChannel(channels, jid);
  if (!channel) throw new Error(`No channel for JID: ${jid}`);
  return channel.sendMessage(jid, text, quotedKey);
},
```

**Step 3: Verify compilation**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add src/ipc.ts src/index.ts
git commit -m "feat(whatsapp-replies): route quotedMessageId through IPC to sendMessage"
```

---

## Task 7: Extend `send_message` MCP tool with `quoted_message_id`

**Files:**
- Modify: `container/agent-runner/src/ipc-mcp-stdio.ts`

**Step 1: Edit `container/agent-runner/src/ipc-mcp-stdio.ts`**

In the `send_message` tool definition, add `quoted_message_id` to the schema after `sender`:
```typescript
quoted_message_id: z.string().optional().describe(
  'ID of the message to reply to. Threads your response as a WhatsApp reply. ' +
  'Use in group chats to keep conversations readable. ' +
  'In private owner chat, use only when disambiguating multiple queued messages.'
),
```

In the `data` object built inside the tool handler, add:
```typescript
quotedMessageId: args.quoted_message_id || undefined,
```

**Step 2: Verify container TypeScript compiles**

```bash
cd container/agent-runner && npx tsc --noEmit && cd ../..
```
Expected: no errors.

**Step 3: Rebuild the container**

```bash
./container/build.sh
```

**Step 4: Commit**

```bash
git add container/agent-runner/src/ipc-mcp-stdio.ts
git commit -m "feat(whatsapp-replies): add quoted_message_id param to send_message MCP tool"
```

---

## Task 8: Add container SKILL.md for the agent

**Files:**
- Create: `container/skills/whatsapp-replies/SKILL.md`

**Step 1: Create the file**

```bash
mkdir -p container/skills/whatsapp-replies
```

Write `container/skills/whatsapp-replies/SKILL.md`:

```markdown
---
name: whatsapp-replies
description: Understanding reply context on inbound messages and sending threaded replies.
---

# WhatsApp Reply Context

## Reading reply context

When a user replies to a message in WhatsApp, the message XML includes reply metadata:

```xml
<message sender="Bob" time="2026-..." replied_to_id="abc123" replied_to_sender="Alice">
  <reply_to>Alice's original message text</reply_to>
  Bob's reply text here
</message>
```

- `replied_to_id` — the ID of the message being replied to
- `replied_to_sender` — the JID of who sent the original message
- `<reply_to>` — the text of the original message

Use this to give contextually accurate responses. E.g. if Bob is replying to Alice's question, your response can acknowledge that clearly.

## Sending threaded replies

Pass `quoted_message_id` to `send_message` to thread your reply in WhatsApp:

```
send_message({
  text: "Here's my answer to that",
  quoted_message_id: "abc123"
})
```

### When to use threading

**Group chats**: Default to threading your reply. It keeps conversations readable when multiple people are talking simultaneously. Use the `replied_to_id` from the triggering message, or any relevant message ID you want to respond to.

**Owner private chat**: Generally send plain messages — threading in a 1:1 conversation feels redundant and clutters the interface.

**Exception for private chat**: If the owner has sent several messages in quick succession and it would be ambiguous which one you're responding to, use `quoted_message_id` to make the reference explicit.
```

**Step 2: Commit**

```bash
git add container/skills/whatsapp-replies/SKILL.md
git commit -m "feat(whatsapp-replies): add container SKILL.md with reply guidance"
```

---

## Task 9: Extend RAG ingestion with reply fields

**Files:**
- Modify: `rag-system/src/ingestion.ts` (added by `add-whatsapp-search` skill — only exists after `npm run apply-skills`)

**Step 1: Verify the file exists**

```bash
ls rag-system/src/ingestion.ts
```
If it doesn't exist, run `npm run apply-skills` first.

**Step 2: Edit `rag-system/src/ingestion.ts`**

Extend the `RawMessage` interface:
```typescript
interface RawMessage {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  group_name: string | null;
  replied_to_id: string | null;
  replied_to_sender: string | null;
  replied_to_content: string | null;
}
```

Update the SQL in `fetchMessages` to SELECT the new columns:
```sql
SELECT m.id, m.chat_jid, m.sender, m.sender_name, m.content, m.timestamp,
       c.name AS group_name,
       m.replied_to_id, m.replied_to_sender, m.replied_to_content
FROM messages m
LEFT JOIN chats c ON m.chat_jid = c.jid
WHERE m.timestamp > ?
  AND m.is_bot_message = 0
  AND m.content IS NOT NULL
  AND m.content != ''
ORDER BY m.timestamp ASC
LIMIT ?
```

Update the `processBatch` function to include reply fields in the Qdrant payload:
```typescript
const embeddings: MessageEmbedding[] = messages.map((m, i) => ({
  id: messageIdToUuid(m.id, m.chat_jid),
  vector: vectors[i],
  payload: {
    message_id: m.id,
    chat_jid: m.chat_jid,
    sender: m.sender,
    sender_name: m.sender_name,
    content: m.content,
    timestamp: m.timestamp,
    group_name: m.group_name || undefined,
    replied_to_id: m.replied_to_id || undefined,
    replied_to_sender: m.replied_to_sender || undefined,
    replied_to_content: m.replied_to_content || undefined,
  },
}));
```

**Step 3: Verify RAG service compiles**

```bash
cd rag-system && npx tsc --noEmit && cd ..
```
Expected: no errors.

**Step 4: Commit**

```bash
git add rag-system/src/ingestion.ts
git commit -m "feat(whatsapp-replies): add reply fields to RAG ingestion payload"
```

---

## Task 10: iPhone backup import script

**Files:**
- Create: `scripts/import-whatsapp-backup.ts`

**Step 1: Write the script**

Create `scripts/import-whatsapp-backup.ts`:

```typescript
/**
 * import-whatsapp-backup.ts
 *
 * One-time script to import an iPhone WhatsApp backup (ChatStorage.sqlite) into:
 *   Phase 1 — Qdrant RAG database (all chats, with embeddings)
 *   Phase 2 — NanoClaw SQLite DB (registered chats only: backfill + augment reply context)
 *
 * Usage:
 *   npx tsx scripts/import-whatsapp-backup.ts --backup-path /path/to/ChatStorage.sqlite [--dry-run]
 *
 * Prerequisites:
 *   - Qdrant running (docker compose up -d in rag-system/docker/)
 *   - RAG service built (cd rag-system && npm install && npx tsc)
 *   - OPENAI_API_KEY in environment
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// --- Mac epoch conversion ---
// iPhone timestamps are seconds since 2001-01-01 00:00:00 UTC
const MAC_EPOCH_OFFSET = 978307200; // Unix timestamp of 2001-01-01

function macTimeToIso(macTime: number): string {
  return new Date((macTime + MAC_EPOCH_OFFSET) * 1000).toISOString();
}

// --- Arg parsing ---
const args = process.argv.slice(2);
const backupPathArg = args.find(a => a.startsWith('--backup-path='))?.split('=')[1]
  || args[args.indexOf('--backup-path') + 1];
const dryRun = args.includes('--dry-run');

if (!backupPathArg) {
  console.error('Usage: npx tsx scripts/import-whatsapp-backup.ts --backup-path /path/to/ChatStorage.sqlite [--dry-run]');
  process.exit(1);
}

const backupPath = path.resolve(backupPathArg);
if (!fs.existsSync(backupPath)) {
  console.error(`Backup file not found: ${backupPath}`);
  process.exit(1);
}

// --- Dynamic imports for RAG service (only loads after npm run apply-skills) ---
async function importRagDeps() {
  const { getConfig, loadConfig } = await import('../rag-system/src/config.js');
  const { initialize: initEmbeddings, embedBatch } = await import('../rag-system/src/embeddings.js');
  const { qdrantClient, messageIdToUuid } = await import('../rag-system/src/database/qdrant-client.js');
  return { getConfig, loadConfig, initEmbeddings, embedBatch, qdrantClient, messageIdToUuid };
}

interface BackupMessage {
  stanza_id: string;
  text: string | null;
  is_from_me: number;
  mac_timestamp: number;
  chat_jid: string;
  chat_name: string | null;
  sender_jid: string | null;
  sender_name: string | null;
  quoted_stanza_id: string | null;
  quoted_text: string | null;
  quoted_sender_jid: string | null;
}

function queryBackupMessages(db: Database.Database, afterMacTime: number, limit: number): BackupMessage[] {
  return db.prepare(`
    SELECT
      m.ZSTANZAID       AS stanza_id,
      m.ZTEXT           AS text,
      m.ZISFROMME       AS is_from_me,
      m.ZTIMESTAMP      AS mac_timestamp,
      cs.ZCONTACTJID    AS chat_jid,
      cs.ZPARTNERNAME   AS chat_name,
      gm.ZMEMBERJID     AS sender_jid,
      gm.ZFULLNAME      AS sender_name,
      qm.ZSTANZAID      AS quoted_stanza_id,
      qm.ZTEXT          AS quoted_text,
      qgm.ZMEMBERJID    AS quoted_sender_jid
    FROM ZWAMESSAGE m
    JOIN ZWACHATSESSION cs ON cs.Z_PK = m.ZCHATSESSION
    LEFT JOIN ZWAGROUPMEMBER gm ON gm.Z_PK = m.ZGROUPMEMBER
    LEFT JOIN ZWAMESSAGE qm ON qm.Z_PK = m.ZQUOTEDMESSAGE
    LEFT JOIN ZWAGROUPMEMBER qgm ON qgm.Z_PK = qm.ZGROUPMEMBER
    WHERE m.ZTIMESTAMP > ?
      AND m.ZTEXT IS NOT NULL
      AND m.ZTEXT != ''
      AND m.ZSTANZAID IS NOT NULL
      AND cs.ZCONTACTJID IS NOT NULL
    ORDER BY m.ZTIMESTAMP ASC
    LIMIT ?
  `).all(afterMacTime, limit) as BackupMessage[];
}

const WATERMARK_PATH = path.join(process.cwd(), 'rag-system', 'data', 'backup-import-watermark.json');
const BATCH_SIZE = 50;
const RATE_LIMIT_DELAY_MS = 1000;

function readWatermark(): number {
  try {
    if (fs.existsSync(WATERMARK_PATH)) {
      return JSON.parse(fs.readFileSync(WATERMARK_PATH, 'utf-8')).lastMacTime ?? 0;
    }
  } catch { /* ignore */ }
  return 0;
}

function writeWatermark(lastMacTime: number): void {
  fs.mkdirSync(path.dirname(WATERMARK_PATH), { recursive: true });
  fs.writeFileSync(WATERMARK_PATH, JSON.stringify({ lastMacTime }));
}

async function phase1RagImport(
  backupDb: Database.Database,
  deps: Awaited<ReturnType<typeof importRagDeps>>,
): Promise<void> {
  console.log('\n=== Phase 1: RAG import (all chats) ===');

  const { embedBatch, qdrantClient, messageIdToUuid } = deps;
  let lastMacTime = readWatermark();
  let totalUpserted = 0;
  let batchNum = 0;

  while (true) {
    const messages = queryBackupMessages(backupDb, lastMacTime, BATCH_SIZE);
    if (messages.length === 0) break;

    batchNum++;
    const texts = messages.map(m => {
      const sender = m.sender_name || m.sender_jid?.split('@')[0] || (m.is_from_me ? 'Me' : 'Unknown');
      const group = m.chat_name ? ` [${m.chat_name}]` : '';
      return `${sender}${group}: ${m.text}`;
    });

    if (!dryRun) {
      const vectors = await embedBatch(texts);
      const embeddings = messages.map((m, i) => ({
        id: messageIdToUuid(m.stanza_id, m.chat_jid),
        vector: vectors[i],
        payload: {
          message_id: m.stanza_id,
          chat_jid: m.chat_jid,
          sender: m.sender_jid || '',
          sender_name: m.sender_name || m.sender_jid?.split('@')[0] || '',
          content: m.text || '',
          timestamp: macTimeToIso(m.mac_timestamp),
          group_name: m.chat_name || undefined,
          replied_to_id: m.quoted_stanza_id || undefined,
          replied_to_sender: m.quoted_sender_jid || undefined,
          replied_to_content: m.quoted_text || undefined,
        },
      }));
      await qdrantClient.upsertEmbeddings(embeddings);
      lastMacTime = messages[messages.length - 1].mac_timestamp;
      writeWatermark(lastMacTime);
      totalUpserted += embeddings.length;
    } else {
      totalUpserted += messages.length;
    }

    console.log(`  Batch ${batchNum}: ${messages.length} messages (up to ${macTimeToIso(messages[messages.length - 1].mac_timestamp)})`);

    if (messages.length === BATCH_SIZE) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }
  }

  console.log(`Phase 1 complete: ${totalUpserted} messages ${dryRun ? '(dry run)' : 'upserted to Qdrant'}`);
}

async function phase2NanoclawAugment(backupDb: Database.Database): Promise<void> {
  console.log('\n=== Phase 2: NanoClaw DB augmentation (registered chats only) ===');

  // Dynamically load NanoClaw DB path
  const { DATA_DIR, STORE_DIR } = await import('../src/config.js');
  const dbPath = path.join(STORE_DIR, 'messages.db');
  if (!fs.existsSync(dbPath)) {
    console.log('NanoClaw DB not found, skipping Phase 2');
    return;
  }

  const nanoclawDb = new Database(dbPath);

  // Get registered group JIDs from NanoClaw
  const registeredJids: Set<string> = new Set(
    (nanoclawDb.prepare('SELECT jid FROM registered_groups').all() as { jid: string }[]).map(r => r.jid)
  );
  console.log(`  Found ${registeredJids.size} registered groups: ${[...registeredJids].join(', ')}`);

  // Query backup messages for registered chats only
  const backupRegistered = backupDb.prepare(`
    SELECT
      m.ZSTANZAID       AS stanza_id,
      m.ZTEXT           AS text,
      m.ZISFROMME       AS is_from_me,
      m.ZTIMESTAMP      AS mac_timestamp,
      cs.ZCONTACTJID    AS chat_jid,
      gm.ZMEMBERJID     AS sender_jid,
      gm.ZFULLNAME      AS sender_name,
      qm.ZSTANZAID      AS quoted_stanza_id,
      qm.ZTEXT          AS quoted_text,
      qgm.ZMEMBERJID    AS quoted_sender_jid
    FROM ZWAMESSAGE m
    JOIN ZWACHATSESSION cs ON cs.Z_PK = m.ZCHATSESSION
    LEFT JOIN ZWAGROUPMEMBER gm ON gm.Z_PK = m.ZGROUPMEMBER
    LEFT JOIN ZWAMESSAGE qm ON qm.Z_PK = m.ZQUOTEDMESSAGE
    LEFT JOIN ZWAGROUPMEMBER qgm ON qgm.Z_PK = qm.ZGROUPMEMBER
    WHERE m.ZSTANZAID IS NOT NULL
      AND cs.ZCONTACTJID IN (${[...registeredJids].map(() => '?').join(',')})
    ORDER BY m.ZTIMESTAMP ASC
  `).all(...registeredJids) as BackupMessage[];

  console.log(`  Found ${backupRegistered.length} messages in registered chats from backup`);

  let updated = 0;
  let inserted = 0;
  let skipped = 0;

  const updateStmt = nanoclawDb.prepare(`
    UPDATE messages
    SET replied_to_id = ?, replied_to_sender = ?, replied_to_content = ?
    WHERE id = ? AND chat_jid = ?
  `);

  const insertStmt = nanoclawDb.prepare(`
    INSERT OR IGNORE INTO messages
      (id, chat_jid, sender, sender_name, content, timestamp, is_from_me,
       replied_to_id, replied_to_sender, replied_to_content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const m of backupRegistered) {
    if (!m.text) { skipped++; continue; }
    const ts = macTimeToIso(m.mac_timestamp);
    const sender = m.sender_jid || m.chat_jid;
    const senderName = m.sender_name || sender.split('@')[0];

    if (!dryRun) {
      if (m.quoted_stanza_id) {
        const result = updateStmt.run(
          m.quoted_stanza_id, m.quoted_sender_jid || null, m.quoted_text || null,
          m.stanza_id, m.chat_jid
        );
        if (result.changes > 0) updated++;
      }

      // Insert missing messages (pre-registration history)
      const insertResult = insertStmt.run(
        m.stanza_id, m.chat_jid, sender, senderName, m.text, ts,
        m.is_from_me ? 1 : 0,
        m.quoted_stanza_id || null, m.quoted_sender_jid || null, m.quoted_text || null,
      );
      if (insertResult.changes > 0) inserted++;
    } else {
      if (m.quoted_stanza_id) updated++;
      inserted++;
    }
  }

  nanoclawDb.close();
  console.log(`Phase 2 complete: ${updated} updated, ${inserted} inserted, ${skipped} skipped ${dryRun ? '(dry run)' : ''}`);
}

async function main(): Promise<void> {
  console.log(`Opening backup: ${backupPath}`);
  const backupDb = new Database(backupPath, { readonly: true });

  // Verify expected table exists
  const tables = backupDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='ZWAMESSAGE'`).get();
  if (!tables) {
    console.error('ZWAMESSAGE table not found — is this an iPhone WhatsApp backup (ChatStorage.sqlite)?');
    process.exit(1);
  }

  try {
    const deps = await importRagDeps();
    deps.loadConfig();
    deps.initEmbeddings();
    await deps.qdrantClient.initializeCollection();

    await phase1RagImport(backupDb, deps);
    await phase2NanoclawAugment(backupDb);
  } finally {
    backupDb.close();
  }

  console.log('\nImport complete.');
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
```

**Step 2: Verify it type-checks**

```bash
npx tsc --noEmit --allowImportingTsExtensions scripts/import-whatsapp-backup.ts 2>/dev/null || true
```

If there are real type errors (not the "cannot write output" ones), fix them.

**Step 3: Commit**

```bash
git add scripts/import-whatsapp-backup.ts
git commit -m "feat(whatsapp-replies): add iPhone WhatsApp backup import script"
```

---

## Task 11: Package skill and register

**Step 1: Run full test suite one final time**

```bash
npx vitest run
```
Expected: all pass.

**Step 2: Package the skill**

```bash
npm run package-skill whatsapp-replies
```

This creates `.claude/skills/whatsapp-replies/` with `manifest.yaml` and the `add/`/`modify/` trees reflecting your changes.

**Step 3: Inspect the created skill**

```bash
find .claude/skills/whatsapp-replies -type f | sort
cat .claude/skills/whatsapp-replies/manifest.yaml
```

Verify the manifest lists the expected modified files:
- `src/types.ts`
- `src/db.ts`
- `src/db.test.ts`
- `src/channels/whatsapp.ts`
- `src/channels/whatsapp.test.ts`
- `src/router.ts`
- `src/formatting.test.ts`
- `src/ipc.ts`
- `src/index.ts`
- `container/agent-runner/src/ipc-mcp-stdio.ts`
- `rag-system/src/ingestion.ts`

And the added files:
- `container/skills/whatsapp-replies/SKILL.md`

**Step 4: Register the skill in install order**

Edit `.nanoclaw/installed-skills.yaml`. Add `whatsapp-replies` after `whatsapp-search`:

```yaml
skills:
  - reactions
  - refresh-oauth
  - auth-recovery
  - group-lifecycle
  - google-home
  - shabbat-mode
  - container-hardening
  - task-scheduler-fixes
  - whatsapp-resilience
  - voice-transcription-elevenlabs
  - voice-recognition
  - whatsapp-search
  - whatsapp-replies      # <-- add here
  - perplexity-research
  - feature-request
  - whatsapp-summary
```

**Step 5: Do a clean build to verify the skill applies correctly**

```bash
npm run build
```
Expected: "Skills applied" with no errors, TypeScript compiles cleanly.

**Step 6: Run tests against the clean build**

```bash
npx vitest run
```
Expected: all pass.

**Step 7: Final commit**

```bash
git add .claude/skills/whatsapp-replies/ .nanoclaw/installed-skills.yaml
git commit -m "feat: add whatsapp-replies skill — reply context, send reply, RAG indexing"
```
