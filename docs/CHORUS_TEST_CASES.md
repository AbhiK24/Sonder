# Chorus Test Cases

Comprehensive test suite for all Chorus agent capabilities, integrations, and scenarios.

---

## 1. Agent Selection & Personalities

### 1.1 Luna (The Keeper)
| Test | Input | Expected |
|------|-------|----------|
| Memory trigger | "I mentioned wanting to learn guitar last week" | Luna responds with memory recall |
| Pattern recognition | "I keep forgetting my meds" | Luna notices pattern, offers gentle reminder system |
| Morning check-in lead | Trigger morning check-in | Luna leads |
| Continuity | "What did I say about my project?" | Luna recalls previous context |

### 1.2 Ember (The Spark)
| Test | Input | Expected |
|------|-------|----------|
| Starting paralysis | "I can't start this task" | Ember suggests tiny first step |
| Body doubling | "I need someone while I work" | Ember offers to stay present |
| Energy boost | "I have no motivation" | Ember provides energetic encouragement |
| Momentum | "Let's just do 5 minutes" | Ember engages with enthusiasm |

### 1.3 Sage (The Guide)
| Test | Input | Expected |
|------|-------|----------|
| Overwhelm | "I have too many things to do" | Sage helps prioritize |
| Decision paralysis | "I don't know what to do first" | Sage asks clarifying questions |
| Permission to drop | "Should I even do this?" | Sage helps evaluate importance |
| Planning | "How should I approach this project?" | Sage breaks it down |

### 1.4 Joy (The Light)
| Test | Input | Expected |
|------|-------|----------|
| Win dismissal | "It's not a big deal that I finished" | Joy celebrates genuinely |
| Self-criticism | "I'm so bad at this" | Joy counters with evidence |
| Small win | "I finally replied to that email" | Joy notices and celebrates |
| Progress | "I've been trying for weeks" | Joy highlights growth |

### 1.5 Echo (The Mirror)
| Test | Input | Expected |
|------|-------|----------|
| Emotion reflection | "I feel weird about this" | Echo helps name the feeling |
| Spiraling | "Everything is falling apart" | Echo grounds and reflects |
| Processing | "I just need to vent" | Echo holds space without fixing |
| Shame | "I'm such a failure" | Echo separates feelings from facts |

### 1.6 Agent Switching
| Test | Input | Expected |
|------|-------|----------|
| Direct mention | "Luna, what do you think?" | Switches to Luna |
| @mention | "@Ember help me start" | Switches to Ember |
| Slash command | "/sage" | Switches to Sage |
| Auto-select overwhelm | "I'm so overwhelmed" | Auto-selects Sage |
| Auto-select celebration | "I did it!" | Auto-selects Joy |

---

## 2. Communication Tools

### 2.1 Email (Gmail/Resend)
| Test | Input | Expected |
|------|-------|----------|
| Send email | "Email John about the meeting" | Confirmation prompt with details |
| Confirm send | "Yes" after email prompt | Email sent, confirmation |
| Cancel send | "No" after email prompt | Cancelled message |
| Contact resolution | "Email mom" | Resolves contact, asks if ambiguous |
| Unknown recipient | "Email random@test.com" | Uses email directly |
| CC support | "Email John, cc Sarah" | Both recipients included |
| Test email | "/testemail" | Sends test to USER_EMAIL |

### 2.2 WhatsApp
| Test | Input | Expected |
|------|-------|----------|
| Send WhatsApp | "WhatsApp mom about dinner" | Confirmation prompt |
| Allowlist check | Send to non-allowlisted number | Error: not in allowlist |
| Rate limiting | Send 21 messages in an hour | Rate limit error |
| Test WhatsApp | "/testwhatsapp" | Sends test message |
| Contact resolution | "WhatsApp John" | Resolves phone number |

---

## 3. Calendar Tools (Google Calendar)

### 3.1 Reading Calendar
| Test | Input | Expected |
|------|-------|----------|
| Today's events | "What's on my calendar today?" | Lists today's events |
| Upcoming events | "What do I have this week?" | Lists week's events |
| Search events | "When is my dentist appointment?" | Finds matching event |
| Free time | "When am I free tomorrow?" | Shows available slots |
| Event details | "Tell me more about the 3pm meeting" | Full event details |

