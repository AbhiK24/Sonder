# Structural Improvements - Sonder Engine

## Current Architecture Assessment

### What We Have (Good Foundation)

| Component | Location | What It Does | Status |
|-----------|----------|--------------|--------|
| **FactStore** | `utils/fact-store.ts` | Stores claims, tracks contradictions | Works |
| **NPCIdentity** | `types/index.ts` | Personality, voice, goals | Works |
| **NPCMemory** | `types/index.ts` | Assertions about player/others | Works |
| **Persistence** | `utils/persistence.ts` | Save/load to JSON | Works |
| **World Tick** | `telegram-bot.ts` | Events while away | Basic |
| **Trust System** | `telegram-bot.ts` | Trust 0-100 per NPC | Works |

### What's Missing for Angels Use Case

**The Angels concept requires agents that:**
1. Proactively reach out (not just respond)
2. Talk to EACH OTHER about the user
3. Read external content and synthesize it
4. Remember and celebrate user wins
5. Track tasks, commitments, patterns
6. Connect to real-world APIs (calendar, email, etc.)

---

## GAPS: What Needs to Be Built

### 1. PROACTIVE MESSAGING SYSTEM

**Current:** NPCs only respond when user messages
**Needed:** Agents initiate contact based on triggers

```typescript
interface ProactiveTrigger {
  id: string;
  agentId: string;
  type: 'time' | 'event' | 'pattern' | 'inactivity' | 'external';
  condition: TriggerCondition;
  message: string | (() => Promise<string>);
  cooldown: number; // minutes
  lastFired?: Date;
}

interface TriggerCondition {
  // Time-based
  schedule?: CronExpression;  // "0 9 * * *" = 9am daily

  // Event-based
  onEvent?: string;  // "task_overdue", "commitment_missed"

  // Pattern-based
  pattern?: string;  // "user_stuck_3_days", "no_wins_this_week"

  // Inactivity
  inactivityHours?: number;

  // External
  externalApi?: string;  // "calendar_event_soon"
}
```

**Implementation:**
- [ ] Trigger registry
- [ ] Scheduler (cron-like)
- [ ] Pattern detector
- [ ] Push notification system (Telegram, WhatsApp)

---

### 2. INTER-AGENT COMMUNICATION

**Current:** No mechanism for agents to talk to each other
**Needed:** Angels discuss user, debate approaches, reach consensus

```typescript
interface AgentDiscussion {
  id: string;
  topic: string;  // "how_to_help_user_start_task"
  participants: string[];  // ["urvashi", "menaka", "chitralekha"]
  context: DiscussionContext;
  messages: DiscussionMessage[];
  outcome?: DiscussionOutcome;
  visibleToUser: boolean;
}

interface DiscussionMessage {
  agentId: string;
  content: string;
  type: 'observation' | 'suggestion' | 'disagreement' | 'question' | 'decision';
  timestamp: Date;
}

interface DiscussionOutcome {
  decision: string;
  actingAgent: string;
  action: string;
  reasoning: string;
}
```

**Implementation:**
- [ ] Discussion generator (multi-turn LLM)
- [ ] Agent-to-agent memory (what they said to each other)
- [ ] Consensus mechanism
- [ ] Discussion viewer UI for user

---

### 3. AGENT STATE & ACTIVITIES

**Current:** NPCs have identity but no "current state"
**Needed:** Angels have moods, activities, attention

```typescript
interface AgentState {
  id: string;
  identity: AgentIdentity;

  // Current state
  mood: AgentMood;
  currentActivity: string;  // "reviewing your week", "reading an article"
  attentionOn: string | null;  // "user", "other_angel", null
  energyLevel: number;  // Affects response style

  // Memory
  memoryStream: MemoryEntry[];
  reflections: Reflection[];
  aboutUser: UserKnowledge;

  // Relationships
  relationshipsWithOtherAgents: AgentRelationship[];
}

interface AgentMood {
  primary: 'excited' | 'calm' | 'concerned' | 'playful' | 'thoughtful';
  reason: string;
  since: Date;
}

interface MemoryEntry {
  id: string;
  timestamp: Date;
  type: 'observation' | 'interaction' | 'reflection' | 'external';
  content: string;
  importance: number;  // 1-10
  tags: string[];
}
```

**Implementation:**
- [ ] Agent state manager
- [ ] Activity simulation (what are angels doing when not helping)
- [ ] Mood effects on responses
- [ ] Memory stream with retrieval scoring

---

### 4. TASK & COMMITMENT STORE

**Current:** FactStore tracks claims about NPCs/world
**Needed:** Store user's tasks, commitments, patterns

