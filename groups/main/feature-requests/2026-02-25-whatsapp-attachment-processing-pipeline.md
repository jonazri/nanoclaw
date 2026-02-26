# Feature Request: WhatsApp Attachment Processing Pipeline

**Date:** 2026-02-25
**Status:** new
**Requested by:** Yonatan Azrielant
**Priority:** important

## Problem

WhatsApp group summaries are currently incomplete because they only process text messages, missing critical content from attachments:

1. **Voice notes** - Conversations happen via voice but aren't fully captured in summaries
2. **Images** - Screenshots, diagrams, photos contain important context that's invisible to summaries
3. **PDFs** - Documents shared in groups have content that should be searchable and summarizable
4. **Videos** - Video content is completely ignored

**Current State:**
- Voice transcription EXISTS but transcripts are formatted in a way that makes them harder to query/analyze
- Image analysis requested but not implemented
- PDF processing not implemented
- All these operate independently without unified storage strategy

**Impact on Group Summaries:**
When running `/whatsapp-summary`, the system only sees:
```
User: [sent voice note]
User: [sent image]
User: [sent document.pdf]
```

This creates an incomplete picture of group activity, missing:
- What was said in voice notes
- What images showed (diagrams, screenshots, error messages)
- What documents contained (reports, proposals, contracts)

## Proposed Solution

Implement a **unified attachment processing pipeline** that:
1. Detects all attachment types in WhatsApp messages
2. Downloads and processes each attachment appropriately
3. Stores processed content in the messages database
4. Makes all content searchable and available for group summaries

### Architecture

```
WhatsApp Message with Attachment
    ↓
┌─────────────────────────────────────┐
│   Attachment Detection              │
│   (voice, image, pdf, video)        │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│   Download & Type Routing           │
└──────────────┬──────────────────────┘
               ↓
        ┌──────┴──────┐
        ↓              ↓              ↓              ↓
┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Voice        │ │ Image    │ │ PDF      │ │ Video    │
│ Processor    │ │ Processor│ │ Processor│ │ Processor│
└──────┬───────┘ └─────┬────┘ └─────┬────┘ └─────┬────┘
       │               │            │            │
       ↓               ↓            ↓            ↓
┌─────────────────────────────────────────────────┐
│  ElevenLabs   │  Claude    │  Claude  │ Claude │
│  Scribe       │  Vision    │  + OCR   │ Vision │
└──────┬────────────────┬────────────┬──────────┬─┘
       ↓                ↓            ↓          ↓
┌─────────────────────────────────────────────────┐
│     Unified Storage in messages table           │
│     - transcript column (voice)                 │
│     - image_analysis column (images)            │
│     - document_content column (PDFs)            │
│     - video_analysis column (videos)            │
│     - attachment_metadata JSON                  │
└─────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────┐
│   Available for Group Summaries     │
│   and Semantic Search               │
└─────────────────────────────────────┘
```

### Database Schema Enhancement

Add new columns to `messages` table for processed attachment content:

```sql
ALTER TABLE messages ADD COLUMN transcript TEXT;              -- Voice transcripts
ALTER TABLE messages ADD COLUMN image_analysis TEXT;          -- Image descriptions + OCR
ALTER TABLE messages ADD COLUMN document_content TEXT;        -- PDF/doc extracted text
ALTER TABLE messages ADD COLUMN video_analysis TEXT;          -- Video descriptions
ALTER TABLE messages ADD COLUMN attachment_metadata TEXT;     -- JSON with metadata

CREATE INDEX idx_transcript ON messages(transcript);
CREATE INDEX idx_image_analysis ON messages(image_analysis);
CREATE INDEX idx_document_content ON messages(document_content);
```

