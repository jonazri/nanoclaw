# Feature Request: Self-Diagnostics & Auto-Repair Workflow

**Date:** 2026-02-25
**Status:** new
**Requested by:** Yonatan Azrielant
**Priority:** important

## Problem

The system lacks automated health monitoring and self-repair capabilities, leading to:

1. **Silent failures**: Issues like the OAuth outage go undetected until user intervention
2. **Manual diagnostics required**: User must manually request investigations when something seems wrong
3. **No proactive maintenance**: System doesn't self-check or self-heal between user interactions
4. **Limited visibility**: No centralized view of system health, stuck agents, crashed containers, or resource issues
5. **Reactive troubleshooting**: Problems are discovered after they've caused user-facing issues rather than being caught early

**Current gaps:**
- No scheduled health checks
- No automatic detection of stuck/crashed agents
- No container timeout analysis
- No log pattern analysis for anomalies
- No automatic remediation of common issues
- No health status dashboard or reports

## Proposed Solution

Implement a comprehensive self-diagnostics and auto-repair system with both on-demand and scheduled capabilities.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Self-Diagnostics System                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐      ┌──────────────┐               │
│  │   On-Demand  │      │  Scheduled   │               │
│  │   Trigger    │      │  Health Check│               │
│  │  /diagnose   │      │  (cron-based)│               │
│  └──────┬───────┘      └──────┬───────┘               │
│         │                     │                        │
│         └──────────┬──────────┘                        │
│                    ▼                                    │
│         ┌──────────────────────┐                       │
│         │  Diagnostics Engine  │                       │
│         └──────────┬───────────┘                       │
│                    │                                    │
│         ┌──────────┴──────────┐                        │
│         ▼                     ▼                        │
│  ┌──────────────┐      ┌──────────────────┐           │
│  │   Analyzers  │      │  /systematic-    │           │
│  │   (checks)   │─────▶│   debugging      │           │
│  │              │      │  (deep analysis) │           │
│  └──────┬───────┘      └──────┬───────────┘           │
│         │                     │                        │
│         ▼                     ▼                        │
│  ┌───────────────────────────────────┐                │
│  │  Health Report Generator          │                │
│  │  (writes to diagnostics/*.json)   │                │
│  └──────────┬────────────────────────┘                │
│             │                                          │
│             ▼                                          │
│  ┌───────────────────────────┐                        │
│  │   Auto-Repair Engine      │                        │
│  │   (reads report, applies  │                        │
│  │    fixes, updates report) │                        │
│  └──────────┬────────────────┘                        │
│             │                                          │
│             ▼                                          │
│  ┌───────────────────────────────────┐                │
│  │  Manual Repair Queue              │                │
│  │  (issues requiring host action)   │                │
│  │  → User runs /process-repairs     │                │
│  └───────────────────────────────────┘                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Workflow:**
1. **Diagnostics run** → Generates initial health report
2. **Issues found** → Triggers `/systematic-debugging` for deep analysis
3. **Report enhanced** → Adds debugging findings to report
4. **Auto-repair attempts** → Fixes what it can, documents results
5. **Unresolved issues** → Queued for manual repair via `/process-repairs`

### 1. On-Demand Diagnostics

Add a `/diagnose` skill that runs comprehensive health checks:

```bash
# Usage
/diagnose                    # Full diagnostic report
/diagnose --quick            # Quick checks only
/diagnose --repair           # Run diagnostics + auto-repair
/diagnose --focus=containers # Focus on specific subsystem
/diagnose --debug            # Run diagnostics + systematic debugging on issues
```

**Workflow:**
1. Run analyzers, collect findings
2. Generate initial report → `diagnostics/reports/YYYY-MM-DD-HH-mm-ss.json`
3. If issues found and `--debug` flag set:
   - For each critical/high issue, spawn `/systematic-debugging` agent
   - Wait for debugging results
   - Enhance report with debugging findings → `*-debug.json`
4. If auto-repair enabled (default for `/diagnose --repair`):
   - Execute safe/moderate repairs
   - Update report with repair results → `*-final.json`
5. For unresolved issues requiring host action:
   - Write to `diagnostics/repairs/pending/`
   - Notify user to run `/process-repairs` on host

**Output format:**
```
🏥 *System Diagnostics Report*
Run: 2026-02-25 14:30:00 EST
Report ID: abc-123-def
Report: /workspace/group/diagnostics/reports/2026-02-25-14-30-00-final.json

✅ *Healthy Systems*
• WhatsApp connection: Connected (uptime: 6h 21m)
• OAuth token: Valid (expires in 3h 45m)
• Database: Responsive (last query: 2ms)
• Message queue: Empty (0 pending)

⚠️ *Warnings*
• Container spawn timeout rate: 12% (threshold: 10%)
  → Debugging: Analyzed 47 spawn attempts, found network latency spikes
• Log file size: 450MB (threshold: 500MB)
  → Auto-repair: Rotated logs (450MB → 50MB) ✅

🔴 *Critical Issues*
• Agent skills-agent-3: Stuck for 45 minutes (issue-001)
  → Debugging: Agent blocked on unresponsive API call
  → Auto-repair: Terminated stuck agent ✅
• Container agent-123: Not responding to health checks (issue-002)
  → Debugging: Process deadlock detected in message handler
  → Auto-repair: Restarted container ✅

🔧 *Auto-Repair Summary*
• 3 issues auto-resolved
• 1 issue requires manual intervention (see below)

⚠️ *Manual Intervention Required*
• OAuth refresh scheduling failure (issue-003)
  → Queued for host repair: diagnostics/repairs/pending/oauth-refresh-scheduling.json
  → Run '/process-repairs' on host system to address

📊 *System Stats*
• Total containers spawned today: 47
• Success rate: 88%
• Average response time: 3.2s
• Memory usage: 2.1GB / 8GB

Next: Run '/process-repairs' on host to handle 1 pending repair
```

### 2. Systematic Debugging Integration

When issues are detected, automatically trigger deep analysis using `/systematic-debugging`:

```typescript
async function investigateIssues(report: HealthReport): HealthReport {
  const criticalIssues = report.issues.filter(
    i => i.severity === 'critical' || i.severity === 'high'
  );

  for (const issue of criticalIssues) {
    if (issue.debugged) continue; // Already debugged

    console.log(`Triggering /systematic-debugging for ${issue.id}...`);

    // Spawn debugging agent with issue context
    const debugResult = await spawnDebuggingAgent({
      issue: issue,
      evidence: issue.evidence,
      system: issue.system,
      context: report
    });

    // Add debugging results to report
    if (!report.debuggingResults) report.debuggingResults = {};
    report.debuggingResults[issue.id] = {
      method: debugResult.method,
      findings: debugResult.findings,
      rootCause: debugResult.rootCause,
      evidence: debugResult.evidence
    };

    issue.debugged = true;
  }

  // Write enhanced report
  await writeReport(report, 'debug');

  return report;
}
```

**Benefits:**
- **Deeper understanding**: Goes beyond surface-level detection to find root causes
- **Evidence collection**: Gathers logs, metrics, and patterns systematically
- **Actionable insights**: Debugging results inform auto-repair decisions
- **Documentation**: All findings preserved in diagnostic report

**When debugging is triggered:**
- Automatically for critical/high severity issues
- When `--debug` flag is used with `/diagnose`
- Can be disabled via settings if needed

**Debugging results enhance the report:**
```json
{
  "issues": [
    {
      "id": "issue-003",
      "title": "OAuth refresh scheduling failure",
      "severity": "critical",
      "evidence": ["Log: systemd-run exit code 1", "Token expired at 00:42"],
      "debugged": true
    }
  ],
  "debuggingResults": {
    "issue-003": {
      "method": "log-analysis + code-inspection",
      "findings": "systemd-run command fails in container context; no fallback scheduling",
      "rootCause": "Dependency on systemd-run without fallback mechanism",
      "evidence": [
        "scripts/oauth/refresh.sh:112 - systemd-run failed",
        "No subsequent refresh scheduled",
        "Token expiry at 00:42:30, no refresh attempted"
      ]
    }
  }
}
```

### 3. Scheduled Health Checks

Add configurable scheduled diagnostics:

```json
// settings.json
{
  "diagnostics": {
    "enabled": true,
    "schedule": "0 */6 * * *",  // Every 6 hours
    "reportLevel": "issues-only",  // "full" | "issues-only" | "silent"
    "autoRepair": true,
    "alertOnCritical": true,
    "checks": {
      "oauth": { "enabled": true, "interval": "30m" },
      "containers": { "enabled": true, "interval": "1h" },
      "agents": { "enabled": true, "interval": "15m" },
      "logs": { "enabled": true, "interval": "1d" },
      "database": { "enabled": true, "interval": "1h" }
    }
  }
}
```

**Scheduled behavior:**
- Runs silently in background
- Only alerts if issues found (configurable)
- Auto-repairs common issues if enabled
- Logs results to `/workspace/group/diagnostics/reports/`

### 3. Diagnostic Analyzers

Implement modular analyzers for different subsystems:

#### A. OAuth Analyzer
```typescript
interface OAuthHealthCheck {
  tokenValid: boolean;
  expiresIn: number;
  lastRefreshSuccess: Date;
  nextRefreshScheduled: boolean;
  failureCount: number;
  issues: Issue[];
}

