# Design: `whatsapp-replies` skill

**Date:** 2026-03-01
**Status:** Approved
**Branch:** feat/whatsapp-replies

## Problem

NanoClaw receives WhatsApp messages but ignores reply/quote context entirely. When a user replies to a specific message, the agent sees only the reply text — it loses the conversational thread. The agent also cannot send threaded replies, which makes group chat responses harder to follow.

## Scope

A single `whatsapp-replies` skill covering:
1. Receiving and storing reply context
2. Formatting reply context in the agent prompt
3. Sending threaded replies via an extended `send_message` MCP tool
4. Indexing reply metadata in the Qdrant RAG system
5. A one-time import script to backfill from iPhone WhatsApp backup
6. Container SKILL.md guiding the agent on when to use threading

---

## Section 1: Receiving reply context

### Baileys message structure

When a user replies to a message, `msg.message.extendedTextMessage.contextInfo` contains:
- `stanzaId` — ID of the quoted message (matches Baileys `key.id`)
- `participant` — JID of the person who sent the quoted message
- `quotedMessage` — the original message content (nested proto)

Same `contextInfo` shape appears on `imageMessage` and `videoMessage`.

### Changes

**`src/types.ts`** — extend `NewMessage`:
```typescript
replied_to_id?: string;
replied_to_sender?: string;
replied_to_content?: string;
```

**`src/channels/whatsapp.ts`** — extract `contextInfo` from `extendedTextMessage`, `imageMessage`, `videoMessage` during `messages.upsert`. Populate the three new fields on the `NewMessage` passed to `onMessage`.

---

## Section 2: Storage & prompt formatting

### DB migration (`src/db.ts`)

Add three columns via the established try/catch migration pattern:
```sql
ALTER TABLE messages ADD COLUMN replied_to_id TEXT;
ALTER TABLE messages ADD COLUMN replied_to_sender TEXT;
ALTER TABLE messages ADD COLUMN replied_to_content TEXT;
```

Update `storeMessage` and `storeMessageDirect` to write these fields.
Update `getNewMessages` and `getMessagesSince` to SELECT them.
Add `getMessageById(id: string, chatJid: string)` for the send-reply lookup.

### Prompt formatting (`src/router.ts`)

`formatMessages` emits richer XML when reply context is present:
```xml
<message sender="Bob" time="2026-..." replied_to_id="abc123" replied_to_sender="Alice">
  <reply_to>original message text</reply_to>
  Bob's reply here
</message>
```
When no reply context: identical to current format — no regression.

---

## Section 3: Sending threaded replies

### Channel interface (`src/types.ts`)

```typescript
interface QuotedMessageKey {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  participant?: string;
  content?: string;
}

// Channel.sendMessage gains optional third param:
sendMessage(jid: string, text: string, quotedKey?: QuotedMessageKey): Promise<void>;
```

### WhatsApp channel (`src/channels/whatsapp.ts`)

When `quotedKey` is provided, pass to Baileys:
```typescript
await this.sock.sendMessage(
  jid,
  { text: prefixed },
  { quoted: { key: quotedKey, message: { conversation: quotedKey.content || '' } } }
);
```
Outgoing queue entries gain an optional `quotedKey` field so queued replies are replayed correctly on reconnect.

### MCP tool (`container/agent-runner/src/ipc-mcp-stdio.ts`)

Extend `send_message`:
```typescript
quoted_message_id: z.string().optional().describe(
  'ID of the message to reply to (threads the reply in WhatsApp). ' +
  'Use in group chats to keep conversations readable. ' +
  'In private chat, use only when disambiguating multiple queued messages.'
)
```
IPC payload gains `quotedMessageId` field.

### IPC handler (`src/ipc.ts`)

When a message IPC payload contains `quotedMessageId`:
1. Call `getMessageById(quotedMessageId, chatJid)` to look up original message
2. Reconstruct `QuotedMessageKey` from DB row (`id`, `chat_jid`, `is_from_me`, `sender`)
3. Call `deps.sendMessage(chatJid, text, quotedKey)`
4. Fall back to plain send if ID not found (logs a warning)