**Attachment Metadata JSON Structure:**
```typescript
interface AttachmentMetadata {
  type: 'voice' | 'image' | 'pdf' | 'video' | 'document';
  filename?: string;
  filePath?: string;                    // Local storage path
  fileSize?: number;
  mimeType?: string;
  duration?: number;                    // For audio/video

  // Processing info
  processed: boolean;
  processedAt?: string;
  processor?: string;                   // 'elevenlabs', 'claude-vision', etc.
  processingTimeMs?: number;
  confidence?: number;

  // Voice-specific
  speakerName?: string;
  speakerSimilarity?: number;

  // Image/PDF-specific
  ocrText?: string;
  labels?: string[];                    // Object detection labels

  // Error handling
  error?: string;
  retryCount?: number;
}
```

### Processing Implementations

#### 1. Voice Note Processing

**Already partially implemented** - needs enhancement:

```typescript
// Existing: src/channels/whatsapp.ts (lines 207-263)
// Enhancement needed:

async function processVoiceNote(audioBuffer: Buffer, sender: string): Promise<VoiceResult> {
  // 1. Transcribe using ElevenLabs Scribe v2 (ALREADY IMPLEMENTED)
  const transcript = await transcribeAudio(audioBuffer, sender);

  // 2. Store audio file (for playback reference)
  const audioPath = await saveAudioFile(audioBuffer, sender);

  // 3. Return structured result
  return {
    transcript: transcript.text,              // Clean text without [Voice: ] wrapper
    speakerName: transcript.speaker,
    speakerSimilarity: transcript.similarity,
    audioPath: audioPath,
    duration: transcript.duration,
    metadata: {
      type: 'voice',
      processor: 'elevenlabs-scribe-v2',
      processedAt: new Date().toISOString(),
      confidence: transcript.confidence
    }
  };
}

// Store in DB:
INSERT INTO messages (
  content,           -- "[Voice note from Yonatan]"
  transcript,        -- "Read the top ten articles on Hacker News"
  attachment_metadata
) VALUES (?, ?, ?);
```

**Key Changes:**
- Store **clean transcript** in dedicated column (no `[Voice: ]` wrapper)
- Keep original formatted message in `content` for backward compatibility
- Store metadata as JSON for extensibility

#### 2. Image Processing

**Not yet implemented** - full implementation needed:

```typescript
async function processImage(imageBuffer: Buffer, mimeType: string): Promise<ImageResult> {
  // Use Claude Vision for comprehensive analysis
  const analysis = await analyzeImageWithClaude(imageBuffer, {
    extractText: true,      // OCR
    describeContent: true,  // What's in the image
    detectObjects: true     // Labels
  });

  // Save image file (optional, for reference)
  const imagePath = await saveImageFile(imageBuffer);

  return {
    description: analysis.description,
    ocrText: analysis.extractedText,
    labels: analysis.labels,
    imagePath: imagePath,
    metadata: {
      type: 'image',
      mimeType: mimeType,
      processor: 'claude-vision',
      processedAt: new Date().toISOString(),
      confidence: analysis.confidence
    }
  };
}

// Store in DB:
INSERT INTO messages (
  content,           -- "[Image from User]"
  image_analysis,    -- "Screenshot of Python error: ModuleNotFoundError..."
  attachment_metadata
) VALUES (?, ?, ?);
```

**Analysis Prompt:**
```
Analyze this image and provide:
1. A concise description of what the image shows
2. Extract all visible text (OCR)
3. Identify any objects, people, or key elements
4. Note any technical details (error messages, code, diagrams)

Format your response as:
DESCRIPTION: [brief description]
TEXT: [all extracted text]
LABELS: [comma-separated labels]
```

#### 3. PDF Processing

**Not yet implemented** - full implementation needed:

