# Chorus Feature Roadmap

Features that would make Chorus a world-class ADHD productivity assistant.

---

## Currently Have vs Missing

### What We Have
- 5 specialized agents with distinct personalities
- Email (Gmail/Resend), Calendar (Google), Tasks (Todoist/Google Tasks)
- WhatsApp messaging
- Memory with semantic search
- Contact & venue management
- Check-ins (morning/evening)
- Idle detection & reunion
- Web search
- FTUE onboarding

### What's Missing (Priority Order)

---

## Tier 1: High Impact, Should Have Now

### 1. Document Creation & Sharing
**The Ask**: "Create a doc and send to John"

**Features**:
- Generate Google Docs from conversation
- Create meeting notes, action items, summaries
- Share via email or link
- Template support (meeting notes, project brief, weekly update)

**Tools to Add**:
```
google_create_doc(title, content, shareWith?)
google_share_doc(docId, email, permission)
create_meeting_notes(meetingId) // from calendar event
```

**Use Cases**:
- "Summarize our conversation and send to the team"
- "Create meeting notes from my 3pm call"
- "Draft a project brief for Project X"

---

### 2. File & Screenshot Handling
**The Ask**: "Look at this screenshot" / "Check this PDF"

**Features**:
- Accept image uploads in Telegram
- OCR/vision analysis of screenshots
- PDF text extraction
- File summaries

**Tools to Add**:
```
analyze_image(imageUrl)
extract_pdf_text(pdfUrl)
summarize_document(content)
```

**Use Cases**:
- "What does this error screenshot say?"
- "Summarize this PDF contract"
- "What's in this receipt?"

---

### 3. Voice Messages
**The Ask**: Voice note instead of typing

**Features**:
- Accept voice messages in Telegram
- Transcribe using Whisper API
- Process as text message
- Respond with voice (optional)

**Tools to Add**:
```
transcribe_audio(audioUrl)
text_to_speech(text) // optional response
```

**Use Cases**:
- User sends voice note while walking
- Hands-free interaction
- Capture thoughts quickly

---

### 4. Recurring Tasks & Habits
**The Ask**: "Remind me to take meds every day at 9am"

**Features**:
- Create recurring reminders
- Habit tracking with streaks
- Gentle accountability
- Skip/snooze without guilt

**Tools to Add**:
```
create_recurring_reminder(task, frequency, time)
log_habit(habitId, completed)
get_habit_streaks()
skip_reminder(reminderId, reason?)
```

**Use Cases**:
- Daily medication reminders
- Weekly review prompts
- Exercise tracking
- Water intake nudges

---

### 5. Quick Capture / Inbox
**The Ask**: "Just dump this thought somewhere"

**Features**:
- Quick capture without categorization
- Process inbox later with agent help
- Auto-categorize into tasks/notes/ideas
- "Inbox zero" flow

**Tools to Add**:
```
quick_capture(thought)
get_inbox()
process_inbox_item(itemId, action)
```

**Use Cases**:
- Capture idea while in meeting
- "Deal with this later"
- Brain dump without friction

---

### 6. Focus Mode / Body Doubling Sessions
**The Ask**: "Stay with me while I work for 25 minutes"

**Features**:
- Pomodoro-style sessions
- Ember stays present with check-ins
- "How's it going?" every 5-10 minutes
- Celebration at end
- Track focus sessions

**Tools to Add**:
```
start_focus_session(duration, task?)
end_focus_session(completed?)
get_focus_stats()
```

**Use Cases**:
- Body doubling for hard tasks
- Pomodoro technique
- Accountability partner

---

### 7. Smart Notifications / Nudges
**The Ask**: Proactive helpful reminders

**Features**:
- "You have a meeting in 15 minutes"
- "You said you'd email John today"
- "It's been 3 days since you mentioned Project X"
- Configurable nudge intensity

**Triggers**:
- Calendar event approaching
- Task due soon
- Promised action not done
- Goal check-in due
- Pattern-based (usually exercise on Tuesdays)

---

## Tier 2: Medium Impact, Nice to Have

### 8. Note Taking & Knowledge Base
**Features**:
- Persistent notes organized by topic
- Link notes to contacts, projects
- Search across notes
- "What did I write about X?"

**Tools to Add**:
```
create_note(title, content, tags?)
search_notes(query)
get_notes_by_tag(tag)
link_note_to_contact(noteId, contactId)
```

---

### 9. Project Tracking
**Features**:
- Group tasks into projects
- Project status overview
- Milestones and deadlines
- "How's Project X going?"

**Tools to Add**:
```
create_project(name, goals, deadline?)
add_task_to_project(taskId, projectId)
get_project_status(projectId)
update_project_milestone(projectId, milestone)
```

---

### 10. Time Tracking
**Features**:
- Track time spent on tasks
- "I worked on X for 2 hours"
- Weekly time reports
- Billing/invoicing support