async function analyzeOAuth(): OAuthHealthCheck {
  // Check token validity
  // Check expiry time
  // Verify refresh is scheduled
  // Check recent refresh failures
  // Return health status
}
```

**Checks:**
- Token validity and expiry time
- Refresh mechanism status
- Recent failure patterns
- Scheduling verification

**Auto-repairs:**
- Schedule missing refresh
- Refresh expired/expiring tokens
- Reset failure counters after success

#### B. Container Analyzer
```typescript
interface ContainerHealthCheck {
  activeContainers: number;
  stuckContainers: Container[];
  crashedContainers: Container[];
  timeoutRate: number;
  avgSpawnTime: number;
  avgLifespan: number;
  issues: Issue[];
}

async function analyzeContainers(): ContainerHealthCheck {
  // Find containers running > threshold time
  // Detect unresponsive containers
  // Calculate timeout and failure rates
  // Analyze spawn patterns
  // Return health status
}
```

**Checks:**
- Containers running longer than threshold (e.g., 2 hours)
- Unresponsive containers (no heartbeat)
- High timeout rate (> 10%)
- Memory/resource leaks
- Zombie processes

**Auto-repairs:**
- Terminate stuck containers (with confirmation)
- Restart crashed containers
- Clean up zombie processes
- Free stuck resources

#### C. Agent Analyzer
```typescript
interface AgentHealthCheck {
  activeAgents: Agent[];
  stuckAgents: Agent[];
  idleAgents: Agent[];
  orphanedAgents: Agent[];
  avgTaskTime: number;
  issues: Issue[];
}