```typescript
async function processPDF(pdfBuffer: Buffer, filename: string): Promise<PDFResult> {
  // 1. Extract text using pdf-parse or similar
  const extractedText = await extractPDFText(pdfBuffer);

  // 2. Optional: Use Claude to summarize if PDF is long
  let summary = null;
  if (extractedText.length > 10000) {
    summary = await summarizeWithClaude(extractedText, {
      maxLength: 500,
      style: 'concise'
    });
  }

  // 3. Save PDF file
  const pdfPath = await savePDFFile(pdfBuffer, filename);

  return {
    fullText: extractedText,
    summary: summary,
    pageCount: extractedText.pageCount,
    pdfPath: pdfPath,
    metadata: {
      type: 'pdf',
      filename: filename,
      processor: 'pdf-parse',
      processedAt: new Date().toISOString()
    }
  };
}

// Store in DB:
INSERT INTO messages (
  content,           -- "[Document: quarterly-report.pdf]"
  document_content,  -- Full extracted text or summary
  attachment_metadata
) VALUES (?, ?, ?);
```

#### 4. Video Processing (Basic)

**Not yet implemented** - basic implementation:

```typescript
async function processVideo(videoBuffer: Buffer, mimeType: string): Promise<VideoResult> {
  // 1. Extract thumbnail/first frame
  const thumbnail = await extractVideoThumbnail(videoBuffer);

  // 2. Analyze thumbnail with Claude Vision
  const analysis = await analyzeImageWithClaude(thumbnail, {
    describeContent: true
  });

  // 3. Get video metadata
  const metadata = await getVideoMetadata(videoBuffer);

  return {
    description: analysis.description,
    duration: metadata.duration,
    thumbnailPath: await saveThumbnail(thumbnail),
    videoPath: await saveVideoFile(videoBuffer),
    metadata: {
      type: 'video',
      mimeType: mimeType,
      duration: metadata.duration,
      processor: 'claude-vision',
      processedAt: new Date().toISOString()
    }
  };
}

// Store in DB:
INSERT INTO messages (
  content,           -- "[Video from User]"
  video_analysis,    -- "Video showing office space walkthrough"
  attachment_metadata
) VALUES (?, ?, ?);
```

### Integration with Group Summaries

Update the WhatsApp summary workflow to include attachment content:

```typescript
// In whatsapp-summary extraction phase
function extractGroupMessages(groupJid: string, timeRange: TimeRange): Message[] {
  const messages = db.prepare(`
    SELECT
      sender_name,
      content,
      transcript,           -- NEW: Voice content
      image_analysis,       -- NEW: Image content
      document_content,     -- NEW: PDF content
      video_analysis,       -- NEW: Video content
      attachment_metadata,
      timestamp
    FROM messages
    WHERE chat_jid = ?
      AND timestamp BETWEEN ? AND ?
    ORDER BY timestamp ASC
  `).all(groupJid, timeRange.start, timeRange.end);

  // Enrich messages with attachment content
  return messages.map(msg => ({
    sender: msg.sender_name,
    content: combineContentWithAttachments(msg),
    timestamp: msg.timestamp
  }));
}

function combineContentWithAttachments(msg: MessageRow): string {
  let enrichedContent = msg.content;

  // Add voice transcript
  if (msg.transcript) {
    enrichedContent += `\n[Voice: "${msg.transcript}"]`;
  }

  // Add image analysis
  if (msg.image_analysis) {
    enrichedContent += `\n[Image: ${msg.image_analysis}]`;
  }

  // Add document content (first 500 chars or summary)
  if (msg.document_content) {
    const preview = msg.document_content.substring(0, 500);
    enrichedContent += `\n[Document: ${preview}...]`;
  }

  // Add video analysis
  if (msg.video_analysis) {
    enrichedContent += `\n[Video: ${msg.video_analysis}]`;
  }

  return enrichedContent;
}
```

**Before (incomplete):**
```
[Group: Family Chat - 2026-02-24]
- Mom: Dinner at 7?
- Dad: [sent image]
- Sister: [sent voice note]
- Me: Sounds good!
```

