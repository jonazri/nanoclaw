# Feature Request: Akiflow Todo Integration

**Date:** 2026-02-25
**Status:** new
**Requested by:** Yonatan Azrielant
**Priority:** important

## Problem

Task management is fragmented:
- Todos mentioned in WhatsApp get lost in chat history
- No automatic capture of action items from conversations
- Manual entry required to add tasks to Akiflow
- No visibility into task status from within chat
- Cannot query "what's on my todo list today?" from WhatsApp

**User Impact:**
- Action items from group chats require manual transcription to Akiflow
- No conversational interface to todo list
- Task context (from chat) separated from task tracking tool
- Requires context-switching between WhatsApp and Akiflow

## Proposed Solution

### Core Capability

Integrate Andy with Akiflow to provide conversational todo management:

**Create:**
```
User: Remind me to follow up with Sarah about the proposal
Andy: ✅ Added to Akiflow: "Follow up with Sarah about proposal"
      Due: Today at 5 PM
```

**Read:**
```
User: What's on my todo list today?
Andy: You have 5 tasks today:
      • [9 AM] Team standup
      • [2 PM] Review Q1 budget
      • [5 PM] Follow up with Sarah about proposal
      • Call dentist (no time set)
      • Submit expense report (overdue by 2 days)
```

**Update:**
```
User: Move the Sarah follow-up to tomorrow
Andy: ✅ Rescheduled "Follow up with Sarah" to tomorrow at 5 PM
```

**Delete:**
```
User: Cancel the dentist call
Andy: ✅ Removed "Call dentist" from your todo list
```

### Akiflow API Integration