```typescript
interface TaskStore {
  tasks: Task[];
  commitments: Commitment[];
  patterns: UserPattern[];
  wins: Win[];
}

interface Task {
  id: string;
  content: string;
  createdAt: Date;
  dueDate?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'abandoned';
  source: 'user' | 'angel_suggested';
  mentions: TaskMention[];  // When angels referenced this
  completedAt?: Date;
}

interface Commitment {
  id: string;
  content: string;  // "call mom this week"
  madeAt: Date;
  deadline?: Date;
  status: 'active' | 'fulfilled' | 'missed' | 'renegotiated';
  reminders: Date[];
}

interface UserPattern {
  id: string;
  type: 'positive' | 'concerning' | 'neutral';
  description: string;  // "tends to avoid tasks for 3+ days then panic"
  firstObserved: Date;
  frequency: number;
  examples: string[];
}

interface Win {
  id: string;
  description: string;  // "completed proposal after 4 days of avoidance"
  celebratedAt: Date;
  celebratedBy: string[];  // Which angels celebrated
  magnitude: 'small' | 'medium' | 'big' | 'huge';
  context: string;  // Why this mattered
}
```

**Implementation:**
- [ ] Task CRUD operations
- [ ] Commitment tracking with reminders
- [ ] Pattern detector (runs on tick)
- [ ] Win recognition system
- [ ] Persistence (local-first)

---

### 5. REFLECTION ENGINE

**Current:** No pattern recognition on user data
**Needed:** Angels notice patterns, connect dots, generate insights

```typescript
interface ReflectionEngine {
  // Runs periodically (daily? weekly?)
  generateReflections(userHistory: UserHistory): Promise<Reflection[]>;

  // Connect content to user's life
  connectToUser(content: ExternalContent, userContext: UserContext): Promise<Connection[]>;

  // Manifestation: track potential
  assessGrowth(timeframe: 'week' | 'month' | 'quarter'): Promise<GrowthAssessment>;
}

interface Reflection {
  id: string;
  type: 'pattern' | 'insight' | 'connection' | 'growth';
  content: string;
  supportingEvidence: string[];
  generatedAt: Date;
  sharedWithUser: boolean;
  agentWhoGenerated: string;
}

interface GrowthAssessment {
  period: string;
  winsCount: number;
  patterns: {
    improving: string[];
    stuck: string[];
    new: string[];
  };
  potentialUnlocked: string[];  // "you're now comfortable starting tasks same-day"
  nextFrontier: string;  // "the next growth edge"
}
```

**Implementation:**
- [ ] Reflection scheduler
- [ ] Pattern matching on task history
- [ ] Growth tracking over time
- [ ] LLM-powered insight generation
- [ ] Manifestation prompts (positive belief generation)

---

### 6. CONTENT CURATION LAYER

**Current:** No ability to read external content
**Needed:** Angels read feeds, discuss content, present to user

```typescript
interface ContentCurator {
  sources: ContentSource[];
  fetchAndProcess(): Promise<CuratedContent[]>;
  generateDiscussion(content: CuratedContent): Promise<AgentDiscussion>;
}

interface ContentSource {
  id: string;
  type: 'rss' | 'newsletter' | 'twitter' | 'youtube' | 'podcast';
  url: string;
  userInterest: string[];  // Tags user cares about
  frequency: 'realtime' | 'daily' | 'weekly';
}

interface CuratedContent {
  id: string;
  source: string;
  title: string;
  summary: string;
  fullText?: string;
  relevanceToUser: number;  // 0-1
  connectionToUserLife?: string;  // How it relates to their situation
  angelDiscussion?: AgentDiscussion;  // Angels' take on it
}
```

**Implementation:**
- [ ] RSS/feed fetcher
- [ ] Content summarizer
- [ ] Relevance scorer (based on user context)
- [ ] Discussion generator for content
- [ ] User preference learning

---

### 7. INTEGRATION ADAPTERS

**Current:** Only Telegram bot
**Needed:** Connect to user's real tools

```typescript
interface IntegrationAdapter {
  id: string;
  type: IntegrationType;
  connected: boolean;
  credentials: EncryptedCredentials;

  // Capabilities
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;  // Always false for safe integrations
}

type IntegrationType =
  | 'google_calendar'
  | 'apple_calendar'
  | 'todoist'
  | 'notion'
  | 'gmail'
  | 'whatsapp'
  | 'telegram'
  | 'slack'
  | 'spotify';

// Safe actions only
interface IntegrationActions {
  calendar: {
    read: () => Promise<CalendarEvent[]>;
    add: (event: CalendarEvent) => Promise<void>;
    // NO delete
  };
  email: {
    read: (filter: EmailFilter) => Promise<EmailSummary[]>;
    draft: (email: EmailDraft) => Promise<void>;
    send: (email: EmailDraft, requireConfirm: true) => Promise<void>;
    // NO delete
  };
  tasks: {
    read: () => Promise<Task[]>;
    add: (task: Task) => Promise<void>;
    complete: (taskId: string) => Promise<void>;
    // NO delete
  };
  messaging: {
    send: (to: string, message: string, requireConfirm: boolean) => Promise<void>;
  };
}
```