**Tools to Add**:
```
start_timer(task?)
stop_timer()
log_time(task, duration)
get_time_report(period)
```

---

### 11. Expense Tracking
**Features**:
- Quick expense logging
- Categories and budgets
- Receipt image capture
- Monthly summaries

**Tools to Add**:
```
log_expense(amount, category, description?)
get_expenses(period, category?)
set_budget(category, amount)
```

---

### 12. Reading List / Links
**Features**:
- Save links for later
- Summarize articles
- "What did I save about X?"
- Reading reminders

**Tools to Add**:
```
save_link(url, tags?)
get_reading_list()
summarize_link(url)
mark_as_read(linkId)
```

---

### 13. Location-Based Reminders
**Features**:
- "Remind me to buy milk when I'm near the store"
- Location sharing in Telegram
- Geofence triggers

**Tools to Add**:
```
create_location_reminder(task, location)
check_location_triggers(lat, lng)
```

---

### 14. Social/Relationship Tracking
**Features**:
- "I haven't talked to John in a while"
- Relationship maintenance reminders
- Birthday/anniversary reminders
- "When did I last see X?"

**Tools to Add**:
```
get_neglected_relationships(days)
set_relationship_frequency(contactId, frequency)
get_upcoming_birthdays()
```

---

### 15. Mood/Energy Tracking
**Features**:
- Quick mood check-ins
- Energy level tracking
- Correlate mood with activities
- Insights over time

**Tools to Add**:
```
log_mood(mood, energy?, notes?)
get_mood_history(period)
get_mood_insights()
```

---

## Tier 3: Future Vision

### 16. Calendar Intelligence
- Auto-suggest meeting times based on energy
- Block focus time automatically
- "You're overbooked this week"
- Travel time between meetings

### 17. Email Intelligence
- Auto-draft replies
- "What emails need responses?"
- Follow-up tracking
- Email templates

### 18. Financial Awareness
- Connect to bank (Plaid)
- "How much did I spend this month?"
- Bill reminders
- Subscription tracking

### 19. Health Integration
- Sleep tracking (Apple Health/Fitbit)
- Exercise logging
- Medication tracking with refill reminders
- "You slept poorly, maybe lighter day?"

### 20. Learning Mode
- Spaced repetition for learning
- "Quiz me on X"
- Track learning goals
- Connect to courses/books

### 21. Team/Delegation
- Share tasks with others
- "Ask John to do X"
- Delegation tracking
- Team accountability

### 22. Integrations Wishlist
- Notion
- Slack
- Linear/Jira
- Spotify (mood music)
- Smart home (lights, etc.)

---

## Implementation Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Document creation | High | Medium | P0 |
| Voice messages | High | Low | P0 |
| Recurring reminders | High | Low | P0 |
| Focus sessions | High | Low | P0 |
| Quick capture | Medium | Low | P1 |
| Smart notifications | High | Medium | P1 |
| File/screenshot handling | Medium | Medium | P1 |
| Note taking | Medium | Medium | P2 |
| Project tracking | Medium | High | P2 |
| Time tracking | Low | Medium | P3 |
| Location reminders | Low | High | P3 |

---

## Quick Wins (< 1 day each)

1. **Recurring reminders** - Simple cron + notification
2. **Focus sessions** - Timer + periodic messages
3. **Quick capture** - Append to inbox file
4. **Voice transcription** - Whisper API call
5. **Smart nudges** - Check calendar/tasks on tick

---

## Architecture Considerations

### For Documents
- Google Docs API (already have OAuth)
- Markdown generation from conversation
- Template system

### For Voice
- Telegram audio message handler
- Whisper API or local whisper.cpp
- Optional: ElevenLabs for voice responses

### For Recurring
- Cron-like scheduler (already have TriggerScheduler)
- Persistent storage for recurring rules
- Skip/snooze state

### For Focus
- Session state in user state
- Tick-based check-ins
- Integration with idle engine

---

## User Research Questions

Before building, validate:
1. How do users currently capture quick thoughts?
2. What's the #1 thing they forget to do?
3. Do they want voice or prefer typing?
4. How often do they need documents created?
5. What makes them abandon productivity tools?

---

## The ADHD-Specific Angle

What makes Chorus different from generic assistants:

1. **No judgment** - Never "you should have..."
2. **Tiny steps** - Always break down, never overwhelm
3. **Celebration** - Every small win matters
4. **Flexibility** - Skip without guilt, reschedule easily
5. **Pattern awareness** - "You usually struggle on Mondays"
6. **Emotional support** - Not just tasks, feelings too
7. **Body doubling** - Presence during hard tasks
8. **Memory offload** - Never "didn't you remember?"
9. **Starting help** - The hardest part is beginning
10. **Time blindness** - Proactive reminders, realistic estimates

Every new feature should embody these principles.
