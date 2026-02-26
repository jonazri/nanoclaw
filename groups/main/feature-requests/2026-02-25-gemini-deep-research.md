# Feature Request: Google Gemini Deep Research Integration

**Date:** 2026-02-25
**Status:** new
**Requested by:** Yonatan Azrielant
**Priority:** important

## Problem

Complex research tasks require:
- Multi-source information gathering
- Deep analysis across multiple domains
- Synthesis of conflicting information
- Citation tracking and source verification
- Iterative refinement of search queries

Currently, Andy uses:
- **WebSearch** - Basic web search with limited depth
- **WebFetch** - Single-page content extraction
- **Perplexity** - Good for research but external dependency

**Limitations:**
- WebSearch provides surface-level results
- Multi-step research requires manual orchestration
- No automatic source verification or cross-referencing
- Citation tracking is manual
- Limited depth for complex topics

**Gap:** Google Gemini's Deep Research agent provides autonomous, multi-step research with automatic source evaluation, iteration, and comprehensive synthesis—capabilities that would significantly enhance Andy's research abilities.

## Proposed Solution

### Core Capability

Integrate Google Gemini 2.0 Flash with Deep Research mode as a skill available to Andy:

```bash
/gemini-research "Analyze the current state of quantum computing hardware and identify the 3 most promising approaches for achieving quantum advantage in the next 5 years"
```

**What Gemini Deep Research Provides:**
1. **Autonomous multi-step research** - Formulates follow-up queries automatically
2. **Source diversity** - Searches across academic papers, news, blogs, documentation
3. **Iterative refinement** - Adjusts search strategy based on findings
4. **Synthesis** - Creates comprehensive reports with citations
5. **Source evaluation** - Assesses credibility and relevance
6. **Structured output** - Well-organized research reports

### Architecture

**New Skill:** `.claude/skills/gemini-research/`

```yaml
skill: gemini-research
description: "Deep research using Google Gemini 2.0 Flash with autonomous multi-step investigation"
version: 1.0.0
```

**Implementation:**

```typescript
// src/gemini-research.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

interface DeepResearchOptions {
  topic: string
  depth: 'quick' | 'standard' | 'comprehensive'  // Controls iteration count
  domains?: string[]  // Restrict search domains
  language?: string
  maxSources?: number
  format: 'summary' | 'detailed' | 'structured'
}

interface ResearchResult {
  topic: string
  summary: string  // Executive summary
  findings: Finding[]
  sources: Source[]
  completedAt: string
  iterationCount: number
  confidence: number
}

interface Finding {
  statement: string
  evidence: string[]
  sources: string[]  // Source IDs
  confidence: 'high' | 'medium' | 'low'
}

interface Source {
  id: string
  title: string
  url: string
  credibility: 'high' | 'medium' | 'low' | 'unverified'
  relevance: number
  publishDate?: string
  author?: string
}

async function performDeepResearch(options: DeepResearchOptions): Promise<ResearchResult> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192  // Gemini 2.0 supports long context
    }
  });

  // Construct deep research prompt
  const prompt = buildDeepResearchPrompt(options);

  // Gemini handles multi-step search autonomously
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    // Enable grounding for source verification
    tools: [{ googleSearchRetrieval: {} }]
  });

  return parseResearchResult(result.response.text());
}
```

### User Experience

**Simple Research:**
```
User: Research the current state of LLM reasoning capabilities
Andy: I'll use Gemini Deep Research to investigate this comprehensively.
      [5 minutes later]
      I've completed a deep research investigation with 15 sources.

      Key Findings:
      • Chain-of-thought prompting improves reasoning by 23% on math tasks
      • Self-consistency techniques show 15-20% gains on logic problems
      • Current limitations: struggle with multi-step planning (>5 steps)

      [Full report available at /workspace/group/research/llm-reasoning-2026-02-25.md]
```

**Structured Research:**
```
User: /gemini-research "What are the security implications of running AI agents with file system access?"

Andy: Starting comprehensive research...

      Research Complete (8 iterations, 23 sources analyzed)

      Executive Summary:
      AI agents with filesystem access present 4 primary risk categories...

      High-Confidence Findings:
      1. Container isolation reduces risk by 87% (5 sources, high credibility)
      2. Read-only mounts prevent 94% of modification attacks (3 sources)
      3. Path traversal remains top vulnerability (12 sources, mixed credibility)

      [Detailed report: 3,450 words with citations]
```

### Configuration

**Environment Variables:**
```bash
GEMINI_API_KEY=...
GEMINI_DEEP_RESEARCH_ENABLED=true
GEMINI_MAX_ITERATIONS=10  # Cost control
GEMINI_TIMEOUT_MINUTES=15
```

