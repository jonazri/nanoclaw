# Multi-Agent WhatsApp Summary Skill - Design Document
**Date:** February 23, 2026
**Status:** Design Phase

---

## 1. Skill Overview

### Name
`whatsapp-multi-agent-summary`

### Purpose
Generate high-quality, signal-focused summaries of WhatsApp group conversations using a multi-agent architecture with RAG enrichment.

### Key Innovation
Specialist agents with isolated contexts analyze different aspects (signals, patterns, collaborations, actions, historical context), then a synthesis agent combines insights into a cohesive narrative that focuses on newsworthy developments, not routine noise.

---

## 2. Skill Interface

### Command Signature
```bash
whatsapp-multi-agent-summary [OPTIONS]
```

### Options
```
--groups <GROUP_JIDS>      Comma-separated list of group JIDs to analyze
                           Example: "120363417209150057@g.us,16122756438-1595291340@g.us"

--community <NAME>         Analyze all groups in a community
                           Example: "aifs" or "tefillin-connection-operations"

--days <N>                 Number of days to analyze (default: 7)

--output <PATH>            Output file path (default: /workspace/group/SUMMARY.md)

--format <TYPE>            Output format: markdown|json|whatsapp (default: markdown)

--focus <AREAS>            Comma-separated focus areas (default: all)
                           Options: signals,patterns,collaborations,actions

--rag                      Enable RAG context enrichment (default: true)

--team-name <NAME>         Custom team name (default: auto-generated)

--keep-reports             Keep individual specialist reports (default: false)

--verbose                  Show agent progress messages (default: false)
```

### Example Usage
```bash
# Analyze AIFS groups for last 7 days
whatsapp-multi-agent-summary --community aifs --days 7

# Analyze specific groups with RAG disabled
whatsapp-multi-agent-summary --groups "120363417209150057@g.us" --days 30 --rag=false

# Generate JSON output for API consumption
whatsapp-multi-agent-summary --community aifs --format json --output summary.json

# Focus only on signals and collaborations
whatsapp-multi-agent-summary --community aifs --focus signals,collaborations --keep-reports
```

---

## 3. Architecture

### Phase 0: Setup & Configuration
```
Input: Command line args
↓
Parse options
↓
Resolve groups (if --community specified, lookup from communities.json)
↓
Create team with unique name
↓
Prepare specialist agent prompts
```

### Phase 1: Specialist Agent Deployment
```
Spawn 5 agents in parallel:
├── signal-detector        (finds alerts, launches, policy changes)
├── pattern-analyst        (identifies recurring issues and trends)
├── collaboration-tracker  (spots cross-member projects)
├── action-items          (extracts pending decisions)
└── rag-context-agent     (queries historical discussions)

Each agent:
- Gets isolated context with specific mission
- Analyzes messages from specified groups/timeframe
- Writes report to /workspace/group/{agent-name}-report.md
```

### Phase 2: Synthesis
```
Wait for all 5 specialists to complete
↓
Spawn synthesis-agent
↓
Synthesis agent reads all 5 reports
↓
Combines insights following user feedback principles:
  ✓ Focus on major changes, alerts, milestones
  ✓ Highlight collaboration breakthroughs
  ✓ NO participant lists
  ✓ NO vague bullets
  ✓ NO obvious patterns
↓
Writes final summary to specified output path
```

### Phase 3: Cleanup & Response
```
If --keep-reports: Leave specialist reports
Else: Delete temporary reports
↓
Shutdown team
↓
Return summary to user
```

---

## 4. Specialist Agent Designs

### Agent 1: Signal Detector
**Mission:** Find high-signal events (alerts, launches, policy changes, announcements)

**Context Engineering:**
- Focus: "What's newsworthy?"
- Look for: Product launches, policy changes, alerts, major announcements
- Ignore: Routine Q&A, participant lists, daily chatter
- Output format: Event type, date, what happened, significance, impact

