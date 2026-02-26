# Feature Request: Image Analysis in WhatsApp Groups

**Date:** 2026-02-25
**Status:** new
**Requested by:** Yonatan Azrielant
**Priority:** important

## Problem

WhatsApp groups frequently contain images that require analysis, interpretation, or context extraction:
- Screenshots of error messages or logs
- Photos of documents, receipts, or whiteboards
- Diagrams, charts, or infographics
- Product photos requiring identification or description
- Memes or visual content requiring context understanding

Currently, Andy can only see image metadata (filename, timestamp) but cannot analyze the visual content. This creates a significant gap in conversational understanding and limits usefulness in visual-heavy group chats.

**User Impact:**
- Cannot answer "What does this screenshot say?"
- Cannot extract text from document photos
- Cannot identify objects or people in photos
- Cannot provide context about visual content shared in groups
- Requires manual re-typing of text from images

## Proposed Solution

### Core Capability
Integrate multimodal vision analysis into the WhatsApp message processing pipeline, enabling Andy to:
1. **Detect** when a message contains images
2. **Download** image data from WhatsApp
3. **Analyze** using a vision API or multimodal model
4. **Respond** with extracted insights (text, descriptions, identified objects)

### Architecture Options

**Option A: Google Cloud Vision API** (Recommended for production)
- **Pros:**
  - Specialized for OCR, object detection, label detection
  - Highly accurate for text extraction
  - Fast response times
  - Cost-effective for production use
  - Handles multiple image formats
- **Cons:**
  - Requires Google Cloud account + API key
  - Another external dependency
  - Limited reasoning capability (labels vs. understanding)

**Option B: Claude with Vision (Multimodal)**
- **Pros:**
  - Already using Anthropic API
  - Deep reasoning about visual content
  - Can answer complex questions about images
  - Understands context and relationships
  - Single vendor simplification
- **Cons:**
  - Higher API costs per image
  - May be slower than specialized OCR services
  - Requires image encoding (base64)

**Option C: Hybrid Approach**
- Use Google Vision for OCR/text extraction (fast, cheap)
- Use Claude Vision for complex reasoning (when needed)
- Route based on use case

### Implementation Flow

```
WhatsApp Message (with image)
    ↓
Download image from WhatsApp Media
    ↓
Detect image type/purpose (OCR needed? Complex reasoning?)
    ↓
Route to appropriate vision service
    ↓
Extract insights (text, labels, description)
    ↓
Include vision analysis in Claude's context
    ↓
Claude responds with full awareness of image content
```

### Configuration

Add to `.env`:
```bash
# Vision API Configuration
VISION_PROVIDER=google|claude|hybrid  # Default: claude
GOOGLE_VISION_API_KEY=...
VISION_MAX_IMAGE_SIZE_MB=10
VISION_CACHE_ENABLED=true
```

Add to group `CLAUDE.md`:
```markdown
## Image Analysis Settings
- Automatic analysis: enabled/disabled
- Analysis detail level: basic (labels only) | full (detailed description)
- OCR enabled: true/false
- Cost control: max $X per day on vision API calls
```

### User Experience

**Automatic Mode:**
```
User: [sends screenshot of error message]
Andy: I can see this is a Python traceback. The error is:
      "ModuleNotFoundError: No module named 'requests'"

      You need to install the requests library:
      pip install requests
```

**Explicit Request:**
```
User: What does this diagram show?
Andy: [analyzes image] This is a system architecture diagram showing...
```

**OCR Mode:**
```
User: Extract text from this receipt
Andy: [performs OCR]
      Receipt from Target
      Date: 02/24/2026
      Items:
      - Milk $4.99
      - Bread $3.49
      Total: $8.48
```

## Alternatives Considered

### Alternative 1: Local Vision Models (CLIP, LLaVA)
- **Rejected because:** Requires significant compute resources (GPU), adds deployment complexity, slower than cloud APIs

### Alternative 2: Manual Image Upload to Claude Web
- **Rejected because:** Breaks conversational flow, requires user to leave WhatsApp, defeats purpose of integrated assistant

### Alternative 3: Image Descriptions Only (No OCR)
- **Rejected because:** OCR is one of the most valuable use cases (screenshots, documents)

### Alternative 4: Wait for WhatsApp to Add Native Vision
- **Rejected because:** No indication WhatsApp will add this, and we can provide value now

## Acceptance Criteria