**Group Settings (`CLAUDE.md`):**
```markdown
## Deep Research Settings
- Auto research threshold: Topics requiring >3 sources → use Gemini
- Manual trigger: /gemini-research or "deep research on..."
- Cost limit: $5/day on Gemini API
- Save reports to: /workspace/group/research/
```

## Alternatives Considered

### Alternative 1: Perplexity Pro API
- **Pros:** Already using for research, good quality
- **Cons:** External dependency, less control over iteration, higher cost
- **Rejected:** Gemini Deep Research is purpose-built for multi-step research

### Alternative 2: Multi-Agent Research Pipeline (Custom)
- **Pros:** Full control, can customize for specific domains
- **Cons:** Requires significant engineering, maintenance burden, reinventing the wheel
- **Rejected:** Gemini Deep Research provides this out-of-box

### Alternative 3: Claude + Manual Research Orchestration
- **Pros:** Uses existing Claude API
- **Cons:** Requires manual multi-step prompting, no automatic source grounding
- **Rejected:** Not autonomous, requires human intervention for iterative queries

### Alternative 4: Wait for Claude to Add Deep Research
- **Pros:** Single vendor
- **Cons:** No ETA, may never happen
- **Rejected:** Gemini offers this capability now

## Acceptance Criteria

- [ ] Gemini API integration configured with API key
- [ ] Skill accessible via `/gemini-research` command or natural language
- [ ] Deep research performs multi-step autonomous investigation
- [ ] Results include structured findings with citations
- [ ] Source credibility assessment included
- [ ] Research reports saved to group folder automatically
- [ ] Cost controls prevent runaway API usage
- [ ] Timeout handling for long-running research (>15 min)
- [ ] Error handling for API failures or rate limits
- [ ] Progress updates sent to user during long research
- [ ] Results formatted for WhatsApp (markdown-compatible)
- [ ] Option to specify research depth (quick/standard/comprehensive)
- [ ] Works across all messaging platforms (WhatsApp, Telegram, etc.)

## Technical Notes

### API Setup

**Install SDK:**
```bash
npm install @google/generative-ai
```

**Authentication:**
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
```

**Get API Key:**
- Visit: https://aistudio.google.com/apikey
- Create new API key for project
- Add to `.env`: `GEMINI_API_KEY=...`

### Gemini 2.0 Flash Capabilities

**Model:** `gemini-2.0-flash-exp`
- 1M token context window
- Multimodal (text, images, video, audio)
- Grounding via Google Search
- Function calling support
- Competitive pricing vs. Claude

**Grounding (Key Feature):**
```typescript
const result = await model.generateContent({
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  tools: [{
    googleSearchRetrieval: {
      dynamicRetrievalConfig: {
        mode: 'MODE_DYNAMIC',  // Automatic search when needed
        dynamicThreshold: 0.3   // Trigger search on uncertain topics
      }
    }
  }]
});

// Response includes grounding metadata
const groundingMetadata = result.response.candidates[0].groundingMetadata;
// Contains: searchEntryPoint, groundingChunks, webSearchQueries
```

### Prompt Engineering for Deep Research

```typescript
function buildDeepResearchPrompt(options: DeepResearchOptions): string {
  return `
You are a deep research agent. Investigate the following topic comprehensively:

TOPIC: ${options.topic}

RESEARCH DEPTH: ${options.depth}
${options.domains ? `RESTRICT TO DOMAINS: ${options.domains.join(', ')}` : ''}
${options.maxSources ? `MAX SOURCES: ${options.maxSources}` : ''}

INSTRUCTIONS:
1. Formulate initial search queries to understand the topic
2. Review sources and identify knowledge gaps
3. Iteratively refine searches to fill gaps
4. Evaluate source credibility (peer-reviewed > news > blogs)
5. Cross-reference claims across multiple sources
6. Synthesize findings into structured report

OUTPUT FORMAT:
## Executive Summary
[2-3 sentence overview]

## Key Findings
[Bulleted list with confidence levels and citations]

## Detailed Analysis
[In-depth exploration organized by theme]

## Sources
[Numbered list with URLs, credibility ratings, relevance scores]

## Research Process
[Iterations performed, queries used, gaps identified]

Begin research now.
`;
}
```

### Cost Management

**Gemini 2.0 Flash Pricing (as of Feb 2026):**
- Input: ~$0.075 per 1M tokens
- Output: ~$0.30 per 1M tokens
- Grounding: Free (included with search retrieval)

**Estimated Costs:**
- Quick research (3 iterations): ~$0.05
- Standard research (5-7 iterations): ~$0.15
- Comprehensive research (10+ iterations): ~$0.50

**Cost Controls:**
```typescript
interface CostControl {
  dailyLimit: number  // Max $ per day
  perResearchLimit: number  // Max $ per query
  iterationLimit: number  // Max search iterations
  tokenLimit: number  // Max output tokens
}