**Prompt Template:**
```
You are a Signal Detector agent analyzing WhatsApp groups for HIGH-SIGNAL EVENTS.

Groups to analyze: {GROUP_NAMES}
Time window: Last {DAYS} days

Your mission: Identify NEWSWORTHY events that represent changes, not routine activity.

LOOK FOR:
- Product launches or announcements
- Policy changes or alerts (e.g., certification removed)
- Major milestones or breakthroughs
- Upcoming publications or resources
- Service changes
- External news that impacts the community

IGNORE:
- Routine Q&A exchanges
- Daily operational chatter
- Participant lists
- Obvious patterns like "quick Q&A format"

For each signal detected, provide:
1. Event Type (Alert/Launch/Announcement/Policy Change)
2. Date
3. What happened (specific, not vague)
4. Why it's significant
5. Impact on community

Write your findings to /workspace/group/signals-detected.md
```

---

### Agent 2: Pattern Analyst
**Mission:** Identify recurring issues, trends, and systemic challenges

**Context Engineering:**
- Focus: "What keeps coming up?"
- Look for: Repeated questions, confusion points, systemic issues
- Analyze: Question volume, topic clusters, unresolved debates
- Output format: Pattern description, evidence, significance, trend direction

**Prompt Template:**
```
You are a Pattern Analyst agent analyzing WhatsApp groups for RECURRING ISSUES and TRENDS.

Groups to analyze: {GROUP_NAMES}
Time window: Last {DAYS} days

Your mission: Identify patterns that reveal systemic challenges or opportunities.

LOOK FOR:
- Repeated questions about the same topics
- Recurring confusion or debates
- Emerging technical sophistication needs
- Dependency patterns (reliance on specific people/resources)
- Trend directions (increasing/decreasing/stable)

ANALYZE:
- What questions keep coming back?
- Where are there knowledge gaps?
- Are there conflicting standards causing confusion?
- What processes are breaking down under scale?

For each pattern, provide:
1. Pattern description
2. Evidence (specific examples, frequency)
3. Why it matters
4. Trend direction
5. Potential solutions (if obvious)

DO NOT include obvious patterns like "Quick Q&A format" that provide no actionable insight.

Write your findings to /workspace/group/patterns-found.md
```

---

### Agent 3: Collaboration Tracker
**Mission:** Spot cross-member projects, partnerships, and community-building initiatives

**Context Engineering:**
- Focus: "Who's working together on what?"
- Look for: GitHub collaborations, joint projects, knowledge sharing networks
- Prioritize: First-time collaborations, cultural shifts, community milestones
- Output format: Who's involved, what they're building, why it's noteworthy

**Prompt Template:**
```
You are a Collaboration Tracker agent analyzing WhatsApp groups for CROSS-MEMBER PROJECTS.

Groups to analyze: {GROUP_NAMES}
Time window: Last {DAYS} days

Your mission: Identify meaningful collaborations and community-building initiatives.

LOOK FOR:
- Code collaboration (GitHub PRs, joint development)
- Knowledge sharing networks forming
- Cross-member projects with multiple contributors
- Community initiatives (networking, resource sharing)
- First-time collaborations (culturally significant)

PRIORITIZE:
- Projects representing cultural shifts (e.g., from consumers to builders)
- Collaborations using modern tools (GitHub, open source)
- Initiatives that could spark future collaborations

For each collaboration, provide:
1. Type (Code/Knowledge/Resource/Initiative)
2. Who's involved
3. What they're building/doing
4. Why it's noteworthy
5. Cultural significance (if any)

DO NOT list every message exchange. Focus on MEANINGFUL collaborations with lasting impact.

Write your findings to /workspace/group/collaborations-found.md
```

---

### Agent 4: Action Items Agent
**Mission:** Extract pending decisions, unanswered questions, and follow-up needs

**Context Engineering:**
- Focus: "What needs resolution?"
- Look for: Unanswered questions, debates without conclusions, urgent clarifications
- Prioritize: High urgency items, systemic issues requiring policy
- Output format: Action needed, who raised it, context, urgency level