**Implementation:**
- [ ] OAuth flow for each service
- [ ] Credential encryption (local)
- [ ] Rate limiting
- [ ] Action logging (transparency)
- [ ] Confirmation UI for sensitive actions

---

### 8. DISCUSSION GENERATOR

**Current:** Single-agent responses only
**Needed:** Multi-agent conversations about user

```typescript
interface DiscussionGenerator {
  // Generate angels discussing the user
  aboutUser(
    topic: string,
    participants: string[],
    context: UserContext
  ): Promise<AgentDiscussion>;

  // Generate angels discussing content
  aboutContent(
    content: CuratedContent,
    participants: string[]
  ): Promise<AgentDiscussion>;

  // Generate angels debating an approach
  debateApproach(
    situation: string,
    participants: string[],
    options: string[]
  ): Promise<AgentDiscussion>;
}
```

**Implementation:**
- [ ] Multi-turn conversation generator
- [ ] Agent voice consistency
- [ ] Disagreement injection (realistic debate)
- [ ] Outcome extraction
- [ ] Discussion formatting for display

---

## ARCHITECTURAL REFACTOR NEEDED

### Current: Everything in telegram-bot.ts

```
telegram-bot.ts (1400+ lines)
├── State management
├── NPC responses
├── World tick
├── Commands
└── Everything else
```

### Proposed: Modular Engine

```
packages/engine/src/
├── core/
│   ├── agent.ts           # Base agent class
│   ├── agent-state.ts     # State management
│   ├── discussion.ts      # Inter-agent communication
│   └── scheduler.ts       # Proactive triggers
│
├── stores/
│   ├── fact-store.ts      # Existing (refactor)
│   ├── task-store.ts      # NEW: Tasks & commitments
│   ├── memory-store.ts    # NEW: Memory stream
│   └── win-store.ts       # NEW: Accomplishments
│
├── engines/
│   ├── reflection.ts      # Pattern recognition
│   ├── curation.ts        # Content processing
│   └── manifestation.ts   # Growth tracking
│
├── integrations/
│   ├── adapter.ts         # Base adapter
│   ├── calendar.ts        # Google/Apple Calendar
│   ├── tasks.ts           # Todoist/Notion
│   ├── email.ts           # Gmail/SMTP
│   └── messaging.ts       # WhatsApp/Telegram/Slack
│
├── chat/
│   ├── telegram.ts        # Telegram adapter
│   ├── whatsapp.ts        # WhatsApp adapter
│   └── web.ts             # Web interface
│
└── plays/
    ├── wanderers-rest/    # Mystery game (existing)
    └── swargaloka/        # Angels for ADHD (NEW)
```

---

## PRIORITY ORDER

### Phase 1: Core Agent Behaviors
1. **Agent State** - Mood, activity, attention
2. **Proactive Triggers** - Time-based, event-based
3. **Task Store** - Basic task tracking

### Phase 2: Inter-Agent Magic
4. **Discussion Generator** - Angels talk to each other
5. **Memory Stream** - Stanford-style memory
6. **Reflection Engine** - Pattern recognition

### Phase 3: Real-World Utility
7. **Integration Adapters** - Calendar, tasks, messaging
8. **Content Curation** - RSS, newsletters
9. **Win Tracking** - Celebrations, growth

### Phase 4: Polish
10. **Manifestation Engine** - Positive beliefs, potential
11. **User Preferences** - Intensity, frequency
12. **Multi-platform** - WhatsApp, web, mobile

---

## WHAT CAN BE REUSED

| Existing | Reusable For Angels? | Notes |
|----------|---------------------|-------|
| FactStore | Partially | Refactor for tasks/commitments |
| NPCIdentity | Yes | Rename to AgentIdentity |
| Persistence | Yes | Extend for new stores |
| LLM Providers | Yes | No changes needed |
| Telegram Bot | Yes | Add proactive messaging |
| World Tick | Refactor | Become agent scheduler |

---

## OPEN DECISIONS

1. **Storage:** SQLite vs JSON files for task history?
2. **Scheduling:** In-process cron vs external scheduler?
3. **Multi-device:** How to sync if user has phone + desktop?
4. **Offline:** What happens when user is offline?
5. **Migration:** How to migrate Wanderer's Rest users to new architecture?

---

*This document tracks what needs to change in the Sonder engine to support both the mystery game AND the Angels use case.*
