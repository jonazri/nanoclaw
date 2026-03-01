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