**Prompt Template:**
```
You are an Action Items agent analyzing WhatsApp groups for PENDING DECISIONS and UNRESOLVED QUESTIONS.

Groups to analyze: {GROUP_NAMES}
Time window: Last {DAYS} days

Your mission: Extract actionable items that require follow-up or resolution.

LOOK FOR:
- Unanswered questions (especially urgent ones)
- Debates that ended without clear resolution
- Requests for resources or guidance
- Policy clarifications needed
- Technical problems without solutions

PRIORITIZE by urgency:
- High: Affects decisions now (e.g., product acceptability)
- Medium: Recurring confusion needing authoritative guidance
- Low: Nice-to-have improvements or requests

For each action item, provide:
1. Urgency level (High/Medium/Low)
2. Action needed (specific, not vague)
3. Who raised it (person and date)
4. Context (why it matters)
5. Who should act (if clear)

Write your findings to /workspace/group/action-items.md
```

---

### Agent 5: RAG Context Agent
**Mission:** Query WhatsApp RAG for historical context to enrich analysis

**Context Engineering:**
- Focus: "What's the historical context?"
- Look for: Past discussions referenced in current messages
- Enrich: Background on people, projects, events mentioned
- Output format: Historical context summary with relevant past conversations

**Prompt Template:**
```
You are a RAG Context agent enriching analysis with HISTORICAL CONTEXT from past WhatsApp conversations.

Groups to analyze: {GROUP_NAMES}
Time window: Last {DAYS} days (but query RAG for older context)

Your mission: Use the whatsapp-search skill to find historical discussions that provide context for current activity.

SEARCH STRATEGY:
1. Identify key topics, people, projects mentioned in recent messages
2. Query RAG for past discussions about those topics
3. Provide historical timeline and context

EXAMPLE QUERIES:
- "Mendy Elishevitz megillah reader GitHub collaboration"
- "tahini hechsher requirements discussion"
- "Manchester Kashrut certification CRC"

For each topic with relevant history, provide:
1. Topic/Project name
2. Timeline of past discussions
3. Key developments over time
4. Why historical context matters now
5. Connections to current activity

Use the whatsapp-search:search() function to query the RAG system.

Write your findings to /workspace/group/rag-context.md
```

---

### Agent 6: Synthesis Agent
**Mission:** Combine all specialist reports into cohesive, signal-focused summary

**Context Engineering:**
- Focus: "What's the story?"
- Read: All 5 specialist reports
- Combine: Insights with appropriate weighting (signals > patterns > actions)
- Format: Clean narrative following user feedback principles

**Prompt Template:**
```
You are a Synthesis agent combining specialist reports into a HIGH-QUALITY SUMMARY.

Your mission: Read all specialist reports and produce ONE cohesive summary focused on SIGNAL, not noise.

REPORTS TO READ:
- /workspace/group/signals-detected.md
- /workspace/group/patterns-found.md
- /workspace/group/collaborations-found.md
- /workspace/group/action-items.md
- /workspace/group/rag-context.md

CRITICAL RULES (from user feedback):
❌ DO NOT include:
- Lists of "active participants"
- Vague bullets like "Product ingredients verification discussions"
- Obvious patterns like "Quick Q&A format"
- Play-by-play of who said what
- Minutiae of daily Q&A

✅ DO include:
- Major kashrus alerts or policy changes
- Product launches and new tools
- Collaboration breakthroughs (especially GitHub/code projects)
- Newsworthy developments that represent shifts or milestones
- Changes in standards being adopted

OUTPUT FORMAT:
# Summary: {TIME_PERIOD}

## Executive Summary
2-3 sentences: Most important developments across all groups.

## [Group Name 1]
Focus on high-signal events with historical context from RAG.
Explain WHY things matter, not just WHAT happened.

## [Group Name 2]
...

## Action Items (Optional)
Only include if genuinely important.

Write your summary to {OUTPUT_PATH}
```

---

## 5. Implementation Plan

### File Structure
```
~/.claude/skills/whatsapp-multi-agent-summary/
├── skill.sh                    # Main entry point
├── lib/
│   ├── parse-args.sh          # Argument parsing
│   ├── resolve-groups.sh      # Community → JID resolution
│   ├── spawn-specialists.sh   # Parallel agent spawning
│   ├── wait-for-completion.sh # Monitor agent status
│   └── cleanup.sh             # Team shutdown & cleanup
├── prompts/
│   ├── signal-detector.txt
│   ├── pattern-analyst.txt
│   ├── collaboration-tracker.txt
│   ├── action-items.txt
│   ├── rag-context.txt
│   └── synthesis.txt
└── README.md                   # Skill documentation
```