async function analyzeAgents(): AgentHealthCheck {
  // Find agents stuck on tasks > threshold
  // Detect orphaned agents (parent terminated)
  // Identify idle agents waiting indefinitely
  // Analyze task completion rates
  // Return health status
}
```

**Checks:**
- Agents stuck on tasks > 30 minutes
- Orphaned agents (parent/team terminated)
- Idle agents with no work assigned
- Agent spawn/shutdown failures
- Memory leaks in long-running agents

**Auto-repairs:**
- Graceful shutdown of stuck agents
- Clean up orphaned agents
- Notify about idle agents
- Reset agent state if corrupted

#### D. Log Analyzer
```typescript
interface LogHealthCheck {
  logSize: number;
  errorRate: number;
  warningRate: number;
  recentPatterns: LogPattern[];
  anomalies: Anomaly[];
  issues: Issue[];
}

async function analyzeLogs(): LogHealthCheck {
  // Check log file sizes
  // Scan for error patterns
  // Detect anomalies (error spikes)
  // Identify repeated failures
  // Return health status
}
```

**Checks:**
- Log file size (rotate if > threshold)
- Error/warning rate trends
- Repeated error patterns
- Anomaly detection (sudden spikes)
- Recent critical errors

**Auto-repairs:**
- Rotate large log files
- Archive old logs
- Alert on repeated errors
- Compress old logs

#### E. Database Analyzer
```typescript
interface DatabaseHealthCheck {
  connectionStatus: boolean;
  responseTime: number;
  queryPerformance: QueryStats;
  tableStats: TableStats[];
  lockStatus: LockInfo[];
  issues: Issue[];
}

