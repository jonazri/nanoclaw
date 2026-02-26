# Feature Request: Voice Transcript Storage Enhancement

**Date:** 2026-02-25
**Status:** new
**Requested by:** Yonatan Azrielant
**Priority:** nice-to-have

## Current State

Voice transcription **is already implemented** in NanoClaw:
- Voice messages are transcribed using ElevenLabs Scribe v2
- Transcripts are stored in the `messages` table
- Format: `[Voice: {transcript}] [{speaker tag}]`
- Speaker identification included when available

**Code Location:** `src/channels/whatsapp.ts` (lines 207-263)

**Example stored message:**
```
[Voice: Read the top ten articles on Hacker News right now...] [Direct from Yonatan, 80% match]
```

## Problem

While transcription works, there are potential enhancements:

1. **Transcript-only queries** - Hard to search just the spoken content (includes "[Voice: " prefix and speaker tags)
2. **No audio file reference** - Transcript doesn't link back to original audio
3. **No confidence scores** - Can't filter by transcription quality
4. **No separate audio column** - Audio metadata mixed with transcript
5. **No transcript timestamps** - Don't know when words were spoken within the audio

## Proposed Solution

### Option A: Separate Transcript Column (Minimal Change)

Add a dedicated `transcript` column to messages table:

```sql
ALTER TABLE messages ADD COLUMN transcript TEXT;
ALTER TABLE messages ADD COLUMN audio_file_path TEXT;
ALTER TABLE messages ADD COLUMN speaker_similarity REAL;
```

**Benefits:**
- Clean separation: `content` has full message, `transcript` has only spoken words
- Easy queries: `WHERE transcript LIKE '%keyword%'`
- Preserves backward compatibility
- Minimal code changes

**Message Example:**
```
content: "[Voice: How's the voice recognition...] [Direct from Yonatan, 88% match]"
transcript: "How's the voice recognition scoring coming along?"
audio_file_path: "data/voice-audio/17732662600@s.whatsapp.net/1771956468.ogg"
speaker_similarity: 0.88
```

### Option B: Structured Voice Metadata (More Complete)

Store voice message metadata as JSON in a new column:

```sql
ALTER TABLE messages ADD COLUMN voice_metadata TEXT;  -- JSON
```

**JSON Structure:**
```json
{
  "transcript": "How's the voice recognition scoring coming along?",
  "speaker": {
    "name": "Yonatan",
    "similarity": 0.88,
    "confidence": "high"
  },
  "audio": {
    "path": "data/voice-audio/17732662600@s.whatsapp.net/1771956468.ogg",
    "duration_seconds": 12.5,
    "format": "ogg",
    "size_bytes": 45823
  },
  "transcription": {
    "provider": "elevenlabs-scribe-v2",
    "confidence": 0.95,
    "language": "en",
    "model": "scribe-v2"
  },
  "timestamps": [
    { "word": "How's", "start": 0.0, "end": 0.3 },
    { "word": "the", "start": 0.4, "end": 0.5 },
    ...
  ]
}
```

**Benefits:**
- Complete voice message context
- Queryable with JSON functions
- Supports future enhancements (word timestamps, multi-speaker)
- No schema changes for new metadata

**Cons:**
- More complex queries
- Larger database size
- Requires JSON extraction for simple queries

### Option C: Separate Voice Messages Table (Most Normalized)

Create dedicated table for voice messages:

```sql
CREATE TABLE voice_messages (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id),
  transcript TEXT NOT NULL,
  audio_file_path TEXT,
  audio_duration_seconds REAL,
  audio_format TEXT,
  audio_size_bytes INTEGER,
  speaker_name TEXT,
  speaker_similarity REAL,
  speaker_confidence TEXT,
  transcription_provider TEXT,
  transcription_confidence REAL,
  transcription_language TEXT,
  created_at TEXT,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX idx_voice_transcript ON voice_messages(transcript);
CREATE INDEX idx_voice_speaker ON voice_messages(speaker_name);
```

**Benefits:**
- Normalized design
- Fast queries on voice-specific data
- Easy to add columns without affecting messages table
- Clear separation of concerns

**Cons:**
- JOIN required for voice message queries
- More complex schema
- Migration effort

## Recommendation

**Option A (Separate Transcript Column)** is recommended:
- Minimal changes to existing system
- Solves primary use case (clean transcript queries)
- Easy migration
- Backward compatible

Implement now, can evolve to Option B/C later if needed.

## Alternatives Considered