### Main Script Flow
```bash
#!/bin/bash
# skill.sh

source lib/parse-args.sh "$@"
source lib/resolve-groups.sh

# Create team
TEAM_NAME="${TEAM_NAME:-summary-$(date +%s)}"
echo "Creating team: $TEAM_NAME"

# Spawn specialists in parallel
source lib/spawn-specialists.sh

# Wait for all agents to complete
source lib/wait-for-completion.sh

# Spawn synthesis agent
echo "Synthesizing reports..."
spawn_synthesis_agent

# Wait for synthesis
wait_for_synthesis

# Cleanup
source lib/cleanup.sh

# Return summary
cat "$OUTPUT_PATH"
```

---

## 6. Configuration Files

### communities.json
Already exists at `/workspace/group/communities.json`

Maps community names to group JIDs:
```json
{
  "aifs": {
    "name": "AI for Shlichus",
    "registered_groups": {
      "120363417209150057@g.us": "AI for Shlichus (Shluchim)",
      "120363406440152994@g.us": "AIFS Builders",
      "120363421400748698@g.us": "AIFS Pro"
    }
  }
}
```

### skill-config.json (new)
```json
{
  "defaults": {
    "days": 7,
    "format": "markdown",
    "rag_enabled": true,
    "keep_reports": false,
    "verbose": false
  },
  "agent_timeouts": {
    "signal_detector": 120,
    "pattern_analyst": 180,
    "collaboration_tracker": 120,
    "action_items": 90,
    "rag_context": 240,
    "synthesis": 180
  },
  "output_formats": {
    "markdown": {
      "extension": ".md",
      "header_style": "atx"
    },
    "json": {
      "extension": ".json",
      "pretty": true
    },
    "whatsapp": {
      "extension": ".txt",
      "max_line_length": 80,
      "emoji_enabled": true
    }
  }
}
```

---

## 7. Output Formats

### Markdown (Default)
Full narrative with sections, headers, emphasis.
```markdown
# Weekly Summary: February 17-23, 2026

## Executive Summary
...

## AI for Shlichus
### The GitHub Breakthrough
...
```

### JSON (for API consumption)
```json
{
  "period": {
    "start": "2026-02-17",
    "end": "2026-02-23",
    "days": 7
  },
  "groups": [
    {
      "jid": "120363417209150057@g.us",
      "name": "AI for Shlichus (Shluchim)",
      "signals": [...],
      "patterns": [...],
      "collaborations": [...],
      "action_items": [...]
    }
  ],
  "executive_summary": "...",
  "highlights": [...]
}
```

### WhatsApp (formatted for mobile)
```
📊 *Summary: Feb 17-23*

*Executive Summary*
A breakthrough week for AI for Shlichus...

*AI for Shlichus*
🚀 First GitHub Collaboration
Mendy Elishevitz's megillah reader sparked...

*Mivtza Kashrus*
⚠️ Manchester MK Removed from CRC
Policy change affects imported products...
```

---

## 8. Error Handling

### Agent Failures
```bash
# If specialist agent fails:
- Log error to /workspace/group/agent-errors.log
- Continue with remaining agents
- Mark missing report in synthesis phase
- Synthesis agent works with available reports

# If synthesis agent fails:
- Fallback: Concatenate specialist reports
- Add header: "Automated summary (synthesis failed)"
- Notify user of degraded output
```

### Database Errors
```bash
# If message database unavailable:
- Check /workspace/project/store/messages.db exists
- Verify read permissions
- Return error: "Cannot access message database"

# If no messages in time window:
- Return: "No messages found for specified groups/timeframe"
- Suggest: Check group JIDs, expand time window
```

### RAG System Errors
```bash
# If RAG system unavailable:
- Disable rag-context-agent
- Continue with 4 remaining specialists
- Add note: "Historical context unavailable"
```

---

## 9. Testing Strategy