async function analyzeDatabase(): DatabaseHealthCheck {
  // Check connection status
  // Measure response time
  // Analyze table sizes and indexes
  // Detect long-running queries
  // Check for locks/deadlocks
  // Return health status
}
```

**Checks:**
- Connection status and response time
- Database file size
- Query performance
- Table fragmentation
- Lock contention
- Backup status

**Auto-repairs:**
- Optimize tables (VACUUM)
- Kill long-running queries
- Release stale locks
- Suggest indexes for slow queries

#### F. Message Queue Analyzer
```typescript
interface QueueHealthCheck {
  queueDepth: number;
  oldestMessage: number;
  processingRate: number;
  failureRate: number;
  backlog: Message[];
  issues: Issue[];
}

async function analyzeMessageQueue(): QueueHealthCheck {
  // Check queue depth
  // Identify stuck messages
  // Calculate processing rate
  // Detect backlog buildup
  // Return health status
}
```

**Checks:**
- Queue depth (messages waiting)
- Message age (stuck messages)
- Processing rate vs arrival rate
- Failed message patterns
- Dead letter queue

**Auto-repairs:**
- Retry stuck messages
- Purge poison messages
- Scale processing if backlog
- Alert on sustained backlog

### 4. Auto-Repair Decision Engine

**Design Philosophy:**
Auto-repair runs AFTER the diagnostic report is filed, not before. This ensures:
- Full diagnostic context is preserved
- Report shows both the problem AND the fix
- Failed repairs are documented
- Manual repairs have full diagnostic data

```typescript
interface RepairAction {
  id: string;
  issueId: string;
  action: string;
  category: 'safe' | 'moderate' | 'risky';
  requiresConfirmation: boolean;
  requiresHostAction: boolean;
  estimatedImpact: string;
  steps: string[];
}

class AutoRepairEngine {
  async analyzeReport(report: HealthReport): RepairPlan {
    // Read the diagnostic report
    // Identify repairable issues
    // Generate repair plan
    // Return plan
  }

  async executeRepairs(plan: RepairPlan): RepairResults {
    // Execute safe repairs automatically
    // Execute moderate repairs with confirmation
    // Queue risky repairs for manual intervention
    // Update report with results
    // Write pending repairs to repairs/pending/
    // Return results
  }