### 3.2 Creating Events
| Test | Input | Expected |
|------|-------|----------|
| Create event | "Schedule lunch with Sarah tomorrow at noon" | Confirmation with details |
| Venue resolution | "Meeting at Blue Tokai" | Resolves to saved venue address |
| Contact invitation | "Invite John to the meeting" | Resolves email, adds invitee |
| Duration | "2 hour meeting" | Correct duration set |
| Human-readable time | Confirmation message | Shows "Fri, Feb 21, 3:00 PM" not ISO |
| Confirm create | "Yes" after event prompt | Event created, link provided |

### 3.3 Updating Events
| Test | Input | Expected |
|------|-------|----------|
| Reschedule | "Move the 3pm meeting to 4pm" | Finds event, confirms change |
| Change location | "Change venue to WeWork" | Updates location |
| Add attendee | "Add Sarah to the meeting" | Adds invitee |

---

## 4. Task Management

### 4.1 Google Tasks
| Test | Input | Expected |
|------|-------|----------|
| Get tasks | "What are my tasks?" | Lists pending tasks |
| Create task | "Add task: buy groceries" | Task created |
| Create with due date | "Remind me to call mom tomorrow" | Task with due date |

### 4.2 Todoist (if configured)
| Test | Input | Expected |
|------|-------|----------|
| Get tasks | "Show my Todoist tasks" | Lists tasks |
| Create task | "Add to Todoist: review PR" | Task created |
| Complete task | "Mark 'buy groceries' as done" | Task completed |
| Today's tasks | "What's due today?" | Today's tasks |
| Overdue tasks | "What's overdue?" | Overdue tasks |

---

## 5. Contacts & Venues

### 5.1 Contacts
| Test | Input | Expected |
|------|-------|----------|
| Save contact | "Save John's email as john@example.com" | Contact saved |
| Save with details | "John works at Acme Corp as PM" | Full contact saved |
| Lookup contact | "What's Sarah's email?" | Returns contact info |
| Disambiguation | "Email John" (multiple Johns) | Asks which John |
| List contacts | "Show my contacts" | Lists by category |
| Contact history | "When did I last meet with John?" | Shows interaction history |
| Add note | "I met John at the conference" | Interaction recorded |

### 5.2 Venues
| Test | Input | Expected |
|------|-------|----------|
| Save venue | "Save Blue Tokai Koramangala address" | Venue saved |
| Lookup venue | "What's the address of WeWork?" | Returns full address |
| List venues | "Show my saved venues" | Lists all venues |
| Use in event | "Meeting at Third Wave" | Resolves to address |

---

## 6. Memory System

### 6.1 Remember
| Test | Input | Expected |
|------|-------|----------|
| Store preference | "I prefer morning meetings" | Stored as preference |
| Store fact | "My anniversary is March 15" | Stored as fact |
| Store context | "I'm working on Project X" | Stored as context |
| Store goal | "I want to run a marathon" | Stored as goal |

### 6.2 Recall
| Test | Input | Expected |
|------|-------|----------|
| Semantic search | "What do I prefer for meetings?" | Recalls morning preference |
| Context recall | "What project am I working on?" | Recalls Project X |
| Cross-session | New session asks about preferences | Recalls from previous |

---

## 7. Web Search

| Test | Input | Expected |
|------|-------|----------|
| Current events | "What's the weather today?" | Real-time answer |
| Factual query | "Best hotels in Gokarna" | Search results, not hallucination |
| News | "Latest tech news" | Current news |
| No disclaimer | Any search query | No "I can't search" messages |

---

## 8. FTUE (First Time User Experience)

| Test | Input | Expected |
|------|-------|----------|
| New user start | First message | Luna welcomes, begins flow |
| Recent win question | Share a win | Joy celebrates |
| Recent struggle | Share a struggle | Sage offers perspective |
| Goal setting | Set 3 goals | Goals stored with domains |
| Off-topic during FTUE | Ask unrelated question | Answers, then returns to flow |
| Resume FTUE | Start app mid-FTUE | Continues from where left off |
| Complete FTUE | Finish all steps | Profile created, agents introduced |

---

## 9. Check-ins

| Test | Input | Expected |
|------|-------|----------|
| Morning check-in | 9:00 AM trigger | Luna leads, asks about day |
| Evening check-in | 9:00 PM trigger | Joy leads, celebrates day |
| Manual check-in | "/checkin" | Triggers immediate check-in |
| Quiet hours | Trigger during 10pm-8am | No check-in sent |

---

## 10. Idle Engine & Presence

| Test | Input | Expected |
|------|-------|----------|
| Departure detection | 60+ minutes away | Marks user as away |
| Thought accumulation | While user away | Agents generate thoughts |
| Reunion greeting | Return after 1+ hour | Luna welcomes back |
| Reunion thoughts | After reunion | Shares accumulated thoughts |
| Quick return | Return after 10 minutes | No reunion (too short) |

