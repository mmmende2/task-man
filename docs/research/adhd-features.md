# ADHD-Informed Feature Proposals for Task Man

Features and modifications designed around how the ADHD brain works. Each proposal references the relevant ADHD mechanisms and explains *why* it helps, not just *what* it does.

See also: [adhd-brain-overview.md](adhd-brain-overview.md), [adhd-software-ux.md](adhd-software-ux.md)

---

## New Features

### 1. Pomodoro / Focus Timer

**ADHD mechanisms**: Time blindness, task initiation (wall of awful), dopamine/reward system, hyperfocus regulation

**What**: A built-in timer that attaches to the currently focused task. Start a work session (default 25 min), and the timer is visible in the UI. When it ends, a short break prompt appears. The timer externalizes time perception — ADHD brains cannot track time internally, so the tool does it for them.

**Why this matters for ADHD**:
- **Lowers the wall of awful**: "Work on this for 25 minutes" is radically less intimidating than "work on this until it's done." The commitment is finite and visible.
- **Creates urgency without crisis**: The countdown provides the urgency that ADHD brains need to activate, without the shame and stress of a real deadline.
- **Catches hyperfocus**: Without a timer, an ADHD user might spend 4 hours on a task that should take 1, neglecting everything else. The timer break is a natural exit ramp.
- **Generates micro-rewards**: Each completed session is a dopamine hit. "3 sessions today" is tangible progress even if the task isn't done yet.

**Design considerations**:
- Timer visible in the header bar at all times (ambient, not intrusive)
- `t` key to start/stop timer from focus mode
- Configurable duration (15/25/45 min) — ADHD users often need shorter or longer sessions depending on the task
- Break prompt is gentle, not blocking: "25 min done. Take a break? (y/any key to continue)"
- Track sessions per task for personal velocity data
- No penalty for stopping early or skipping breaks — the timer is a scaffold, not a warden
- Optional: session count visible on task card ("3 sessions today")

---

### 2. Momentum Mode (Post-Completion Nudge)

**ADHD mechanisms**: Transition moments, dopamine chaining, decision paralysis, task initiation

**What**: When you complete a task (press `D`), instead of just returning to the list, briefly show a "momentum prompt" — the next suggested task surfaces with a single keypress to start it. This catches the transition moment between tasks, which is the highest-risk dropout point for ADHD.

**Why this matters for ADHD**:
- **Catches the transition moment**: The moment after completing a task is when ADHD brains are most vulnerable to distraction. The dopamine from completion is fading, and without a clear next step, the brain will seek stimulation elsewhere (phone, browser, rabbit hole).
- **Eliminates decision paralysis**: "What should I do next?" with 8 options causes shutdown. "Do this next? (enter/skip)" with 1 suggestion preserves momentum.
- **Dopamine chaining**: Completing task A provides dopamine. Immediately starting task B rides that wave. The gap between A and B is where momentum dies.

**Design considerations**:
- Appears briefly (3-5 seconds) after marking done, then fades to normal view
- Suggests next task by: same-category first, then highest priority, then shortest (quick wins)
- `Enter` to start it, any other key to dismiss
- Never blocks — if the user keeps typing or navigating, it dissolves
- Shows: task title, priority dot, estimated effort if available
- "Nice. Next up: [task title]? (enter)"

---

### 3. Quick Win Surfacing

**ADHD mechanisms**: Wall of awful, task initiation, dopamine/reward system, decision paralysis

**What**: A mode or filter that surfaces only "quick win" tasks — small, completable tasks that can be knocked out in under 5-10 minutes. Accessible via a keybinding from focus mode. This gives ADHD users an on-ramp when the wall of awful is too high for their main work.

**Why this matters for ADHD**:
- **Lowers the wall**: When the main task feels impossible, doing *something* is better than doing nothing. Quick wins build momentum that can carry into harder work.
- **Dopamine priming**: Completing 2-3 small tasks generates enough dopamine to tackle a larger one. This is a legitimate neurological strategy, not procrastination.
- **Combats "all or nothing" thinking**: ADHD brains often frame productivity as binary — either I do the hard thing or I've failed. Quick wins create a middle path.