  async executeRepair(action: RepairAction): RepairResult {
    // Execute repair with rollback capability
    // Log action and result
    // Update health report
    // Return result
  }
}
```

**Repair categories:**
- **Safe (automatic)**: Log rotation, token refresh, restart dead containers, kill stuck agents
- **Moderate (requires confirmation)**: Terminate long-running containers, database vacuum, purge old data
- **Risky (manual only)**: Code changes, configuration updates, system restarts, host-level actions

**Workflow:**
1. **Diagnostic phase**: Run all checks, generate report, run `/systematic-debugging` on issues
2. **Report filed**: Write complete diagnostic report to `diagnostics/reports/`
3. **Auto-repair phase**:
   - Read the report
   - Execute safe repairs automatically
   - Ask for confirmation on moderate repairs
   - Queue risky repairs to `repairs/pending/`
4. **Report updated**: Write final report with repair results
5. **User notification**: Show summary, point to pending repairs if any

**Safety features:**
- Dry-run mode (show what would be done)
- Confirmation required for moderate/risky repairs
- Rollback capability where possible
- Detailed logging of all actions
- Rate limiting (max repairs per hour)
- Report-based execution (always works from a diagnostic report)

**For issues requiring host action:**
```typescript
// These are written to diagnostics/repairs/pending/
interface PendingRepair extends ManualRepairRequest {
  requiresHostTool: string;      // e.g., "code-change", "restart-service"
  hostCommand?: string;          // Suggested command to run
  automatable: boolean;          // Could this be automated in future?
}
```

### 5. Health Report Format & Storage

**Report Directory Structure:**
```
/workspace/group/diagnostics/
├── reports/
│   ├── 2026-02-25-14-30-00.json       # Initial diagnostic report
│   ├── 2026-02-25-14-30-00-debug.json # Enhanced with debugging results
│   ├── 2026-02-25-14-30-00-final.json # After auto-repair
│   └── latest.json                     # Symlink to most recent report
├── repairs/
│   ├── pending/
│   │   ├── oauth-refresh-scheduling.json
│   │   └── container-123-crash.json
│   ├── completed/
│   │   └── log-rotation-2026-02-25.json
│   └── failed/
│       └── agent-stuck-manual-intervention.json
├── metrics.jsonl                       # Time-series metrics
└── README.md                           # Directory documentation
```

**Report Format (JSON):**
```typescript
interface HealthReport {
  version: "1.0";
  reportId: string;              // UUID for this diagnostic run
  timestamp: Date;
  runType: 'scheduled' | 'on-demand';
  duration: number;

  summary: {
    overallHealth: 'healthy' | 'warning' | 'critical';
    checksRun: number;
    issuesFound: number;
    issuesResolved: number;
    issuesPending: number;
    repairsExecuted: number;
  };

  systems: {
    oauth: OAuthHealthCheck;
    containers: ContainerHealthCheck;
    agents: AgentHealthCheck;
    logs: LogHealthCheck;
    database: DatabaseHealthCheck;
    messageQueue: QueueHealthCheck;
  };

  issues: Issue[];               // All issues found
  debuggingResults?: {           // Added after /systematic-debugging
    [issueId: string]: {
      method: string;
      findings: string;
      rootCause?: string;
      evidence: string[];
    };
  };

  repairs: {
    attempted: RepairAction[];
    succeeded: RepairAction[];
    failed: RepairAction[];
    skipped: RepairAction[];     // Issues requiring manual intervention
  };

  recommendations: string[];

  nextSteps: {
    manualRepairsRequired: number;
    scheduledFollowup?: Date;
    escalationRequired: boolean;
  };
}

interface Issue {
  id: string;                    // Unique issue ID
  system: string;                // e.g., "oauth", "containers"
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  detectedAt: Date;
  evidence: string[];            // Log lines, metrics, etc.
  debugged: boolean;             // Has /systematic-debugging been run?
  repairable: boolean;           // Can auto-repair fix this?
  requiresHostAction: boolean;   // Needs /process-repairs?
}
```

**Report Lifecycle:**
1. **Initial report**: `YYYY-MM-DD-HH-mm-ss.json` - Raw diagnostic results
2. **Debug enhanced**: `YYYY-MM-DD-HH-mm-ss-debug.json` - After /systematic-debugging runs
3. **Final report**: `YYYY-MM-DD-HH-mm-ss-final.json` - After auto-repair attempts
4. **Latest symlink**: `latest.json` → most recent final report

**Manual Repair Queue Format:**
```typescript
interface ManualRepairRequest {
  id: string;
  reportId: string;              // Links back to diagnostic report
  issueId: string;               // Links to specific issue
  createdAt: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';

  issue: {
    title: string;
    description: string;
    system: string;
    evidence: string[];
  };

  debugging: {
    rootCause?: string;
    method: string;
    findings: string;
  };