### Alternative 1: Leave As-Is
- **Rejected:** Current format makes transcript-only queries awkward (need to strip "[Voice: " and speaker tags)

### Alternative 2: Full Text Search Index
- **Rejected:** Doesn't solve metadata separation, just makes searches faster

### Alternative 3: External Transcript Store
- **Rejected:** Adds complexity, fragments data

## Acceptance Criteria

### For Option A (Recommended):
- [ ] Add `transcript`, `audio_file_path`, `speaker_similarity` columns
- [ ] Populate transcript with clean spoken text (no "[Voice: " wrapper)
- [ ] Store audio file path when audio is saved
- [ ] Store speaker similarity score (0.0-1.0)
- [ ] Migrate existing voice messages to populate new columns
- [ ] Update WhatsApp channel to use new columns
- [ ] Queries work: `SELECT transcript FROM messages WHERE transcript LIKE '%keyword%'`
- [ ] Original `content` column unchanged for backward compatibility
- [ ] Documentation updated

## Technical Notes

### Migration Script

```sql
-- Add columns
ALTER TABLE messages ADD COLUMN transcript TEXT;
ALTER TABLE messages ADD COLUMN audio_file_path TEXT;
ALTER TABLE messages ADD COLUMN speaker_similarity REAL;

-- Migrate existing voice messages
UPDATE messages
SET transcript = SUBSTRING(content, 9, INSTR(content, ']') - 9)
WHERE content LIKE '[Voice: %';

-- Extract speaker similarity from existing messages
UPDATE messages
SET speaker_similarity = CAST(
  SUBSTRING(content, INSTR(content, ', ') + 2, INSTR(content, '% match]') - INSTR(content, ', ') - 2)
  AS REAL) / 100.0
WHERE content LIKE '%% match]';

-- Create indexes
CREATE INDEX idx_transcript ON messages(transcript);
```

### Code Changes

**File:** `src/channels/whatsapp.ts`

```typescript
// After transcription (line ~258)
if (transcript) {
  finalContent = `[Voice: ${transcript}]${speakerTag}`;

  // NEW: Store clean transcript separately
  cleanTranscript = transcript;
  audioFilePath = audioSavePath;  // from line 218
  speakerSimilarityScore = result?.similarity || null;

  logger.info({ chatJid, length: transcript.length, speakerTag }, 'Transcribed voice message');
}
```

**File:** `src/db.ts` (or wherever messages are inserted)

```typescript
interface MessageInsert {
  id: string
  chat_jid: string
  sender_name: string
  content: string
  timestamp: string
  // NEW fields:
  transcript?: string
  audio_file_path?: string
  speaker_similarity?: number
}

function insertMessage(db: Database, msg: MessageInsert): void {
  const stmt = db.prepare(`
    INSERT INTO messages (
      id, chat_jid, sender_name, content, timestamp,
      transcript, audio_file_path, speaker_similarity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    msg.id,
    msg.chat_jid,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.transcript || null,
    msg.audio_file_path || null,
    msg.speaker_similarity || null
  );
}
```

### Query Examples

**Find all transcripts mentioning "Hacker News":**
```sql
SELECT timestamp, sender_name, transcript, speaker_similarity
FROM messages
WHERE transcript LIKE '%Hacker News%'
ORDER BY timestamp DESC;
```

**Get voice messages with low speaker confidence:**
```sql
SELECT timestamp, transcript, speaker_similarity
FROM messages
WHERE speaker_similarity IS NOT NULL
  AND speaker_similarity < 0.70
ORDER BY timestamp DESC;
```

**Find longest voice messages:**
```sql
SELECT timestamp, LENGTH(transcript) as chars, transcript
FROM messages
WHERE transcript IS NOT NULL
ORDER BY chars DESC
LIMIT 10;
```

## Future Enhancements

- Word-level timestamps (for jump-to-word playback)
- Multi-speaker detection within single voice message
- Transcript editing (correct mistakes)
- Audio playback from web interface
- Transcript search with highlighting
- Voice message analytics (average length, most active speakers)

## Related

- Voice Recognition Setup (already implemented)
- ElevenLabs Transcription (already implemented)
- Speaker Identification (already implemented)

## Questions for Host

1. **Column approach:** Option A (columns), Option B (JSON), or Option C (separate table)?
2. **Migration:** Backfill existing voice messages or only new ones?
3. **Audio retention:** Keep audio files indefinitely or expire after X days?
4. **Indexing:** Full-text search on transcripts or simple LIKE queries sufficient?