**Design considerations**:
- `q` key from focus mode to toggle quick-win filter
- Surfaces tasks with no subtasks (atomic), low/medium priority, status = todo
- Could also surface individual subtasks from larger tasks
- Shows as a minimal list: "Quick wins (4): [task] [task] [task] [task]"
- Completing a quick win triggers momentum mode (feature #2)
- After completing 2-3 quick wins, gently suggest returning to the focused task

---

### 4. Energy Level Check-In

**ADHD mechanisms**: Interest-based nervous system, emotional dysregulation, self-awareness scaffolding

**What**: On first launch of the day (or configurable), a brief one-key check-in: "Energy right now? (h)igh / (m)edium / (l)ow". This sets the context for which tasks get surfaced. High energy → show the challenging focused tasks. Low energy → show quick wins and maintenance tasks.

**Why this matters for ADHD**:
- **Meets the user where they are**: ADHD energy and focus fluctuate wildly day-to-day and hour-to-hour. A tool that always shows the hardest tasks ignores the reality that some days, the brain simply cannot engage with hard things.
- **Reduces shame**: On a low-energy day, seeing "Quick wins for a low-energy day" reframes the situation from "I can't do my real work" to "I'm doing what I can with what I have."
- **Prevents overwhelm**: Showing urgent, complex tasks when the user is already running low triggers shutdown, not action.

**Design considerations**:
- Single keypress, no screen change — the check-in is a bar that appears and disappears
- Affects task surfacing order, not filtering (user can still navigate to any task)
- Stored per-session, not persisted — no historical tracking of energy levels (that could become a source of shame)
- Could resurface mid-day: "It's been 3 hours. Still feeling [medium]? (y/n)"
- Optional — can be disabled entirely

---

### 5. Brain Dump Mode

**ADHD mechanisms**: Working memory limitations, object permanence, capturing fleeting thoughts

**What**: A rapid-capture mode optimized for getting thoughts out of the head and into the system with absolute minimum friction. Even faster than write mode — no priority selection, no category, just titles fired off one after another. Everything goes to backlog by default.

**Why this matters for ADHD**:
- **Captures before it vanishes**: ADHD working memory holds 2-3 items. A thought that isn't captured in seconds is gone forever. Brain dump mode reduces capture time to near-zero.
- **Separates capture from organization**: The ADHD brain can do one or the other, but forcing both simultaneously causes dropout. Capture now, organize later (or never — smart defaults handle it).
- **Reduces the "someday graveyard" problem**: By defaulting everything to backlog and making triage a separate activity (plan mode), brain dumps don't pollute the focus view.

**Design considerations**:
- Accessible from any mode via a global key (e.g., `b` for brain dump)
- Single text field, enter to save, immediately ready for next entry
- No priority prompt, no category prompt — just title
- All tasks created as backlog, todo, medium priority
- Visual feedback: a count of items captured this session ("dumped: 7")
- ESC exits back to previous mode
- Pairs naturally with plan mode — after dumping, switch to plan mode to triage

---

### 6. "Just Start" Timer (2-Minute Rule)

**ADHD mechanisms**: Wall of awful, task initiation, dopamine/reward system

**What**: A micro-commitment variant of the pomodoro. When staring at a task and unable to start, press a key to start a 2-minute timer. The commitment is: "just work on this for 2 minutes. If you want to stop after 2 minutes, stop." The psychological trick: most people continue past 2 minutes because starting was the hard part.

**Why this matters for ADHD**:
- **The wall of awful scales with perceived commitment**: "Work on this for 2 minutes" has a much smaller wall than "work on this for 25 minutes" which has a much smaller wall than "finish this."
- **Leverages the sunk-cost effect positively**: Once 2 minutes of work is invested, continuing feels easier than stopping.
- **Task initiation is the bottleneck**: For ADHD, starting is 90% of the battle. This is a targeted intervention for the hardest moment.

**Design considerations**:
- `2` key from focus mode on the selected task
- Tiny countdown in the header: "just 2 min... 1:47"
- At 0:00: "2 min done! Keep going? (enter/esc)" — enter starts a full pomodoro, esc stops
- If the user keeps going past 2 minutes, quietly transition to pomodoro mode
- Track "just start" → continued conversions in metrics (shows the user that starting is the hardest part)

---

### 7. Context Restoration ("Welcome Back")

**ADHD mechanisms**: Object permanence, working memory, context loss

**What**: When the interactive CLI is opened (not first launch of the day, but any reopen), briefly show a context line: "Last session: worked on [task], completed [task], [task]." This restores the mental context that was lost when the user switched away.

**Why this matters for ADHD**:
- **Object permanence**: Tasks and progress that are not visible are forgotten. Reopening the tool without context restoration means the user starts from zero, cognitively.
- **Reduces the "what was I doing?" overhead**: Without this, the user spends 2-5 minutes re-orienting, which is often enough friction to cause abandonment.

**Design considerations**:
- One line, shown for 3-5 seconds or until any keypress
- Shows: last task worked on (if in_progress), last 1-2 tasks completed
- Not a splash screen — it's a subtle bar in the header area
- Stored in a lightweight session log (`~/.task-man/session.json`)

---

### 8. Weekly Reset / Fresh Start

**ADHD mechanisms**: Fresh start problem, shame avoidance, novelty

**What**: A weekly ritual feature. At the start of each week (or on demand), task-man offers a "fresh start": review last week's incomplete focused tasks and decide what carries forward. Anything not explicitly carried forward returns to backlog. The focus list starts clean.

**Why this matters for ADHD**:
- **Turns the fresh-start impulse into a feature**: Instead of abandoning the whole system for a new one, the user gets a mini fresh start within the system. The novelty of a clean slate is satisfied without losing data.
- **Prevents shame accumulation**: Stale focused tasks from 3 weeks ago are a constant source of guilt. The weekly reset clears the emotional debt.
- **Forces intentional recommitment**: Rather than tasks lingering indefinitely, the user actively chooses what matters *this week*.

**Design considerations**:
- Triggered automatically on first open of the week (Monday), or via `task-man reset`
- Shows: "Last week: completed X, carrying over Y. Start fresh? (enter)"
- Lists incomplete focused tasks with checkboxes to carry forward
- Un-selected tasks move to backlog (not deleted — no data loss)
- Completion stats from last week shown as positive reinforcement
- Can be skipped/dismissed with ESC
- Optional: weekly email summary of what was accomplished

---

### 9. Ambient Task Awareness (Shell Prompt Integration)

**ADHD mechanisms**: Object permanence, context loss, "out of sight out of mind"

**What**: An optional shell prompt segment that shows the current focused task directly in the terminal prompt. The task is visible every time the user runs any command, not just when task-man is open.

**Why this matters for ADHD**:
- **Solves object permanence**: The #1 reason ADHD users abandon task systems is forgetting the system exists. If the current task is in the prompt, it's impossible to forget.
- **Zero-cost awareness**: No context switch, no app switch, no deliberate action required. The task is just *there*.
- **Gentle redirect**: When the user is deep in a rabbit hole, seeing "Focus: Fix auth bug" in their prompt is a non-judgmental nudge back to the intended work.

**Design considerations**:
- `task-man prompt` outputs a formatted string for embedding in PS1/PROMPT
- Shows: abbreviated task title (truncated to ~30 chars), maybe a timer if running
- Color-coded: cyan for in_progress, dim for no active task
- Updates when task status changes
- Setup: one line added to `.zshrc` / `.bashrc`
- Respects `NO_COLOR` and minimal terminal environments

---

### 10. Celebration & Progress Amplification

**ADHD mechanisms**: Dopamine/reward system, micro-rewards, emotional regulation

**What**: Enhanced feedback when completing tasks. Not just removing an item from a list — active celebration scaled to the accomplishment. A single subtask gets a subtle acknowledgment. Completing the last subtask of a parent task gets a bigger moment. Completing all focused tasks for the day gets the biggest.

**Why this matters for ADHD**:
- **Dopamine architecture**: Most task managers are dopamine deserts. Checking a box and watching an item disappear is not a reward. The ADHD brain needs engineered reward moments.
- **Progress visibility**: "You've completed 4 tasks today" is abstract. A visual celebration makes the progress *felt*, not just known.
- **Counters the negativity bias**: ADHD brains are wired to notice what's wrong, not what's right. Active celebration forces attention to accomplishments.

**Design considerations**:
- Subtask done: brief flash/highlight + task progress bar updates
- Task done: progress counter increments visibly, brief encouraging micro-message
- All focused tasks done: special display moment — "Focus cleared! You crushed it."
- Daily completion count always visible in footer or header
- Messages are text-art style, consistent with outrun aesthetic — no emojis
- Completion sound (optional, off by default) — a subtle terminal bell or tone
- End-of-day metrics mode already exists — this extends celebrations into the moment of completion

---

## Modifications to Existing Features

### M1. Focus Mode — Limit Visible Peripheral Tasks

**Current**: Focus mode shows one expanded task + all remaining focused tasks as compact rows.

**Problem**: If there are 8 focused tasks, the compact list still triggers overwhelm. The ADHD brain sees 8 items and feels the weight of all of them.

**Proposed change**: Show at most 2-3 peripheral tasks below the expanded one. Add "+ N more focused" at the bottom (similar to the backlog count). The user sees the current task and a hint of what's next, without a wall of obligations.

**Why**: Working memory holds 2-3 items. The visible list should match that capacity.

---

### M2. Plan Mode — "Pick 3" Guardrail --- DONE (2026-03-26)

**Status**: Implemented. Default limit of 3, configurable via `task-man config focus.maxFocused N`. Soft warning on exceeding: "You have 3 focused tasks. Add another? spc:confirm any:cancel". Override persists for the session. Set to `null` to disable.

**Problem**: ADHD users in a motivated moment will focus 15 tasks, then feel crushed by the weight of all 15 when they switch to focus mode. The hyperfocus on planning creates an unrealistic plate.

**Why**: Self-regulation is impaired. The tool provides the guardrail the brain can't. Research and practical experience shows that 3 "must do" items is the sweet spot for ADHD daily planning.

---

### M3. Write Mode — Even Less Friction + Flag Capture --- DONE (2026-03-26)

**Status**: Implemented. Phase 2 (priority prompt) eliminated entirely. Enter saves immediately with default medium priority. CLI-style flag parsing added: `-p high -c housework -s professional -d "notes" -f`. Live preview of parsed flags below input. Backward compatible with `title - category` syntax.

**Problem**: The priority selection step is friction. For brain-dump style entry, any second step causes dropout. Default priority changed from `high` to `medium` to prevent urgency inflation.

**Why**: The dropout curve (20-40% per step for ADHD) means the priority prompt loses a significant percentage of task captures. Flag parsing gives power users inline metadata capture without forcing it on everyone.

---

### M4. Metrics Mode — Reframe as Progress, Not Gap --- DONE (2026-03-26)

**Status**: Implemented. "Done today: 3" is now the hero metric. Stats line (Completed/In Progress/Todo) removed. Section renamed "Focused Tasks" → "Today's Progress". Tasks sorted done-first. Progress bar present without percentage label.

**Problem**: The todo count is a reminder of what's not done, which triggers shame. "In Progress: 1" without context feels like stalled work.

**Why**: ADHD brains respond to what they see first. Leading with the accomplishment count creates a positive frame. Showing the gap first triggers deficit thinking.

---

### M5. Encouraging Messages — Shame-Free Low-Progress Messages --- DONE (2026-03-26)

**Status**: Implemented. All 15 `MID_DAY_LOW` messages rewritten. New pool is completely progress-neutral — no references to counts, no implied struggling, no "keep going" pressure. Focus on presence and process (e.g., "You showed up. That's the hardest part.", "Your pace is your pace.", "Rest is part of the work.").

**Problem**: Even supportive messages about low progress can feel patronizing or shame-triggering via RSD. "Hang in there" implies struggling. "The hardest part is starting" implies you haven't started.

**Why**: RSD (rejection sensitive dysphoria) means even well-intentioned messages can be perceived as criticism if they acknowledge underperformance.

---

### M6. Insights Engine — No Negative Comparisons --- DONE (2026-03-26)

**Status**: Implemented. `productivity_tip` insight type removed entirely (was the only critical one). `scope_balance` all-professional message reframed from "don't forget personal tasks!" to "Deep professional focus today." `InsightType` union updated (now 7 types, was 8).

**Problem**: Downward comparisons are shame triggers. The insight that was supposed to motivate instead makes the user feel worse.

**Why**: The interest-based nervous system is not motivated by "you're doing worse." It's motivated by challenge, novelty, and progress. Negative comparisons activate shame, not motivation.

---

### M7. End-of-Day Report — "Tomorrow's Focus" Section --- DONE (2026-03-26)

**Status**: Implemented. New section between Stats and Insight showing focused tasks still in todo/in_progress. Sorted in_progress first, then by priority. Capped at 5 with overflow count. Empty state: "No tasks focused for tomorrow. Nice clean slate." Rendered in both terminal and HTML email.

**Problem**: The report ends without forward momentum. The ADHD brain forgets overnight what it decided to do next. Tomorrow morning, the user opens the tool with no context.

**Why**: Object permanence. Without this, the user wakes up and has to reconstruct their plan from scratch, which is an executive-function-heavy task that ADHD brains often can't do first thing in the morning.

---

## Feature Priority Matrix

Organized by impact on ADHD users vs. implementation complexity:

| Feature | ADHD Impact | Complexity | Status |
|---------|-------------|------------|--------|
| M3. Write mode friction + flags | High | Low | **DONE** (2026-03-26) |
| M4. Metrics reframe | High | Low | **DONE** (2026-03-26) |
| M5. Shame-free messages | High | Low | **DONE** (2026-03-26) |
| M6. No negative insights | High | Low | **DONE** (2026-03-26) |
| M2. "Pick 3" guardrail | Medium | Low | **DONE** (2026-03-26) |
| M7. Tomorrow's focus | Medium | Low | **DONE** (2026-03-26) |
| M1. Limit peripheral tasks | High | Low | Next |
| #2. Momentum mode | Very High | Medium | Next |
| #5. Brain dump mode | Very High | Low | Next |
| #1. Pomodoro timer | Very High | Medium | Next |
| #6. "Just start" 2-min timer | High | Low | Next |
| #10. Celebration amplification | High | Medium | Next |
| #3. Quick win surfacing | High | Medium | Soon |
| #7. Context restoration | Medium | Low | Soon |
| #4. Energy check-in | Medium | Medium | Later |
| #8. Weekly reset | Medium | Medium | Later |
| #9. Shell prompt integration | Medium | Medium | Later |

---

*All features follow the core principle: the tool provides the executive function scaffolding that the ADHD brain lacks. It remembers, it decides, it celebrates, it limits, it nudges — so the user doesn't have to.*