---

## 11. Slash Commands

| Test | Input | Expected |
|------|-------|----------|
| /start | "/start" | Welcome or restart |
| /help | "/help" | List of commands |
| /status | "/status" | Current agent, state |
| /history | "/history" | Last 10 messages |
| /reset | "/reset" | Clears all data |
| /luna | "/luna" | Switches to Luna |
| /ember | "/ember" | Switches to Ember |
| /sage | "/sage" | Switches to Sage |
| /joy | "/joy" | Switches to Joy |
| /echo | "/echo" | Switches to Echo |

---

## 12. Confirmation Flow

| Test | Input | Expected |
|------|-------|----------|
| Pending action stored | Request email/event/WhatsApp | Action stored, confirmation asked |
| Confirm variations | "yes", "yep", "go ahead", "do it" | Action executed |
| Cancel variations | "no", "cancel", "nevermind" | Action cancelled |
| Timeout | Ignore for 5+ minutes, send other message | Action cleared |
| Different request | Request something else while pending | Old action cleared, new processed |

---

## 13. Error Handling

| Test | Input | Expected |
|------|-------|----------|
| Missing email config | Send email without RESEND_API_KEY | Graceful error message |
| Missing calendar | Calendar action without OAuth | Error with setup instructions |
| Missing WhatsApp | WhatsApp without config | Error message |
| Invalid contact | "Email nonexistent person" | Asks for email address |
| API failure | External API down | Friendly error, retry suggestion |
| LLM error | LLM timeout | Supportive fallback message |

---

## 14. Multi-User Support

| Test | Input | Expected |
|------|-------|----------|
| Separate states | User A and B interact | Separate histories |
| Separate profiles | User A and B complete FTUE | Separate goals |
| Separate contacts | User A saves contact | User B doesn't see it |

---

## 15. Persistence

| Test | Input | Expected |
|------|-------|----------|
| Session save | Send messages, restart bot | History preserved |
| Profile save | Complete FTUE, restart | Profile preserved |
| Contact save | Save contact, restart | Contact preserved |
| Venue save | Save venue, restart | Venue preserved |
| Memory save | Store memory, restart | Memory preserved |

---

## 16. Edge Cases

| Test | Input | Expected |
|------|-------|----------|
| Empty message | Send empty or whitespace | Graceful handling |
| Very long message | 10000+ characters | Truncated or handled |
| Special characters | Emojis, unicode | Handled correctly |
| Markdown in message | **bold** _italic_ | Rendered properly |
| Multiple tool calls | "Email John and schedule meeting" | Both handled |
| Rapid messages | 10 messages in 5 seconds | All processed |

---

## 17. Integration Health Checks

| Test | Method | Expected |
|------|--------|----------|
| Telegram connection | Bot starts | "@SonderChorusBot is running" |
| Email (Resend) | Check logs | "Email (Resend) connected" |
| Email (Gmail) | OAuth flow | "Gmail connected" |
| Calendar (ICS) | Check logs | "Calendar connected (N feed)" |
| Calendar (Google) | OAuth flow | "Google Calendar connected" |
| WhatsApp (Baileys) | Check logs | QR code or "connected to WA" |
| Todoist | Check logs | "Todoist connected" or "not configured" |
| Memory (Ollama) | Check logs | "Memory enabled (N entries)" |
| LLM Provider | Check logs | "LLM Provider: kimi" |

---

## Test Execution Checklist

### Daily Smoke Tests
- [ ] Bot starts without errors
- [ ] Send message, get response
- [ ] Agent name appears once (not duplicated)
- [ ] Time shown in human-readable format
- [ ] Web search returns real results

### Weekly Full Tests
- [ ] All 5 agents respond correctly
- [ ] Email send/confirm flow
- [ ] Calendar create/confirm flow
- [ ] Contact save/lookup
- [ ] Memory store/recall
- [ ] Check-in triggers

### After Code Changes
- [ ] TypeScript compiles (pnpm typecheck)
- [ ] Bot starts successfully
- [ ] Changed feature works
- [ ] No regressions in related features

---

## Known Issues to Watch

1. **Agent name duplication** - Fixed: prompt says "Do NOT prefix with your name"
2. **Time format** - Fixed: uses formatTimeHuman()
3. **Tool parser** - Fixed: accepts both ```json and ```tool blocks
4. **WhatsApp logout** - May need QR re-scan if 401 error
5. **Kimi web search** - Uses K2 model with $web_search builtin