  recommendedAction: {
    type: string;                // e.g., "code-change", "config-update", "restart"
    description: string;
    steps: string[];
    risks: string[];
  };

  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  resolution?: {
    action: string;
    resolvedAt: Date;
    notes: string;
  };
}
```

### 6. Notification Strategy

**Alert levels:**
- **Silent**: Log only, no notification
- **Info**: Scheduled report summary
- **Warning**: Issues detected, auto-repaired
- **Critical**: Issues detected, manual intervention needed

**Notification channels:**
- Main channel message (for critical issues)
- Daily digest (scheduled summary)
- Log file (all diagnostics)
- Status dashboard (if implemented)

### 7. Host-Side Manual Repair Processing

Add `/process-repairs` command on host system (similar to `/process-feature-request`):

```bash
# On host machine (Claude Code or terminal)
/process-repairs                    # Show all pending repairs
/process-repairs --repair <id>      # Process specific repair
/process-repairs --complete <id>    # Mark repair as completed
/process-repairs --reject <id>      # Reject/close repair request
```

**What it does:**
1. Scans `groups/main/diagnostics/repairs/pending/`
2. Shows each pending repair with:
   - Issue description and severity
   - Debugging results and root cause
   - Recommended action and steps
   - Links to relevant logs/reports
3. For each repair:
   - User can review the diagnostic data
   - Execute the recommended fix
   - Mark as completed (moves to `completed/`)
   - Or mark as failed (moves to `failed/` with notes)

**Example output:**
```
Found 3 pending repairs:

1. [CRITICAL] OAuth refresh scheduling failure
   Report: groups/main/diagnostics/reports/2026-02-25-14-30-00-final.json
   Issue ID: issue-003

   Root Cause: systemd-run command failing (exit code 1)
   Debugging Method: Log analysis + code inspection

   Recommended Action: Replace systemd-run with Node.js setTimeout
   Steps:
     1. Modify scripts/oauth/refresh.sh
     2. Replace systemd-run with native scheduling
     3. Test token refresh cycle
     4. Verify recovery after failure

   Risks: If scheduling fails, token will expire

   [r] Review report  [f] Apply fix  [s] Skip  [c] Mark completed

2. [HIGH] Container memory leak in batch processor
   ...