**After (complete):**
```
[Group: Family Chat - 2026-02-24]
- Mom: Dinner at 7?
- Dad: [Image: Photo of restaurant menu showing Italian dishes and prices]
- Sister: [Voice: "I'll be there around 7:15, running a bit late from work"]
- Me: Sounds good!
```

### Configuration

Add to `settings.json`:

```json
{
  "attachmentProcessing": {
    "enabled": true,
    "processors": {
      "voice": {
        "enabled": true,
        "provider": "elevenlabs",
        "storeAudioFiles": true,
        "audioRetentionDays": 30
      },
      "images": {
        "enabled": true,
        "provider": "claude-vision",  // or "google-vision"
        "performOCR": true,
        "storeImageFiles": false,
        "maxImageSizeMB": 10
      },
      "pdfs": {
        "enabled": true,
        "extractText": true,
        "autoSummarize": true,
        "summarizeThresholdChars": 10000,
        "storePDFFiles": true,
        "pdfRetentionDays": 90
      },
      "videos": {
        "enabled": true,
        "analyzeThumbnail": true,
        "storeVideoFiles": false
      }
    },
    "costControl": {
      "maxProcessingCostPerDay": 10.00,  // USD
      "warnAtPercentage": 80
    },
    "performance": {
      "processAsync": true,
      "maxConcurrentProcessing": 3,
      "timeoutSeconds": 30
    }
  }
}
```

Add to group `CLAUDE.md`:
```markdown
## Attachment Processing

Attachments are automatically processed:
- Voice notes: Transcribed and searchable
- Images: Analyzed for content, text extracted
- PDFs: Text extracted and summarized
- Videos: Thumbnail analyzed

All processed content is included in group summaries.
```

## Alternatives Considered

### Alternative 1: Process attachments on-demand only
**Rejected:** Group summaries would miss content, requiring manual re-processing

### Alternative 2: Store attachments separately (not in messages table)
**Rejected:** Complicates queries, fragments data, harder to maintain consistency

### Alternative 3: Store only references to processed files
**Rejected:** Slower queries, dependent on external file storage, harder to search

### Alternative 4: Process attachments in background job
**Considered:** Good for performance but adds complexity. May implement later if processing becomes bottleneck.

## Acceptance Criteria

**Voice Processing:**
- [ ] Voice notes transcribed using ElevenLabs Scribe v2
- [ ] Transcripts stored in dedicated `transcript` column (clean text)
- [ ] Speaker identification included in metadata
- [ ] Audio files stored with configurable retention

**Image Processing:**
- [ ] Images analyzed using Claude Vision
- [ ] OCR extracts all visible text
- [ ] Image descriptions stored in `image_analysis` column
- [ ] Object detection labels included in metadata
- [ ] Supports PNG, JPG, WEBP formats

**PDF Processing:**
- [ ] Text extracted from PDFs using pdf-parse
- [ ] Long PDFs auto-summarized (>10k chars)
- [ ] Full text or summary stored in `document_content` column
- [ ] Page count and metadata captured
- [ ] PDFs stored with configurable retention

**Video Processing:**
- [ ] Video thumbnails extracted
- [ ] Thumbnails analyzed with Claude Vision
- [ ] Video descriptions stored in `video_analysis` column
- [ ] Duration and metadata captured

**Database:**
- [ ] New columns added to messages table
- [ ] Indexes created for performance
- [ ] Migration script for existing data
- [ ] Attachment metadata stored as JSON

**Integration:**
- [ ] WhatsApp summary workflow includes all attachment content
- [ ] Semantic search includes transcript/analysis text
- [ ] Queries can filter by attachment type
- [ ] Performance: <5 seconds per attachment processing

**Configuration:**
- [ ] Per-processor enable/disable controls
- [ ] Cost controls and monitoring
- [ ] File retention policies configurable
- [ ] Error handling and retry logic

**User Experience:**
- [ ] Processing happens transparently
- [ ] Errors don't block message delivery
- [ ] Users notified if processing fails
- [ ] Progress visible for long operations