`IpcDeps.sendMessage` signature updated to accept optional `quotedKey`.

---

## Section 4: RAG extension

**`.claude/skills/add-whatsapp-search/add/rag-system/src/ingestion.ts`**

- Extend `RawMessage` interface to include `replied_to_id`, `replied_to_sender`, `replied_to_content`
- Update SQL query to SELECT these three columns from the `messages` table
- Include them in the Qdrant point payload

No Qdrant schema migration needed — payloads are arbitrary JSON. New fields appear automatically on newly ingested points going forward. Existing points gain the fields when re-ingested.

---

## Section 5: Backup import script

**`scripts/import-whatsapp-backup.ts`**

One-time script to backfill from iPhone `ChatStorage.sqlite`.

### iPhone DB schema (key tables)

- `ZWAMESSAGE`: `ZSTANZAID` (= Baileys `key.id`), `ZTEXT`, `ZISFROMME`, `ZQUOTEDMESSAGE` (FK → `ZWAMESSAGE.Z_PK`), `ZTIMESTAMP` (Mac absolute time: seconds since 2001-01-01)
- `ZWACHATSESSION`: `ZCONTACTJID` (chat JID), `ZPARTNERNAME`
- `ZWAMEDIAITEM`: media metadata (joined for captions when needed)

### Phase 1: Full RAG import (all chats)

- Reads all messages from backup, all chats
- Self-join on `ZQUOTEDMESSAGE` to extract reply context
- Embeds and upserts to Qdrant using `rag-system/src/embeddings.ts`
- Batched with rate-limit delay; watermarked by `ZTIMESTAMP` so re-runs are idempotent
- Result: Qdrant has full WhatsApp history including personal chats NanoClaw never saw

### Phase 2: NanoClaw DB augmentation (registered chats only)

- For messages already in NanoClaw's `messages` table: `UPDATE` to backfill `replied_to_id`, `replied_to_content`, `replied_to_sender`
- For messages in registered chats not yet in NanoClaw (pre-registration history): `INSERT OR IGNORE` with full row
- Skips unregistered chats — no new JIDs added to NanoClaw's DB

Script accepts `--backup-path` and `--dry-run` flags. Reports counts: total processed / Qdrant upserted / NanoClaw updated / NanoClaw inserted / not found.

---

## Section 6: Container SKILL.md

**`container/skills/whatsapp-replies/SKILL.md`**

Teaches the agent:

**Reading reply context:**
- Explains the `<reply_to>` XML format and attributes
- Encourages using `replied_to_sender` and `replied_to_content` to give contextually accurate responses (e.g., "Replying to Alice's question about...")

**Sending threaded replies:**
- **Group chats**: default to threading — keeps conversations readable when multiple people are talking simultaneously
- **Owner main chat (private)**: generally send plain messages — threading feels redundant in a 1:1 conversation
- **Exception for main chat**: when the owner has sent several messages in a queue and it would be ambiguous which one you're responding to, use `quoted_message_id` to make the reference explicit

---

## Files changed

| File | Change |
|------|--------|
| `src/types.ts` | Add reply fields to `NewMessage`; add `QuotedMessageKey`; extend `Channel.sendMessage` |
| `src/channels/whatsapp.ts` | Extract `contextInfo` on inbound; support `quotedKey` on outbound |
| `src/db.ts` | Migration + updated queries + `getMessageById` |
| `src/router.ts` | Extend `formatMessages` with reply XML |
| `src/ipc.ts` | Handle `quotedMessageId` in message IPC |
| `container/agent-runner/src/ipc-mcp-stdio.ts` | Extend `send_message` with `quoted_message_id` |
| `container/skills/whatsapp-replies/SKILL.md` | New agent-facing guidance |
| `.claude/skills/add-whatsapp-search/add/rag-system/src/ingestion.ts` | Add reply fields to RAG payload |
| `scripts/import-whatsapp-backup.ts` | New one-time backup import script |

## Skill install order

`whatsapp-replies` is added to `.nanoclaw/installed-skills.yaml` **after** `whatsapp-search` (depends on the RAG ingestion file existing).