- [ ] WhatsApp messages with images trigger vision analysis
- [ ] OCR extracts text from screenshots and documents accurately
- [ ] Object detection identifies items in photos
- [ ] Complex images receive detailed descriptions
- [ ] Vision analysis results are included in Claude's context
- [ ] Users can disable/enable vision analysis per group
- [ ] Cost controls prevent runaway API usage
- [ ] Image analysis works for: PNG, JPG, WEBP formats
- [ ] Error handling for unsupported formats or failed API calls
- [ ] Optional caching to avoid re-analyzing identical images
- [ ] Performance: Analysis completes within 5 seconds for typical images
- [ ] Privacy: Images are not stored after analysis (unless explicitly configured)

## Technical Notes

### Integration Points

**File:** `src/channels/whatsapp.ts`
- Detect when message has `message.imageMessage` or `message.videoMessage` (thumbnail)
- Download media using `downloadMediaMessage()`
- Pass image buffer to vision service

**New File:** `src/vision-analysis.ts`
```typescript
interface VisionProvider {
  analyzeImage(buffer: Buffer, options?: AnalysisOptions): Promise<VisionResult>
}

interface VisionResult {
  provider: 'google' | 'claude'
  text?: string          // OCR extracted text
  labels?: string[]      // Object/scene labels
  description?: string   // Full description
  confidence: number
  processingTimeMs: number
}

interface AnalysisOptions {
  mode: 'ocr' | 'labels' | 'description' | 'auto'
  language?: string
  maxTokens?: number
}
```

**Vision Providers:**
- `GoogleVisionProvider` - Uses Google Cloud Vision API
- `ClaudeVisionProvider` - Uses Claude 3.5 Sonnet with vision
- `HybridVisionProvider` - Routes based on image characteristics

### Google Cloud Vision Setup

```typescript
import vision from '@google-cloud/vision';

const client = new vision.ImageAnnotatorClient({
  apiKey: process.env.GOOGLE_VISION_API_KEY
});

const [result] = await client.textDetection({
  image: { content: imageBuffer.toString('base64') }
});
```

### Claude Vision Setup

```typescript
const response = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{
    role: 'user',
    content: [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: imageBuffer.toString('base64')
        }
      },
      {
        type: 'text',
        text: 'Describe this image in detail and extract any text you see.'
      }
    ]
  }]
});
```

### Cost Considerations

**Google Cloud Vision:**
- OCR: $1.50 per 1,000 images
- Label Detection: $1.50 per 1,000 images
- Very cost-effective for high volume

**Claude Vision:**
- Images cost ~$4.80 per 1,000 images (base tokens)
- Higher quality reasoning but 3x+ cost

**Recommendation:** Start with Claude Vision for simplicity (already using Anthropic), add Google Vision if cost becomes concern at scale.

### Security & Privacy

- Images should be processed in-memory only (never written to disk by default)
- Optional caching should use content-hash and expire after 24 hours
- Vision API calls should respect rate limits
- Consider GDPR implications if storing image analysis results

### Performance Optimization

- Parallel processing: Download image while constructing response
- Caching: Hash-based deduplication for frequently shared images
- Lazy loading: Only analyze if user references the image
- Thumbnail analysis: For video messages, analyze first frame only

### Future Enhancements

- Video analysis (frame sampling + scene detection)
- Multi-image comparison ("Which photo is better?")
- Image generation based on descriptions
- Visual search ("Find similar images in our history")
- Diagram-to-code (convert whiteboard sketches to implementation)

## Related

None currently.

## Dependencies

- `@google-cloud/vision` (if using Google Vision API)
- Anthropic SDK already supports vision (claude-3-5-sonnet)
- WhatsApp Baileys library already supports media download

## Testing Plan

1. **Unit Tests:**
   - Mock vision API responses
   - Test image format handling
   - Test error cases (corrupted images, API failures)

2. **Integration Tests:**
   - Send test images via WhatsApp
   - Verify OCR accuracy on known screenshots
   - Verify object detection on known photos
   - Test performance with large images (10MB)

3. **User Acceptance:**
   - Test with real WhatsApp group images
   - Verify conversational context includes vision insights
   - Check cost tracking and rate limiting

## Questions for Host

1. **Provider preference:** Google Vision API, Claude Vision, or hybrid?
2. **Cost budget:** What's acceptable monthly spend on vision API calls?
3. **Privacy stance:** Store image analysis results or process-and-discard?
4. **Scope:** WhatsApp only, or also Telegram/Discord/other platforms?
5. **Deployment:** New dependency setup acceptable (Google Cloud account)?