**Authentication:**
- Akiflow uses API keys (https://developers.akiflow.com/)
- User provides API key via setup command
- Stored securely in `.env` or group config

**API Capabilities:**
```typescript
// Create task
POST /api/v1/tasks
{
  "title": "Follow up with Sarah about proposal",
  "date": "2026-02-25",
  "time": "17:00",
  "list_id": "inbox",  // or specific list
  "priority": "medium"
}

// List tasks
GET /api/v1/tasks?date=2026-02-25&status=open

// Update task
PATCH /api/v1/tasks/{task_id}
{
  "date": "2026-02-26",
  "completed": false
}

// Delete task
DELETE /api/v1/tasks/{task_id}

// Get task by ID
GET /api/v1/tasks/{task_id}
```

### Architecture Pattern: Generic Todo Integration

Rather than hardcoding Akiflow, design a **pluggable todo provider system**:

```typescript
// src/todo-providers/base.ts
interface TodoProvider {
  name: string

  // CRUD operations
  createTask(task: TodoTask): Promise<TodoTask>
  listTasks(filters?: TodoFilters): Promise<TodoTask[]>
  getTask(taskId: string): Promise<TodoTask>
  updateTask(taskId: string, updates: Partial<TodoTask>): Promise<TodoTask>
  deleteTask(taskId: string): Promise<void>

  // Optional: advanced features
  searchTasks?(query: string): Promise<TodoTask[]>
  completeTa sk?(taskId: string): Promise<TodoTask>
  setReminder?(taskId: string, time: Date): Promise<void>
}

interface TodoTask {
  id: string
  title: string
  description?: string
  dueDate?: Date
  dueTime?: string  // HH:MM format
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  tags?: string[]
  listId?: string  // Project/list/category
  completed: boolean
  createdAt: Date
  updatedAt: Date
}

interface TodoFilters {
  date?: Date  // Tasks due on specific date
  dateRange?: { start: Date, end: Date }
  completed?: boolean
  priority?: string
  listId?: string
  tags?: string[]
}
```

**Provider Implementations:**

```typescript
// src/todo-providers/akiflow.ts
class AkiflowProvider implements TodoProvider {
  constructor(private apiKey: string) {}

  async createTask(task: TodoTask): Promise<TodoTask> {
    const response = await fetch('https://api.akiflow.com/v1/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: task.title,
        description: task.description,
        date: task.dueDate?.toISOString().split('T')[0],
        time: task.dueTime,
        priority: task.priority,
        list_id: task.listId || 'inbox'
      })
    });

    return this.parseAkiflowTask(await response.json());
  }

  // ... implement other methods
}

// src/todo-providers/todoist.ts
class TodoistProvider implements TodoProvider {
  // Similar structure, different API endpoints
}

// src/todo-providers/notion.ts
class NotionProvider implements TodoProvider {
  // Notion database integration
}

// src/todo-providers/local.ts
class LocalFileProvider implements TodoProvider {
  // Fallback: store in JSON file
}
```

**Provider Selection:**

```typescript
// src/todo-manager.ts
class TodoManager {
  private provider: TodoProvider

  constructor(providerName: string, config: Record<string, any>) {
    switch (providerName) {
      case 'akiflow':
        this.provider = new AkiflowProvider(config.apiKey);
        break;
      case 'todoist':
        this.provider = new TodoistProvider(config.apiToken);
        break;
      case 'notion':
        this.provider = new NotionProvider(config.apiKey, config.databaseId);
        break;
      default:
        this.provider = new LocalFileProvider(config.filePath);
    }
  }

  async addTask(title: string, options?: Partial<TodoTask>): Promise<TodoTask> {
    return this.provider.createTask({ title, ...options, completed: false });
  }

  // ... proxy methods to provider
}
```

**Configuration:**

```env
# .env
TODO_PROVIDER=akiflow
AKIFLOW_API_KEY=...
```

```markdown
# CLAUDE.md
## Todo Integration
- Provider: Akiflow
- Default list: Inbox
- Auto-capture: enabled (detect action items in conversations)
- Reminder notifications: enabled
```

### Natural Language Processing

**Task Detection:**
```typescript
function detectTaskIntent(message: string): TaskIntent | null {
  const patterns = {
    create: /remind me to|add task|todo:|need to|should|must/i,
    list: /what's on my (todo )?list|tasks (for )?today|what do i need to do/i,
    complete: /(mark |set )?(.*) (as )?(done|complete)/i,
    update: /move|reschedule|change|update (.*) to/i,
    delete: /remove|delete|cancel (.*) task/i
  };

  for (const [intent, pattern] of Object.entries(patterns)) {
    if (pattern.test(message)) {
      return { type: intent, match: message.match(pattern) };
    }
  }

  return null;
}
```

**Smart Date/Time Parsing:**
```typescript
function parseNaturalTime(text: string): { date?: Date, time?: string } {
  // "tomorrow" → tomorrow's date
  // "tomorrow at 3pm" → tomorrow at 15:00
  // "next Monday" → date of next Monday
  // "in 2 hours" → current time + 2 hours
  // "Friday morning" → next Friday at 9 AM

  // Use library like chrono-node or date-fns
  return parseDateTime(text);
}
```

### User Experience Examples

**Auto-Capture from Conversation:**
```
User: I need to prepare slides for the board meeting next week
Andy: 📋 I detected a task. Should I add this to Akiflow?

      Task: "Prepare slides for board meeting"
      Due: Next week (Monday, March 3)

User: Yes
Andy: ✅ Added to Akiflow
```

**Quick Add:**
```
User: todo: Call insurance company about claim
Andy: ✅ Added: "Call insurance company about claim"
      Due: Today (no time set)
```

**List with Filters:**
```
User: Show me my high-priority tasks
Andy: High-priority tasks:

      🔴 URGENT (3):
      • Submit Q4 report (overdue by 1 day)
      • Review legal documents (due today at 2 PM)
      • Approve budget (due today at 5 PM)

      🟠 HIGH (2):
      • Interview candidate (tomorrow at 10 AM)
      • Finalize contract terms (Friday)
```

**Contextual Updates:**
```
[In a group chat discussing project timeline]

User: Okay, let's push the demo to next Friday instead
Andy: 🔄 Updated task: "Project demo" → rescheduled to March 7
```

## Alternatives Considered

### Alternative 1: Manual Todo Commands Only
- **Rejected:** Requires explicit syntax, loses conversational flow

### Alternative 2: Use Claude's Memory Instead of External Tool
- **Rejected:** Doesn't integrate with user's existing workflow/tools

### Alternative 3: Email-Based Task Capture
- **Rejected:** Requires leaving chat, breaks conversation

### Alternative 4: Build Custom Todo System
- **Rejected:** Reinventing the wheel, users already have preferred tools

### Alternative 5: Zapier/IFTTT Integration
- **Rejected:** Adds latency, limited customization, another service dependency

## Acceptance Criteria

- [ ] Akiflow API authentication configured
- [ ] CRUD operations work: create, read, update, delete tasks
- [ ] Natural language task creation ("remind me to X")
- [ ] Date/time parsing ("tomorrow at 3pm", "next Monday")
- [ ] List tasks with filters (date, priority, completion status)
- [ ] Auto-detection of tasks in conversations (opt-in)
- [ ] Task completion via chat ("mark X as done")
- [ ] Reschedule tasks conversationally
- [ ] Handle Akiflow lists/projects correctly
- [ ] Error handling (API failures, invalid task data)
- [ ] Rate limiting to avoid API quota issues
- [ ] Privacy: only user can access their own tasks
- [ ] Works across all messaging platforms
- [ ] Extensible to other todo providers (Todoist, Notion, etc.)

## Technical Notes

### Akiflow API Documentation

**Base URL:** `https://api.akiflow.com/v1`

**Authentication:**
```typescript
headers: {
  'Authorization': 'Bearer YOUR_API_KEY',
  'Content-Type': 'application/json'
}
```

**Rate Limits:**
- 100 requests per minute
- 1000 requests per hour

### Implementation Files

**New File:** `src/todo-manager.ts`
```typescript
export class TodoManager {
  constructor(private provider: TodoProvider) {}

  async handleTodoIntent(intent: TaskIntent, message: string): Promise<string> {
    switch (intent.type) {
      case 'create':
        return this.createFromMessage(message);
      case 'list':
        return this.listTasks(message);
      case 'complete':
        return this.completeTask(message);
      // ... other cases
    }
  }
}
```

**Skill Directory:** `.claude/skills/akiflow/`
```yaml
skill: akiflow
description: "Manage todos in Akiflow via conversation"
version: 1.0.0
adds:
  - src/todo-manager.ts
  - src/todo-providers/akiflow.ts
  - src/todo-providers/base.ts
modifies:
  - src/channels/whatsapp.ts  # Add todo intent detection
```

### Natural Language Parsing

**Library Options:**
1. **chrono-node** - Natural language date/time parsing
2. **compromise** - NLP for task extraction
3. **date-fns** - Date manipulation

```typescript
import chrono from 'chrono-node';

const parsed = chrono.parse('remind me tomorrow at 3pm')[0];
// { start: { date: Date, ... }, text: 'tomorrow at 3pm' }
```

### Privacy & Security

- API keys encrypted at rest
- Per-user isolation (can't access other users' tasks)
- Rate limiting per user to prevent abuse
- Option to disable auto-capture (privacy concern)
- Tasks not stored locally (query Akiflow API only)

### Testing

**Mock Provider for Tests:**
```typescript
class MockTodoProvider implements TodoProvider {
  private tasks: TodoTask[] = [];

  async createTask(task: TodoTask): Promise<TodoTask> {
    this.tasks.push({ ...task, id: uuid(), createdAt: new Date() });
    return task;
  }

  // ... mock other methods
}
```

**Test Cases:**
- Parse natural language dates correctly
- Handle API failures gracefully
- Respect rate limits
- Multiple users don't see each other's tasks
- Task updates reflected immediately

## Future Enhancements

- **Calendar integration:** Sync tasks with Google Calendar
- **Voice task creation:** Transcribe voice notes → create tasks
- **Recurring tasks:** "Every Monday at 9 AM"
- **Task templates:** Common task patterns
- **Subtasks:** Break down complex tasks
- **Collaboration:** Assign tasks to others in group chats
- **Reminders:** Proactive notifications before deadlines
- **Smart scheduling:** AI suggests optimal task timing
- **Multi-provider:** Sync across Akiflow, Todoist, Notion

## Related

None currently.

## Dependencies

- Akiflow API access (free tier available)
- `node-fetch` or `axios` for HTTP requests
- `chrono-node` for date parsing
- `uuid` for generating task IDs

## Questions for Host

1. **Provider preference:** Start with Akiflow only, or build generic system first?
2. **Auto-capture:** Should Andy detect todos automatically or require explicit command?
3. **Privacy:** Store task cache locally or always query API?
4. **Scope:** Which messaging platforms should support todo management?
5. **Extensibility:** Worth building provider abstraction for future tools?