const costTracker = {
  dailySpend: 0,
  lastReset: new Date().toISOString().split('T')[0]
};

function checkCostLimits(options: DeepResearchOptions): void {
  if (costTracker.dailySpend >= COST_CONTROL.dailyLimit) {
    throw new Error('Daily Gemini API budget exceeded');
  }
}
```

### Integration with Existing Skills

**Trigger Patterns:**
```typescript
// Auto-detect deep research needs
if (userMessage.includes('research') &&
    (userMessage.includes('comprehensive') ||
     userMessage.includes('detailed') ||
     userMessage.includes('analyze'))) {
  return await performDeepResearch({
    topic: extractTopicFromMessage(userMessage),
    depth: 'standard'
  });
}

// Explicit trigger
if (userMessage.startsWith('/gemini-research')) {
  const topic = userMessage.replace('/gemini-research', '').trim();
  return await performDeepResearch({ topic, depth: 'comprehensive' });
}
```

**Skill Composition:**
```typescript
// Use Gemini for initial research, Claude for synthesis
const researchFindings = await performDeepResearch({ topic });
const claudeSynthesis = await claudeAPI.synthesize({
  context: researchFindings,
  instruction: 'Create actionable recommendations based on this research'
});
```

### Output Storage

```typescript
async function saveResearchReport(result: ResearchResult): Promise<string> {
  const filename = `research-${slugify(result.topic)}-${formatDate(new Date())}.md`;
  const path = `/workspace/group/research/${filename}`;

  const markdown = formatAsMarkdown(result);
  await fs.writeFile(path, markdown);

  return path;
}
```

### Progress Updates

For long-running research (>2 minutes), send progress updates:

```typescript
async function performDeepResearchWithUpdates(options: DeepResearchOptions): Promise<ResearchResult> {
  await sendMessage({
    text: `Starting deep research on: ${options.topic}...`,
    sender: 'Research Agent'
  });

  let iterationCount = 0;
  const maxIterations = options.depth === 'comprehensive' ? 10 : 5;

  // ... research loop

  if (iterationCount > 3) {
    await sendMessage({
      text: `Research in progress... analyzed ${iterationCount} iterations, ${sources.length} sources so far`,
      sender: 'Research Agent'
    });
  }

  const result = await finalizeResearch();

  await sendMessage({
    text: `Research complete! Analyzed ${result.sources.length} sources across ${result.iterationCount} iterations.`,
    sender: 'Research Agent'
  });

  return result;
}
```

## Related

- **Perplexity Research Skill** - Existing research capability (could be complementary)
- **WebSearch Tool** - Basic search (Gemini would enhance for deep topics)

## Dependencies

- `@google/generative-ai` - Official Gemini SDK
- Gemini API key (free tier available, paid for production)
- File system access to save research reports

## Future Enhancements

- **Multi-modal research:** Analyze images, videos, PDFs alongside text
- **Citation export:** Generate BibTeX, APA, MLA citations automatically
- **Research continuations:** "Continue researching X" builds on previous work
- **Domain-specific research:** Academic papers, legal documents, medical literature
- **Collaborative research:** Multiple agents research sub-topics in parallel
- **Real-time updates:** Monitor topics over time, alert on new findings

## Testing Plan

1. **Unit Tests:**
   - Mock Gemini API responses
   - Test cost tracking and limits
   - Test error handling (API failures, timeouts)

2. **Integration Tests:**
   - Perform real research on known topics
   - Verify source citation accuracy
   - Test iteration logic and convergence
   - Check output formatting (markdown compatibility)

3. **User Acceptance:**
   - Research quality assessment (vs. Perplexity, manual research)
   - Response time acceptable (<10 min for standard depth)
   - Cost per research within budget ($0.50 max for comprehensive)

## Questions for Host

1. **Budget:** What's acceptable monthly spend on Gemini API?
2. **Integration:** Prefer skill-based or native integration?
3. **Trigger:** Auto-detect research needs or require explicit command?
4. **Storage:** Save all research reports or only on-demand?
5. **Scope:** WhatsApp only or all platforms?
6. **Timing:** Should long research run async (scheduled task)?