## Technical Notes

### Dependencies

**New:**
- `pdf-parse` - PDF text extraction
- `sharp` or `jimp` - Image manipulation
- `fluent-ffmpeg` - Video thumbnail extraction (optional)

**Existing (already in use):**
- ElevenLabs Scribe v2 - Voice transcription
- Claude Vision - Image/video analysis
- Baileys - WhatsApp media download

### File Storage

**Directory structure:**
```
data/
├── voice-audio/
│   └── {sender_jid}/
│       └── {message_id}.ogg
├── images/
│   └── {sender_jid}/
│       └── {message_id}.jpg
├── documents/
│   └── {sender_jid}/
│       └── {message_id}-{filename}.pdf
└── videos/
    └── {sender_jid}/
        └── {message_id}.mp4
```

**Retention policies:**
- Voice: 30 days (configurable)
- Images: Optional storage, default off
- PDFs: 90 days (configurable)
- Videos: Optional storage, default off

### Processing Order

1. **Synchronous (blocking message insertion):**
   - Download attachment
   - Quick metadata extraction
   - Store message with placeholder content

2. **Asynchronous (background processing):**
   - Process attachment (transcribe, analyze, extract)
   - Update message with processed content
   - Store attachment file (if enabled)

This ensures messages appear immediately while processing happens in background.

### Error Handling

```typescript
interface ProcessingError {
  messageId: string;
  attachmentType: string;
  error: string;
  timestamp: string;
  retryCount: number;
}

// Store failed processing attempts
// Retry with exponential backoff
// Alert user after 3 failures
// Mark as "processing-failed" in metadata
```

### Cost Estimation

**Per 1000 messages with attachments:**
- Voice (ElevenLabs): ~$0.50
- Images (Claude Vision): ~$4.80
- PDFs (Claude summarization): ~$2.00
- Videos (Claude Vision on thumbnail): ~$4.80

**Total estimated cost:** ~$12.10 per 1,000 attachments

**Cost controls:**
- Daily spending limits
- Per-group budgets
- Automatic throttling at 80% of budget
- Weekly cost reports

### Performance Optimization

1. **Parallel processing:** Process multiple attachments concurrently
2. **Caching:** Hash-based deduplication for duplicate files
3. **Lazy processing:** Only process if attachment is referenced
4. **Batch processing:** Group similar attachments for API efficiency
5. **CDN/Storage:** Consider object storage for large files

### Migration Strategy

**Phase 1: Voice (Already Partially Done)**
- Add `transcript` column
- Migrate existing voice messages
- Update WhatsApp channel to use new column

**Phase 2: Images**
- Add `image_analysis` column
- Implement Claude Vision integration
- Process new images going forward

**Phase 3: PDFs**
- Add `document_content` column
- Implement pdf-parse integration
- Process new PDFs going forward

**Phase 4: Videos (Optional)**
- Add `video_analysis` column
- Implement thumbnail extraction + analysis
- Process new videos going forward

**Phase 5: Backfill (Optional)**
- Process historical attachments if desired
- Prioritize recent attachments
- Rate-limited background job

## Related

- [Voice Transcript Storage Enhancement](2026-02-25-voice-transcript-storage-enhancement.md) - Voice processing details
- [Image Analysis in WhatsApp Groups](2026-02-25-image-analysis-vision-api.md) - Image processing details
- WhatsApp Summary Workflow - Consumer of processed attachment data

## Questions for Host

1. **Processing mode:** Synchronous (block on processing) or asynchronous (process in background)?
2. **File storage:** Store all attachments or just processed text/analysis?
3. **Retention:** How long to keep audio files, PDFs, images?
4. **Cost budget:** What's acceptable monthly spend on attachment processing?
5. **Backfill:** Process historical attachments or only new ones going forward?
6. **Priority:** Which attachment types first? (Voice → Images → PDFs → Videos?)
