# Prompt Engineering for Multi-Agent Systems - Research Report
**Date:** February 23, 2026
**Purpose:** Optimize agent prompts based on 2026 industry best practices

---

## Executive Summary

Research reveals that 2026 marks a maturation in multi-agent prompt engineering. Key findings:
- **"God Agent" fallacy** is the #1 anti-pattern - don't use one giant prompt for everything
- **Context isolation** is critical - each specialist needs focused, relevant context
- **Output format specification** dramatically improves reliability
- **Orchestrator patterns** have clear best practices (supervisor + specialists)
- **Chain-of-thought** should be used selectively, not universally

Our current architecture aligns well with best practices, but prompts need refinement based on these insights.

---

## 1. Role Definition and Persona Design

### Best Practices (2026)

**Clear Role Assignment:**
"Act as {role} with {expertise level}" format when defining specialist agents.

**Profile Components:**
- Role details (what they do)
- Personality/approach (analytical, creative, critical)
- Social information (domain expert, reviewer, coordinator)
- Expertise level (specialist, senior analyst, etc.)

**Strategies:**
1. **Handcrafted:** Manually define precise roles (best for production)
2. **LLM-generated:** Use meta-prompting (one agent blueprints for another)
3. **Data-driven:** Profile based on task analysis

**Source:** [Lakera Prompt Engineering Guide](https://www.lakera.ai/blog/prompt-engineering-guide), [How to Build Multi-Agent Systems 2026](https://dev.to/eira-wexford/how-to-build-multi-agent-systems-complete-2026-guide-1io6)

---

### Application to Our Agents

**Current:** ✅ We use "You are a {Agent Name} agent" format
**Enhancement:** Add expertise level and approach

**Example refinement:**
```
Before: "You are a Signal Detector agent"

After: "You are a Senior Signal Detection Analyst specializing in high-volume
communication monitoring. Your expertise lies in distinguishing critical alerts
from routine noise in community discussions."
```

---

## 2. Context Framing and Instruction Clarity

### Best Practices (2026)

**Context Isolation Principle:**
Give each specialist agent ONLY what they need. Avoid context pollution where irrelevant details distract from the core task.

**Structured Prompt Components:**
1. **Identity:** Who you are (role + expertise)
2. **Context:** What you're analyzing (specific, bounded)
3. **Mission:** What you need to accomplish (clear outcome)
4. **Constraints:** What to avoid (anti-examples)
5. **Output:** How to format results (structure specification)

**Scope Definition:**
Use explicit boundaries: "Analyze ONLY messages from [groups] in [timeframe]"

**Source:** [Microsoft Context Engineering](https://microsoft.github.io/multi-agent-reference-architecture/docs/context-engineering/Context-Engineering.html), [Anthropic Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

---

### Application to Our Agents

**Current:** ✅ We provide groups, timeframe, mission
**Enhancement:** Add explicit constraints and anti-examples

**Example refinement:**
```
CONTEXT:
Groups: AI for Shlichus (120363417209150057@g.us), Mivtza Kashrus (16122756438-1595291340@g.us)
Time window: February 17-23, 2026 (7 days)
Data source: /workspace/project/store/messages.db

MISSION:
Identify HIGH-SIGNAL events - changes that matter, not routine activity.

CONSTRAINTS (What NOT to report):
❌ Routine Q&A exchanges (e.g., "Is this hechsher good?" → "Yes")
❌ Participant lists (who was active)
❌ Obvious patterns (e.g., "group uses Q&A format")
❌ Daily operational chatter
❌ Vague summaries (e.g., "product discussions")

FOCUS (What TO report):
✓ Policy changes (certification removed/added)
✓ Product launches (new tools, apps, resources)
✓ Major announcements (upcoming publications)
✓ Service changes (bot added/removed)
✓ Cultural milestones (first-time collaborations)
```

---

## 3. Output Format Specification

### Best Practices (2026)

**Executable Specifications:**
Prompts in agentic systems are executable specifications that define HOW an agent reasons, plans, and acts. Specify structure, format, and even example outputs.

**Structured Output Formats:**
- **Tabular:** Use markdown tables for clarity (Tabular CoT)
- **Templates:** Provide exact format to match
- **JSON Schema:** For programmatic consumption
- **Sectioned Reports:** Clear headers and subsections

**Why It Matters:**
Structured outputs enable:
- Synthesis agents to parse reliably
- Cross-agent communication with clear contracts
- Debugging (easy to spot format violations)
- Auditability (consistent structure)

**Source:** [InfoQ Prompts to Production](https://www.infoq.com/articles/prompts-to-production-playbook-for-agentic-development/), [Medium AI Agent Workflow Orchestration](https://medium.com/@dougliles/ai-agent-workflow-orchestration-d49715b8b5e3)

---

### Application to Our Agents

**Current:** Basic markdown output
**Enhancement:** Structured format with required sections

**Example for Signal Detector:**
```
OUTPUT FORMAT:

Write your findings to /workspace/group/signals-detected.md using this structure:

# High-Signal Events Detected
**Period:** {START_DATE} to {END_DATE}
**Groups:** {GROUP_NAMES}

---

## {Group Name 1}

### Signal 1: {Event Type} - {Short Title}
**Date:** YYYY-MM-DD
**What Happened:** [1-2 sentences, specific not vague]
**Why It Matters:** [Significance for community]
**Impact:** [Who/what is affected]

### Signal 2: ...

---

## Summary Statistics
- Total signals detected: X
- High urgency: X
- Medium urgency: X
- Low urgency: X

EXAMPLE OUTPUT:

### Signal 1: ALERT - Manchester MK Removed from CRC List
**Date:** 2026-02-23
**What Happened:** Manchester Kashrut (MK) certification removed from CRC's approved
list. Affects products like Heinz ketchup imported from Holland with MK Manchester.
**Why It Matters:** Policy change impacts product acceptability for CRC followers.
**Impact:** Community needs guidance on existing products, may require substitutions.
```

---

## 4. Chain-of-Thought vs Direct Instruction

### Research Findings (2026)

**When to Use CoT:**
- Complex reasoning tasks requiring multiple steps
- Tasks where intermediate steps aid accuracy
- When you need explainability (audit trail of reasoning)
- Multistep problem-solving

**When to Use Direct Instructions:**
- Simple, well-defined tasks
- Classification or categorization
- When speed is critical (CoT adds tokens/latency)
- When output format is more important than reasoning

**Zero-Shot CoT:**
Add "Let's think step by step" or "Describe your reasoning in steps"

**Few-Shot CoT:**
Provide examples showing the reasoning process explicitly

**Tabular CoT:**
Structure reasoning in markdown tables for clarity

**Source:** [Prompt Engineering Guide - CoT](https://www.promptingguide.ai/techniques/cot), [DataCamp Chain-of-Thought](https://www.datacamp.com/tutorial/chain-of-thought-prompting), [IBM Chain of Thoughts](https://www.ibm.com/think/topics/chain-of-thoughts)

---

### Application to Our Agents

**Analysis:**
- **Signal Detector:** Direct instruction ✅ (categorization task)
- **Pattern Analyst:** CoT beneficial ✅ (needs to reason about trends)
- **Collaboration Tracker:** Direct instruction ✅ (identification task)
- **Action Items:** Direct instruction ✅ (extraction task)
- **RAG Context:** CoT beneficial ✅ (query formulation + relevance reasoning)
- **Synthesis Agent:** CoT essential ✅ (complex integration task)

**Example for Pattern Analyst (add CoT):**
```
For each pattern you identify, use this reasoning structure:

OBSERVATION: What do you see repeated?
EVIDENCE: Specific examples with frequency/timestamps
ANALYSIS: Why is this happening? What's the root cause?
TREND: Is this increasing, stable, or decreasing?
SIGNIFICANCE: Why does this pattern matter?
RECOMMENDATION: What should be done about it (if anything)?

Think step by step through your analysis.
```

**Example for Synthesis Agent (add CoT):**
```
SYNTHESIS PROCESS:

Step 1: Read all specialist reports
List the reports you're reading and note if any are missing.

Step 2: Identify top priorities
Which events from signal-detector are most newsworthy?
Which patterns from pattern-analyst reveal systemic issues?
Which collaborations from collaboration-tracker are culturally significant?

Step 3: Cross-reference with RAG context
Do historical discussions add important context to current events?

Step 4: Weight and organize
Prioritize: Signals > Collaborations > Patterns > Actions
Group by topic/theme rather than by agent

Step 5: Draft narrative
Write cohesive story explaining WHY things matter, not just WHAT happened.

Let's think through this step by step.
```

---

## 5. Orchestrator/Synthesis Agent Prompts

### Best Practices (2026)

**Fan-out/Fan-in Pattern:**
Our architecture uses this - multiple specialists work in parallel, synthesis agent combines results. This is the recommended pattern for diverse insights on the same problem.

**Orchestrator Responsibilities:**
1. **Validation:** Check that all specialist reports are complete
2. **Integration:** Combine insights with appropriate weighting
3. **Deduplication:** Merge overlapping findings
4. **Prioritization:** Surface most important items
5. **Narrative:** Create coherent story, not just concatenation

**Key Principle:**
Detailed context stays isolated in specialists; orchestrator focuses on synthesis and high-level decisions.

**Source:** [Azure AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns), [Hatchworks Orchestrating AI Agents](https://hatchworks.com/blog/ai-agents/orchestrating-ai-agents/)

---

### Application to Our Synthesis Agent

**Current:** Basic "read reports and combine" instruction
**Enhancement:** Structured synthesis process with validation

**Refined Synthesis Prompt:**
```
You are a Senior Analysis Synthesis Specialist with expertise in multi-source
intelligence integration and narrative construction.

INPUTS:
- Signal Detection Report: /workspace/group/signals-detected.md
- Pattern Analysis Report: /workspace/group/patterns-found.md
- Collaboration Tracking Report: /workspace/group/collaborations-found.md
- Action Items Report: /workspace/group/action-items.md
- RAG Context Report: /workspace/group/rag-context.md

MISSION:
Synthesize specialist findings into a cohesive, signal-focused narrative that
highlights what MATTERS, not what HAPPENED.

VALIDATION (Step 1):
- Confirm all 5 reports exist and are readable
- If any report is missing, note it and proceed with available data
- Quick scan: How many signals? Patterns? Collaborations? Actions?

PRIORITIZATION (Step 2):
Apply this weighting:
1. CRITICAL SIGNALS (40%): Alerts, policy changes, launches
2. CULTURAL SHIFTS (30%): First-time collaborations, milestone moments
3. SYSTEMIC ISSUES (20%): Patterns revealing problems needing solutions
4. ACTION ITEMS (10%): Only include if high urgency

INTEGRATION (Step 3):
- Cross-reference: Does RAG context enrich any signals or collaborations?
- Deduplicate: Same event mentioned by multiple specialists? Merge.
- Connect dots: Do patterns explain why certain signals occurred?

NARRATIVE CONSTRUCTION (Step 4):
Structure your output following user feedback principles:

USER FEEDBACK TO FOLLOW:
❌ NO participant lists
❌ NO vague bullets ("product discussions")
❌ NO obvious patterns ("Q&A format")
❌ NO play-by-play ("X said Y, then Z replied")

✓ YES major changes, alerts, milestones
✓ YES collaboration breakthroughs with cultural significance
✓ YES explanation of WHY things matter

OUTPUT STRUCTURE:

# Weekly Summary: {START_DATE} to {END_DATE}

## Executive Summary
2-3 sentences capturing the most important developments across all groups.
What would you tell someone in 30 seconds?

## [Group Name 1]: [Headline]
### [Most Important Event]
Brief narrative explaining what happened and why it matters.
Use historical context from RAG if available.

### [Secondary Events]
Bulleted list of other newsworthy items.

## [Group Name 2]: [Headline]
...

## Action Items (Optional)
Only include items requiring immediate attention.

---

TONE:
- Professional but conversational
- Focus on "why this matters" not just "what happened"
- Use concrete examples, avoid vague language
- Highlight cultural significance where relevant

VALIDATION (Final):
Before writing, ask yourself:
- Would a busy executive understand what's important from this summary?
- Did I explain WHY things matter, not just list events?
- Are there any vague bullets I should make specific or remove?
- Did I capture the big story (like the GitHub collaboration breakthrough)?

Let's synthesize these reports step by step.
```

---

## 6. Common Pitfalls and Anti-Patterns

### The "God Agent" Fallacy ⚠️
**Problem:** One giant prompt trying to do everything
**Symptoms:**
- Context clutter (instructions for one task distract from another)
- Tool confusion (20+ tools → frequent misuse)
- Debugging nightmares (can't isolate failures)

**Solution:** Specialized agents with focused missions (exactly what we're doing ✅)

**Source:** [Multi-Agent Coordination Patterns](https://learnwithparam.com/blog/multi-agent-coordination-patterns), [Tacnode AI Agent Coordination](https://tacnode.io/post/ai-agent-coordination)

---

### Over-Engineering Coordination ⚠️
**Problem:** Using complex patterns when simpler would suffice
**Rule:** Use the lowest level of complexity that reliably meets your requirements

**Our Assessment:** ✅ Our 5 specialists + 1 synthesis is appropriate for the complexity of chat analysis

**Source:** [O'Reilly Designing Effective Multi-Agent Architectures](https://www.oreilly.com/radar/designing-effective-multi-agent-architectures/)

---

### The "More Agents Are Better" Myth ⚠️
**Problem:** Assuming adding more agents always improves results
**Reality:** Google Research found multi-agent coordination doesn't reliably improve results and can reduce performance

**Performance Impact:**
- Independent agents can amplify errors up to ~17×
- Centralized coordination limits error propagation to ~4.4×

**Our Assessment:** ✅ 5 specialists is reasonable; synthesis agent provides centralized validation

**Source:** [Google Agent Scaling Principles](https://www.infoq.com/news/2026/02/google-agent-scaling-principles/), [Neomanex Multi-Agent AI Systems](https://neomanex.com/posts/multi-agent-ai-systems-orchestration)

---

### Architectural Mismatches ⚠️
**Problem:** "Bad prompts" are often mismatches between task and model architecture
**Example:** 2,000-word prompt trying to make a fast generator act like a thinker
**Solution:** Match agent type to task requirements

**Our Assessment:** ✅ Using general-purpose agents for all roles is fine; could optimize with specialist models later

**Source:** [Prompt Engineering 2026 Playbook](https://promptengineering.org/agents-at-work-the-2026-playbook-for-building-reliable-agentic-workflows/)

---

### Context Transfer Issues ⚠️
**Problem:** Most "agent failures" are actually context-transfer problems
**Symptoms:**
- Specialists losing important information
- Synthesis agent missing key details
- Inconsistent outputs across runs

**Solution:**
- Write specialist findings to files (✅ we do this)
- Use structured output formats (needs improvement 🔧)
- Synthesis agent explicitly validates all inputs received

**Source:** [O'Reilly Designing Effective Multi-Agent Architectures](https://www.oreilly.com/radar/designing-effective-multi-agent-architectures/)

---

### Supervisor Bottleneck ⚠️
**Problem:** In supervisor-based architectures, every decision becomes a bottleneck
**Symptoms:**
- Increased latency
- Filled context windows
- Supervisor becomes point of failure

**Our Assessment:** ⚠️ Potential issue
- Our synthesis agent is a bottleneck by design
- Mitigation: Keep synthesis prompt focused and efficient
- Consider: Parallel synthesis for different communities (future enhancement)

**Source:** [AI Agent Coordination Patterns](https://tacnode.io/post/ai-agent-coordination)

---

## 7. Production System Patterns

### Control Plane vs Data Plane
**Control Plane (Orchestration):** State, routing, policies, retries, fallbacks
**Data Plane (Execution):** Tools, APIs, databases, actual work

**Our Implementation:**
- Control: Team management, task spawning, report aggregation
- Data: Database queries, RAG searches, file writes

**Source:** [Redis AI Agent Orchestration](https://redis.io/blog/ai-agent-orchestration/), [AWS Strands Agents](https://aws.amazon.com/blogs/machine-learning/customize-agent-workflows-with-advanced-orchestration-techniques-using-strands-agents/)

---

### State Management
**Best Practice:** Use descriptive keys so downstream agents know what they're reading

**Our Implementation:** ✅ File names are descriptive:
- `signals-detected.md`
- `patterns-found.md`
- `collaborations-found.md`
- `action-items.md`
- `rag-context.md`

---

### Verification-Aware Planning
**Emerging Pattern:** Build verification into the plan with pass-fail checks for each subtask

**Potential Enhancement:**
```
Each specialist agent outputs:
- STATUS: COMPLETE | PARTIAL | FAILED
- CONFIDENCE: HIGH | MEDIUM | LOW
- FINDINGS_COUNT: <number>

Synthesis agent checks status before proceeding.
```

**Source:** [Agents At Work 2026 Playbook](https://promptengineering.org/agents-at-work-the-2026-playbook-for-building-reliable-agentic-workflows/)

---

## 8. Prompt Optimization Checklist

### For Specialist Agents
- [ ] Clear role definition with expertise level
- [ ] Explicit context boundaries (groups, timeframe, data source)
- [ ] Mission statement (what to accomplish)
- [ ] Constraints (what NOT to do - anti-examples)
- [ ] Structured output format with example
- [ ] Chain-of-thought reasoning (if task requires it)
- [ ] Validation step (check your work)

### For Synthesis/Orchestrator Agent
- [ ] Identity as synthesis specialist
- [ ] Input validation (confirm all reports exist)
- [ ] Prioritization weighting explicit
- [ ] Integration strategy defined
- [ ] User feedback principles embedded
- [ ] Structured output format
- [ ] Chain-of-thought synthesis process
- [ ] Final validation step

### For Overall System
- [ ] ONE orchestrator (no coordination conflicts)
- [ ] Specialists have non-overlapping domains
- [ ] Context isolation maintained
- [ ] State management uses descriptive keys
- [ ] Error handling defined
- [ ] Performance metrics tracked

---

## 9. Recommended Prompt Refinements

### Priority 1: Add Structured Output Formats
All agents need explicit format specifications with examples.

### Priority 2: Enhance Synthesis Agent Prompt
Add validation, prioritization, integration steps with chain-of-thought reasoning.

### Priority 3: Add Constraints Section
Explicitly state what NOT to report (anti-examples) to reduce noise.

### Priority 4: Include Expertise Levels
"Senior Signal Detection Analyst" not just "Signal Detector"

### Priority 5: Add Validation Steps
Each agent should verify their output before completing.

---

## 10. Next Steps

1. **Refine Prompts:** Apply research findings to all 6 agent prompts
2. **Test:** Run with refined prompts on AIFS community data
3. **Compare:** Old summary vs new summary - what improved?
4. **Iterate:** User feedback → prompt adjustments
5. **Document:** Save examples of excellent outputs as few-shot examples

---

## Sources

### Role Definition & Context Engineering
- [Lakera: Ultimate Guide to Prompt Engineering in 2026](https://www.lakera.ai/blog/prompt-engineering-guide)
- [DEV: How to Build Multi-Agent Systems 2026](https://dev.to/eira-wexford/how-to-build-multi-agent-systems-complete-2026-guide-1io6)
- [Microsoft: Context Engineering Multi-Agent Reference Architecture](https://microsoft.github.io/multi-agent-reference-architecture/docs/context-engineering/Context-Engineering.html)
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

### Orchestration Patterns
- [Azure: AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [InfoQ: From Prompts to Production Playbook](https://www.infoq.com/articles/prompts-to-production-playbook-for-agentic-development/)
- [Hatchworks: Orchestrating AI Agents in Production](https://hatchworks.com/blog/ai-agents/orchestrating-ai-agents/)
- [Medium: AI Agent Workflow Orchestration](https://medium.com/@dougliles/ai-agent-workflow-orchestration-d49715b8b5e3)

### Anti-Patterns & Coordination
- [Tacnode: AI Agent Coordination Patterns](https://tacnode.io/post/ai-agent-coordination)
- [LearnWithParam: Multi-Agent Coordination Patterns](https://learnwithparam.com/blog/multi-agent-coordination-patterns)
- [O'Reilly: Designing Effective Multi-Agent Architectures](https://www.oreilly.com/radar/designing-effective-multi-agent-architectures/)
- [InfoQ: Google Agent Scaling Principles](https://www.infoq.com/news/2026/02/google-agent-scaling-principles/)
- [Neomanex: Multi-Agent AI Systems Enterprise Guide](https://neomanex.com/posts/multi-agent-ai-systems-orchestration)
- [Prompt Engineering: Agents At Work 2026 Playbook](https://promptengineering.org/agents-at-work-the-2026-playbook-for-building-reliable-agentic-workflows/)

### Chain-of-Thought
- [Prompt Engineering Guide: Chain-of-Thought](https://www.promptingguide.ai/techniques/cot)
- [DataCamp: Chain-of-Thought Prompting Tutorial](https://www.datacamp.com/tutorial/chain-of-thought-prompting)
- [IBM: What is Chain of Thought Prompting](https://www.ibm.com/think/topics/chain-of-thoughts)

### Production Systems
- [Redis: AI Agent Orchestration for Production](https://redis.io/blog/ai-agent-orchestration/)
- [AWS: Customize Agent Workflows with Strands Agents](https://aws.amazon.com/blogs/machine-learning/customize-agent-workflows-with-advanced-orchestration-techniques-using-strands-agents/)

---

**Conclusion:** Our multi-agent architecture is sound. The primary optimization opportunity is in prompt refinement - adding structure, validation, explicit constraints, and chain-of-thought reasoning where appropriate. The research validates our approach and provides clear guidance for enhancement.