### Phase 1: Unit Testing
Test each specialist agent independently:
```bash
# Test signal detector
whatsapp-multi-agent-summary --groups "..." --focus signals --keep-reports

# Verify: signals-detected.md exists and contains expected format
```

### Phase 2: Integration Testing
Test full pipeline with known data:
```bash
# Use groups with known events (AIFS with Mendy GitHub collaboration)
whatsapp-multi-agent-summary --community aifs --days 7 --keep-reports

# Verify: All 6 reports generated, synthesis captures known events
```

### Phase 3: User Acceptance Testing
Run with real data and gather feedback:
1. Generate summary
2. User reviews: What's missing? What's noise?
3. Refine prompts based on feedback
4. Repeat 3-5 times until quality is excellent

### Phase 4: Performance Testing
Measure metrics:
- Time to complete (target: < 5 minutes for 7-day window)
- Token usage per agent
- Accuracy (% of important events captured)
- Precision (% of included items that are actually important)

---

## 10. Iterative Refinement Process

### Iteration 1: Baseline
- Run with current prompts
- Gather user feedback
- Identify: Missed stories, included noise, clarity issues

### Iteration 2: Prompt Tuning
- Refine specialist agent prompts based on feedback
- Adjust synthesis weighting (e.g., prioritize collaborations more)
- Test with same data, compare results

### Iteration 3: Format Optimization
- Improve output structure
- Add/remove sections based on user preference
- Polish language and tone

### Iteration 4: Advanced Features
- Enable hierarchical summarization (if needed)
- Add cross-group intelligence (if patterns span groups)
- Implement caching for repeated runs

### Iteration 5: Production Hardening
- Error handling edge cases
- Performance optimization
- Logging and monitoring

---

## 11. Future Enhancements

### Short-term (1-2 weeks)
- [ ] WhatsApp format with emoji and mobile-friendly layout
- [ ] JSON API for integration with other tools
- [ ] Hierarchical summaries (group → community → global)

### Medium-term (1 month)
- [ ] Migrate to CrewAI framework for better orchestration
- [ ] Cache optimization for repeated daily/weekly runs
- [ ] Metrics dashboard (accuracy, latency, token usage)

### Long-term (3+ months)
- [ ] Knowledge graph for people, topics, events, relationships
- [ ] Multi-hop reasoning for complex trend detection
- [ ] Cross-community intelligence (e.g., AI trends affecting Kashrus)
- [ ] Automated feedback loop (LLM-as-judge for quality)

---

## 12. Success Metrics

### Quality Metrics
- **Recall:** Did we catch all important events? (Target: 95%+)
- **Precision:** Is everything included actually important? (Target: 90%+)
- **User Satisfaction:** Does user find summaries valuable? (Target: 4.5/5)

### Performance Metrics
- **Latency:** Time to generate summary (Target: < 5 min for 7 days)
- **Cost:** Token usage per summary (Target: < $0.50 for 7 days)
- **Reliability:** Success rate (Target: 99%+)

### Engagement Metrics
- **Usage:** How often is skill invoked? (Track: daily/weekly)
- **Retention:** Do users continue using it? (Track: week-over-week)
- **Feedback:** Qualitative improvements over iterations (Track: quotes)

---

## 13. Deployment Plan

### Step 1: Build Core Skill (This Week)
- Implement skill.sh and lib/ scripts
- Create specialist prompt templates
- Test with AIFS community data

### Step 2: User Testing (Next Week)
- Run 3-5 iterations with user feedback
- Refine prompts and output format
- Document lessons learned

### Step 3: Integration (Week 3)
- Update scheduled summary tasks to use skill
- Replace manual summary generation
- Monitor quality and performance

### Step 4: Scale (Week 4+)
- Roll out to all communities (TC Operations, Shlichus, etc.)
- Add hierarchical summarization
- Build metrics dashboard

---

## Conclusion

This skill will transform WhatsApp summary generation from manual/single-agent approaches to a production-ready multi-agent system aligned with 2026 industry best practices. The architecture is validated by research, the implementation is clear, and the path to refinement is structured.

**Next step:** Build the skill!