Choose action: _
```

**Repair workflow:**
- **Review** (`r`): Opens the full diagnostic report in editor
- **Apply fix** (`f`): Offers to implement the recommended fix (if automatable)
- **Skip** (`s`): Leaves in pending queue
- **Mark completed** (`c`): Moves to completed, prompts for resolution notes

**Automation potential:**
Some repairs could be semi-automated:
- Config changes: Show diff, apply with confirmation
- Code changes: Generate patch, review and apply
- Restart services: Execute with sudo confirmation
- Install dependencies: Run package manager commands

### 8. Metrics & Trends

Track health metrics over time:

```typescript
interface HealthMetrics {
  timestamp: Date;
  oauthSuccessRate: number;
  containerTimeoutRate: number;
  avgResponseTime: number;
  errorRate: number;
  uptime: number;
}
```

**Stored in:** `/workspace/group/diagnostics/metrics.jsonl`

**Trend analysis:**
- Detect degradation over time
- Identify patterns before failures
- Capacity planning insights
- Performance regression detection

## Alternatives Considered

### Alternative 1: External monitoring service
Use external service like DataDog, NewRelic, or Prometheus.

**Pros:**
- Professional-grade monitoring
- Advanced alerting and dashboards
- Industry-standard tools

**Cons:**
- External dependency
- Additional cost
- Data leaves system
- Harder to customize for NanoClaw specifics

**Why not chosen:** Self-contained solution is simpler and more privacy-preserving.

### Alternative 2: Manual health check commands only
Just add `/diagnose` command without scheduled checks.

**Pros:**
- Simpler to implement
- User controls when to check
- Less overhead

**Cons:**
- Reactive only (no proactive detection)
- Relies on user remembering to check
- Issues persist between checks

**Why not chosen:** Scheduled checks enable proactive problem detection.

### Alternative 3: Watchdog-only approach
Just restart failed components without diagnosis.

**Pros:**
- Simple to implement
- Fast recovery

**Cons:**
- No root cause analysis
- Doesn't prevent recurrence
- Hides underlying issues
- No metrics or trends

**Why not chosen:** Diagnosis is needed to fix root causes, not just symptoms.

## Acceptance Criteria

**Diagnostics:**
- [ ] `/diagnose` skill available for on-demand health checks
- [ ] Scheduled diagnostics configurable via settings.json
- [ ] OAuth health analyzer implemented
- [ ] Container health analyzer implemented
- [ ] Agent health analyzer implemented
- [ ] Log analyzer implemented
- [ ] Database health analyzer implemented
- [ ] Message queue analyzer implemented

**Report Generation:**
- [ ] Reports written to `/workspace/group/diagnostics/reports/` in JSON format
- [ ] Report format includes: initial, debug-enhanced, and final versions
- [ ] Reports include issue IDs, severity, evidence, and debugging results
- [ ] `latest.json` symlink always points to most recent final report

**Systematic Debugging Integration:**
- [ ] `/systematic-debugging` automatically triggered for critical/high issues
- [ ] Debugging results integrated into report as `debuggingResults` field
- [ ] Enhanced report saved as `*-debug.json` before auto-repair

**Auto-Repair Engine:**
- [ ] Auto-repair runs AFTER diagnostic report is filed
- [ ] Reads report, identifies repairable issues, executes fixes
- [ ] Safety levels implemented (safe/moderate/risky)
- [ ] Final report includes repair attempts and results
- [ ] Dry-run mode for repair actions
- [ ] Rollback capability for safe repairs
- [ ] Rate limiting on repairs (prevent runaway fixes)

**Manual Repair Queue:**
- [ ] Unresolved issues written to `diagnostics/repairs/pending/`
- [ ] Manual repair format includes debugging results and recommended actions
- [ ] `/process-repairs` host command implemented
- [ ] Repairs can be reviewed, applied, or marked complete/failed
- [ ] Completed repairs moved to `repairs/completed/`
- [ ] Failed repairs moved to `repairs/failed/` with notes

**Notifications & Metrics:**
- [ ] Notification system based on severity
- [ ] User notified when manual repairs are pending
- [ ] Metrics tracking over time in `metrics.jsonl`
- [ ] Trend analysis for degradation detection

**Documentation:**
- [ ] Configuration guide in `diagnostics/README.md`
- [ ] Usage documentation for `/diagnose` and `/process-repairs`
- [ ] Report format specification
- [ ] Troubleshooting guide

## Technical Notes

### Implementation Structure

```
src/diagnostics/
├── index.ts                 # Main diagnostics orchestrator
├── analyzers/
│   ├── oauth.ts            # OAuth health analyzer
│   ├── containers.ts       # Container health analyzer
│   ├── agents.ts           # Agent health analyzer
│   ├── logs.ts             # Log analyzer
│   ├── database.ts         # Database analyzer
│   └── queue.ts            # Message queue analyzer
├── repairs/
│   ├── engine.ts           # Auto-repair decision engine
│   ├── actions.ts          # Repair action implementations
│   └── safety.ts           # Safety checks and confirmations
├── reporting/
│   ├── generator.ts        # Health report generator
│   ├── formatter.ts        # Format reports for display
│   └── notifier.ts         # Send notifications
├── metrics/
│   ├── tracker.ts          # Metrics collection
│   └── trends.ts           # Trend analysis
└── scheduler.ts            # Scheduled diagnostics
```

### Configuration

```json
// settings.json
{
  "diagnostics": {
    "enabled": true,
    "schedule": "0 */6 * * *",
    "reportLevel": "issues-only",
    "autoRepair": true,
    "repairSafetyLevel": "moderate",  // "safe" | "moderate" | "all"
    "alertOnCritical": true,
    "alertOnWarning": false,
    "maxRepairsPerHour": 10,
    "dryRun": false,

    "thresholds": {
      "oauth": {
        "expiryWarningMinutes": 30,
        "maxFailures": 3
      },
      "containers": {
        "maxRuntimeMinutes": 120,
        "timeoutRateThreshold": 0.1,
        "healthCheckTimeout": 10000
      },
      "agents": {
        "stuckThresholdMinutes": 30,
        "idleWarningMinutes": 60
      },
      "logs": {
        "maxSizeMB": 500,
        "errorRateThreshold": 0.05
      },
      "database": {
        "responseTimeThreshold": 100,
        "vacuumThresholdDays": 7
      },
      "queue": {
        "maxDepth": 100,
        "maxMessageAgeSec": 300
      }
    },

    "checks": {
      "oauth": { "enabled": true, "interval": "30m" },
      "containers": { "enabled": true, "interval": "1h" },
      "agents": { "enabled": true, "interval": "15m" },
      "logs": { "enabled": true, "interval": "1d" },
      "database": { "enabled": true, "interval": "1h" },
      "queue": { "enabled": true, "interval": "5m" }
    }
  }
}
```

### Storage

**Directory structure:**
```
/workspace/group/diagnostics/
├── reports/
│   ├── 2026-02-25-14-30-00.json       # Initial diagnostic
│   ├── 2026-02-25-14-30-00-debug.json # After /systematic-debugging
│   ├── 2026-02-25-14-30-00-final.json # After auto-repair
│   └── latest.json                     # Symlink → most recent final
├── repairs/
│   ├── pending/
│   │   ├── issue-003-oauth-refresh.json
│   │   └── issue-042-memory-leak.json
│   ├── completed/
│   │   └── issue-001-stuck-agent.json
│   └── failed/
│       └── issue-012-database-lock.json
├── metrics.jsonl                       # Time-series health metrics
└── README.md                           # Documentation
```

**Report files:**
- Location: `diagnostics/reports/`
- Naming: `YYYY-MM-DD-HH-mm-ss[-suffix].json`
  - No suffix: Initial diagnostic
  - `-debug`: After debugging enhanced
  - `-final`: After auto-repair
- Retention: 30 days (configurable)
- Format: JSON (see HealthReport interface above)

**Manual repair queue:**
- Location: `diagnostics/repairs/pending/`
- Naming: `issue-{id}-{slug}.json`
- Format: JSON (see ManualRepairRequest interface above)
- Workflow:
  - Created by auto-repair engine when issue requires host action
  - Processed by `/process-repairs` on host
  - Moved to `completed/` or `failed/` when resolved

**Metrics:**
- Location: `diagnostics/metrics.jsonl`
- Format: JSON Lines (one metric snapshot per line)
- Retention: 90 days (configurable)
- Used for trend analysis and capacity planning

### Integration Points

**Hooks:**
- `onOAuthFailure()` - Trigger OAuth analyzer
- `onContainerTimeout()` - Trigger container analyzer
- `onAgentStuck()` - Trigger agent analyzer
- `onSystemStart()` - Run quick diagnostic
- `onSchedule()` - Run full diagnostic

**APIs:**
- `getDiagnosticReport()` - Get latest report
- `runDiagnostics(options)` - Run on-demand check
- `getHealthMetrics(timeRange)` - Get metrics
- `executeRepair(action, confirm)` - Execute repair

### Testing Strategy

1. **Unit tests:**
   - Each analyzer independently
   - Repair action safety checks
   - Report generation

2. **Integration tests:**
   - End-to-end diagnostic flow
   - Auto-repair execution
   - Notification delivery

3. **Chaos testing:**
   - Inject failures (stuck agents, crashed containers)
   - Verify detection and repair
   - Measure recovery time

### Performance Considerations

- **Lightweight checks**: Quick checks run frequently, comprehensive checks less often
- **Non-blocking**: Diagnostics run in background, don't block user messages
- **Resource limits**: Diagnostic process has memory/CPU caps
- **Throttling**: Rate limit repairs to prevent cascade failures

### Security Considerations

- **Repair permissions**: Require elevated permissions for risky repairs
- **Audit trail**: Log all diagnostic runs and repairs
- **Sensitive data**: Never log OAuth tokens, credentials, or PII
- **Rate limiting**: Prevent abuse of repair system

## Related

This feature addresses the systemic issue identified in the OAuth outage incident (2026-02-25) and provides proactive monitoring to prevent similar silent failures in the future.

Also relates to:
- OAuth Token Refresh Reliability & Auto-Recovery (2026-02-25)
- Future monitoring and observability features
