# ADHD Feature Specs — Detailed Implementation Plan

Detailed specs for selected modifications and new ideas. Each section covers what changes, why, current behavior, proposed behavior, and implementation notes.

See also: [adhd-brain-overview.md](adhd-brain-overview.md), [adhd-software-ux.md](adhd-software-ux.md), [adhd-features.md](adhd-features.md)

---

## 1. Plan Mode — Focus Guardrails

### Why (ADHD lens)

ADHD brains in a motivated planning moment will over-commit. Focusing 12 tasks feels productive *during planning*, but switching to focus mode with 12 items triggers overwhelm and shutdown. Self-regulation is the core deficit — the tool must provide the guardrail the brain can't.

Research suggests 3 "must do" items is the sweet spot for ADHD daily planning. Enough to feel purposeful, few enough to avoid paralysis.

### Current behavior

`PlanMode.tsx` — Spacebar toggles `focused` on any task. No limit, no feedback, no friction. A user can focus 30 tasks without any pushback.

### Proposed behavior

- **Default guardrail: 3 focused tasks.** When the user tries to focus a 4th task, show a soft warning inline (not a modal, not blocking):
  ```
  You have 3 focused tasks. Add another? (space to confirm, any key to cancel)
  ```
- **The guardrail is a nudge, not a wall.** Pressing space again confirms. Any other key cancels. The user is always in control.
- **Configurable via `~/.task-man/config.json`:**
  ```json
  {
    "focus": {
      "maxFocused": 3
    }
  }
  ```
- **CLI configuration:** `task-man config focus.maxFocused 5`
- **Set to `0` or `null` to disable guardrails entirely.**
- **The warning only appears once per "over-limit" action.** If the user has already confirmed past the limit, subsequent focuses in the same session don't re-warn (they've made their choice). The warning resets on next app launch.

### Implementation notes

**Config changes** (`types.ts`, `constants.ts`):
```typescript
// Add to TaskManConfig
interface TaskManConfig {
  email: { /* existing */ };
  focus: {
    maxFocused: number | null;  // default 3, null = no limit
  };
}

// DEFAULT_CONFIG addition
focus: { maxFocused: 3 }
```

**PlanMode.tsx changes:**
- Add state: `guardrailOverridden` (boolean, default false)
- Add state: `showGuardrailWarning` (boolean, default false)
- On spacebar when focusing (not unfocusing):
  - If `focusedTasks.length >= config.focus.maxFocused` AND `!guardrailOverridden`:
    - Set `showGuardrailWarning = true`, store pending task
    - On next spacebar: confirm, set `guardrailOverridden = true`, apply focus
    - On any other key: cancel, clear warning
  - Else: normal focus toggle
- Warning rendered as a subtle line below the task list (not a popup/overlay)

**Footer hint update:**
- When warning is showing: `spc:confirm  any:cancel`
- Normal: `spc:focus` (unchanged)

---

## 2. Write Mode — Reduced Friction + Flag Capture

Two changes bundled together: removing the mandatory priority step, and adding inline flag parsing for power users who want to capture metadata without switching to the CLI.

### 2a. Skip the Priority Prompt

#### Why (ADHD lens)

The dropout curve for ADHD users is 20-40% per interaction step. The current two-phase flow (title → priority) means ~30% of task captures are lost at the priority prompt. The user had the thought, typed the title, and then the tool asks them to make *another* decision. For ADHD, that second decision is often the one that doesn't happen.

#### Current behavior

`WriteMode.tsx` — Phase 1: type title, press Enter. Phase 2: press `l`/`m`/`h`/`u` or Enter (defaults to high). Task created, reset to phase 1.

#### Proposed behavior

- **Enter saves immediately with default priority (medium, not high).** One keypress, done. No phase 2.
- **Priority can be set inline before pressing Enter** by pressing `l`/`m`/`h`/`u` as a modifier. But this is optional and the task is always saveable with just Enter.
- Actually — this gets complex with the modifier approach. Simpler: **use the flag syntax (see 2b below).** If the user wants to set priority, they type it as a flag: `clean dishes -p high`. If they don't include a flag, default is medium.
- **Phase 2 is eliminated entirely.** Title → Enter → saved.

#### Default priority change

Current default is `high`. This is wrong for ADHD — it creates urgency inflation where everything is high priority, which means nothing is. **New default: `medium`.** The user can escalate via flags or later in plan mode.

### 2b. Flag Capture in Write Mode

#### Why

The non-interactive CLI already supports rich flag parsing: `task-man add "clean dishes" -p high -c housework -s personal`. Write mode should understand the same syntax so power users can capture metadata inline without leaving interactive mode. This mirrors how developers already think — flags are natural in a terminal context.

#### Current behavior

Write mode parses `title - category` (dash-delimited). No support for flags.

#### Proposed behavior

Parse the input line for CLI-style flags before saving. The parser should handle:

```
clean dishes                          → title: "clean dishes", defaults for everything
clean dishes -p high                  → title: "clean dishes", priority: high
clean dishes -c housework             → title: "clean dishes", categories: ["housework"]
clean dishes -p high -c housework     → both
clean dishes -s professional          → scope override
clean dishes -d "greasy pan too"      → description
```

**Flag reference (mirrors CLI `add` command):**

| Flag | Long | Value | Notes |
|------|------|-------|-------|
| `-p` | `--priority` | `low`, `medium`, `high`, `urgent` (or `l`/`m`/`h`/`u`) | Default: medium |
| `-c` | `--category` | category name | Repeatable: `-c work -c backend` |
| `-s` | `--scope` | `personal`, `professional` (or `per`/`pro`) | Overrides active scope filter |
| `-d` | `--description` | quoted string | Task description |
| `-f` | `--focused` | (no value) | Add as focused instead of backlog |

**Backward compatibility:** The existing `title - category` syntax continues to work. Flag parsing takes precedence if flags are detected (presence of `-` followed by a known flag letter).

**Subtask syntax unchanged:** `: subtask title` still works. Flags can be combined: `: write tests -p high`.

#### Implementation notes

**Parser approach:**
- Don't use Commander for this — it's designed for process argv, not interactive input parsing. Write a lightweight parser or use a simple regex/split approach.
- Split input on flag boundaries: find `-p`, `-c`, `-s`, `-d`, `-f` tokens and extract their values.
- Everything before the first flag is the title.
- If no flags detected, fall back to existing `title - category` parsing.

**WriteMode.tsx changes:**
- Remove phase 2 (priority selection) entirely
- Replace `handleSubmit` to:
  1. Parse input for flags
  2. Extract title (everything before first flag)
  3. Apply flag values, fall back to defaults for anything not specified
  4. Create task immediately
  5. Reset input

**Visual feedback on parse:**
- As the user types, show a subtle parsed preview below the input:
  ```
  > clean dishes -p high -c housework
    Title: clean dishes | Priority: high | Category: housework
  ```
- This provides immediate feedback that flags are being recognized (ADHD: immediate feedback is critical)
- Preview uses dim/secondary color — not distracting, but confirmatory

**Footer hint update:**
```
esc:back  S:scope              enter:add  :subtask  -p -c -s flags
```

---

## 3. Metrics Mode — Lead with Accomplishment

### Why (ADHD lens)

The current metrics display shows `Completed: 3 | In Progress: 1 | Todo: 1`. This is a gap display — the eye immediately computes "2 not done" and the shame response activates. ADHD brains respond to what they see first. Leading with accomplishment creates a positive frame. The denominator (total) should be hidden or de-emphasized.

Rejection Sensitive Dysphoria (RSD) means even neutral information about underperformance can trigger a disproportionate emotional response. The metrics screen should feel like a win, not a report card.

### Current behavior

`MetricsMode.tsx` layout (top to bottom):
1. Focus progress bar with percentage: `Focus progress  3/5 ▰▰▰▱▱ 60%`
2. Stats line: `Completed: 3  |  In Progress: 1  |  Todo: 1`
3. Attribution: `You: 2  |  Claude: 1`
4. Focused tasks list with status icons
5. Insight (cyan)
6. Encouraging message (yellow)

### Proposed behavior

Restructure the layout to lead with the win:

```
╔══════════════════════════════════════════════════╗
║  TASK MAN                           METRICS      ║
╚══════════════════════════════════════════════════╝

  Done today: 3                        ▰▰▰▱▱
  You: 2  Claude: 1

  --- Today's Progress ---
  [x] Fix auth token refresh           [you]
  [x] Write integration test           [claude]
  [x] Do dishes                        [you]
  [~] Update API docs for v2           [you]
  [ ] Review PR #847

  >>> You completed 2 more tasks than yesterday!
  You showed up. That's the hardest part.

╔══════════════════════════════════════════════════╗
║  f:focus  p:plan  w:write             e:end-day  ║
╚══════════════════════════════════════════════════╝
```

**Key changes:**
1. **"Done today: 3" is the hero number.** Large, prominent, first thing visible. No denominator — not "3 of 5", just "3".
2. **Progress bar stays** but without the fraction or percentage label. The visual fill communicates progress without putting a number on the gap.
3. **Attribution line moves up** — seeing "You: 2, Claude: 1" immediately after the count reinforces that work was done collaboratively.
4. **Stats line removed.** "In Progress: 1 | Todo: 1" is gap information. The user can see in-progress and todo items in the task list below — they don't need a count that highlights what's left.
5. **Task list section renamed** from "Focused Tasks" to "Today's Progress" — framing as progress, not obligation.
6. **Task list order changed:** Done tasks first (celebrating what's accomplished), then in-progress, then todo. Currently they're mixed by priority.
7. **Encouraging message and insight remain** at the bottom.

---

## 4. Shame-Free Low-Progress Messages

### Why (ADHD lens)

Even well-intentioned "supportive" messages can be perceived as patronizing or shame-triggering through the lens of RSD. "Hang in there" implies struggling. "The hardest part is starting" implies you haven't started. "Every task done is a win" implies you've only done one. The low-progress pool needs to be completely progress-neutral — no implicit acknowledgment of underperformance.

### Current behavior

`messages.ts` — `MID_DAY_LOW` pool (15 messages) selected when progress < 50%. Messages like:
- "Hang in there. Every task done is a win."
- "The hardest part is starting. You already did that."
- "Brick by brick. You're building something."
- "One task at a time. You're getting there."

### Proposed behavior

**Rewrite the entire `MID_DAY_LOW` pool.** New guidelines:
- **Never reference count, progress, or output.** No "every task done" or "one at a time."
- **Never imply the user is struggling.** No "hang in there" or "keep going."
- **Focus on presence, process, and identity.** The messages should feel like a friend sitting next to you, not a coach evaluating your performance.
- **No comparisons** — not to yesterday, not to goals, not to expectations.

**Proposed new pool (15 messages):**

```typescript
const MID_DAY_LOW = [
  "You showed up. That's the hardest part.",
  "Some days are for thinking, not finishing.",
  "Progress isn't always visible. Trust the process.",
  "You're here. That counts.",
  "Not every hour needs to be productive.",
  "Rest is part of the work.",
  "The day isn't over yet.",
  "Small moves. Big picture.",
  "Just being in the arena matters.",
  "Your pace is your pace.",
  "Today is today. That's enough.",
  "Still here, still going. That's the whole game.",
  "You don't have to earn the right to rest.",
  "Showing up is a skill. You have it.",
  "What you did today mattered, even if it doesn't feel like it.",
];
```

**Tone shift:** From "supportive coach encouraging someone who's behind" to "calm presence that accepts where you are without judgment."

**The high-progress pool (`MID_DAY_HIGH`) is fine as-is.** Celebrating momentum when it exists is healthy. The problem is only with how low-progress states are narrated.

---

## 5. Insights Engine — No Negative Comparisons

### Why (ADHD lens)

Downward comparisons activate shame, not motivation. "You completed fewer tasks than yesterday" is information the ADHD brain converts to "you're failing" via RSD. The insight that was supposed to motivate instead makes the user close the app.

### Current behavior

`insights.ts` — The `vs_yesterday` insight already only fires when `todayCount > yesterdayCount`. This is good. But we should formalize this as a design principle and audit all 8 insight types.

### Current audit

| Insight | Can it be negative? | Status |
|---------|---------------------|--------|
| `personal_best` | No — only fires on new records | Safe |
| `streak` | No — only fires on ≥3 day streaks | Safe |
| `vs_yesterday` | No — only fires when today > yesterday | Safe |
| `focus_ratio` | No — only fires when all completed were focused | Safe |
| `scope_balance` | **Maybe** — "don't forget personal tasks!" could feel like criticism | **Review** |
| `ai_collab` | No — purely informational | Safe |
| `velocity_trend` | No — only fires when pace is up ≥10% | Safe |
| `productivity_tip` | **Yes** — "You started 5 tasks but only completed 1 — try finishing before starting new ones" is directly critical | **Fix** |

### Proposed changes

**`scope_balance`** — Reframe the all-professional message:
- Current: `"Today was all professional — don't forget personal tasks!"`
- Proposed: `"Deep professional focus today."` — neutral observation, no instruction.

**`productivity_tip`** — Remove or reframe entirely:
- Current: Fires when started ≥5 and completed ≤1. Message tells user to finish before starting.
- **Option A (remove):** Delete this insight type. It's the only one that's explicitly critical. The 7 remaining types provide enough variety.
- **Option B (reframe):** Change to a neutral observation: `"Lots of new tasks entered the system today — busy day."` — acknowledges activity without judging the completion ratio.
- **Recommended: Option A.** A productivity tip that fires on bad days kicks the user when they're down. Remove it.

**Formalize the design principle** as a code comment at the top of `insights.ts`:
```typescript
// DESIGN PRINCIPLE: Insights are celebrations, never criticisms.
// Only surface an insight when it reflects positive or neutral activity.
// If today is worse than yesterday, show a different insight type — never highlight the decline.
// The user's relationship with this tool must never feel evaluative.
```

---

## 6. End-of-Day Report — "Tomorrow's Focus" Section

### Why (ADHD lens)

Object permanence: tasks and plans that are not visible cease to exist. The ADHD brain forgets overnight what it decided to do next. Tomorrow morning, the user opens the tool (if they remember it exists) with no context and has to reconstruct their plan from scratch — an executive-function-heavy task that ADHD brains often can't do first thing in the morning.

The end-of-day report is the last thing the user sees. Embedding tomorrow's plan in it creates a bridge between today and tomorrow. When they check their email in the morning, the plan is right there.

### Current behavior

`report.ts` / `render-terminal.ts` / `render-html.ts` — Report sections:
1. Completed today
2. In progress (updated today)
3. Started today
4. Stats
5. Insight (optional)
6. Encouraging message

### Proposed behavior

Add a new section between Stats and Insight:

```
  --- Tomorrow's Focus ---
  ● Update API docs for v2          2/5 ▰▰▱
  ● Refactor logger module          0/3 ▱▱▱
  ○ Review PR #847
```

**Logic:**
- Show all tasks where `focused === true` AND `status !== 'done'`
- Sorted by: in_progress first, then by priority (urgent → high → medium → low)
- Show subtask progress for tasks with subtasks
- Priority dot color-coded as in focus mode

**Edge cases:**
- If no focused tasks remain (all done!): Show `"No tasks focused for tomorrow. Nice clean slate."` — this is a celebration, not a gap.
- If focused tasks > 5: Show top 5 + `"+ N more focused"` to avoid overwhelm even in the report.

**Report data change** (`report.ts`):
- Add `tomorrowFocus: Task[]` to the `EndOfDayReport` interface
- Populated by querying `store.query({ focused: true, status: ['todo', 'in_progress'] })`

**Terminal render** (`render-terminal.ts`):
- New section with `--- Tomorrow's Focus ---` header
- Same task row format as the "In Progress" section (priority dot + title + progress)

**HTML render** (`render-html.ts`):
- New section in the email template matching the existing section styling
- Slightly different background tint (subtle distinction from "today" sections)

**Morning use case:** User opens email, sees "Tomorrow's Focus" section, knows exactly what to start with. No decision-making required. The tool did the executive function work last night.

---

## 7. AI-Assisted Task Prioritization

### Why (ADHD lens)

Prioritization requires comparing tasks against abstract criteria (importance, deadlines, consequences) and ordering them — a high-level executive function that depends on the PFC weighing future outcomes against present impulses. This is exactly what's impaired in ADHD. The interest-based nervous system can't distinguish "important" from "interesting," so everything feels equally (un)important.

AI can serve as an external executive function: it can assess, compare, and rank tasks based on signals the user provides but can't synthesize themselves.

### What this is

A new MCP tool and CLI command that asks AI to review the current task list and suggest priority adjustments. The AI sees the full context (titles, descriptions, categories, current priorities, scope, creation dates, status) and proposes changes.

### How it works

**MCP tool: `task_prioritize`**

```typescript
// Input
{
  scope?: 'personal' | 'professional' | 'all',  // filter scope
  context?: string,  // optional user context: "I have a demo on Friday"
}

// Output
{
  suggestions: [
    {
      taskId: string,
      currentPriority: Priority,
      suggestedPriority: Priority,
      reason: string,  // brief explanation
    }
  ],
  summary: string,  // "I'd bump 'Fix auth bug' to urgent — it blocks the demo"
}
```

**CLI command: `task-man prioritize`**

```bash
# AI reviews all tasks and suggests priority changes
task-man prioritize

# With context
task-man prioritize --context "demo on Friday, need auth working"

# Auto-apply suggestions (no confirmation)
task-man prioritize --apply

# Scope filter
task-man prioritize --scope professional
```

**Output:**
```
Reviewing 12 tasks...

Suggested changes:
  ▲ Fix auth token refresh      medium → urgent    blocks Friday demo
  ▲ Write integration test      low → high         required for auth PR
  ▼ Refactor logger module      high → medium      no deadline, low risk
  = Update API docs             medium              keep — steady priority

Apply these changes? (y/n/pick)
```

- `y` applies all suggestions
- `n` cancels
- `pick` enters interactive mode where user confirms each one individually

**Interactive mode (plan mode integration):**

In plan mode, a new keybinding `a` (for "AI assist") triggers prioritization inline:
```
  AI SUGGESTIONS
    ▲ Fix auth token refresh    medium → urgent    "blocks demo"
    ▲ Write integration test    low → high         "required for auth"

  spc:apply  s:skip  a:apply-all  esc:dismiss
```
- Navigate with `j`/`k`, spacebar to accept individual suggestions, `a` to accept all.

### Design considerations

- **AI sees task metadata only** — titles, descriptions, priorities, statuses, categories, scope, dates. No code, no files, no external context unless the user provides it via `--context`.
- **Suggestions, never auto-apply by default.** The user must confirm. ADHD users need to feel in control — automated changes they didn't approve would erode trust.
- **Reasons are mandatory.** Every suggestion includes a one-line reason. This helps the ADHD brain evaluate the suggestion without having to reconstruct the reasoning themselves. It also builds trust in the AI's judgment over time.
- **No shame framing.** The AI never says "you set this wrong" — it says "given the demo deadline, this might be urgent." The framing is always situational, never evaluative.
- **Frequency guardrail.** Don't allow running prioritization more than a few times per day — over-prioritizing is itself an ADHD procrastination pattern (reorganizing instead of doing).

### Future extensions

- **AI suggests which tasks to focus:** Beyond priority, the AI could suggest which backlog tasks to pull into focus based on energy level, deadlines, and task dependencies.
- **AI detects stale tasks:** Tasks that have been `todo` for 2+ weeks with no activity — AI could suggest archiving or reprioritizing.
- **AI suggests task breakdown:** For vague, large tasks (high wall of awful), AI could suggest subtask decomposition.

---

## Summary of All Changes

| # | Feature | Files Affected | Status |
|---|---------|----------------|--------|
| 1 | Focus guardrails | `types.ts`, `constants.ts`, `PlanMode.tsx` | **DONE** (2026-03-26) |
| 2a | Write mode: skip priority | `WriteMode.tsx` | **DONE** (2026-03-26) |
| 2b | Write mode: flag parsing | `WriteMode.tsx` (inline parser) | **DONE** (2026-03-26) |
| 3 | Metrics: lead with accomplishment | `MetricsMode.tsx` | **DONE** (2026-03-26) |
| 4 | Shame-free low-progress messages | `messages.ts` | **DONE** (2026-03-26) |
| 5 | No negative insights | `insights.ts`, `types.ts` | **DONE** (2026-03-26) |
| 6 | Tomorrow's focus in report | `report.ts`, `render-terminal.ts`, `render-html.ts`, `types.ts` | **DONE** (2026-03-26) |
| 7 | AI prioritization | New MCP tool, new CLI command, `PlanMode.tsx` | Not started |

### Implementation notes (2026-03-26)

Items 1-6 were implemented in a single session. Key decisions made during implementation:

- **Focus guardrails**: Config key is `focus.maxFocused` (default 3, `null` disables). Override is per-session — once the user confirms past the limit, subsequent focuses don't re-warn until next app launch.
- **Write mode flag parser**: Built as an inline `parseWriteInput()` function rather than using Commander (which is designed for process argv). Supports `-p`, `-c`, `-s`, `-d`, `-f` flags. Everything before the first flag is the title. Falls back to `title - category` parsing when no flags detected.
- **Default priority**: Changed from `high` to `medium` across write mode. CLI `add` command still defaults to `high` (separate code path, unchanged).
- **Metrics reframe**: Stats line fully removed (not just reordered). Done tasks sorted first in the task list. Progress bar kept but without the "Focus progress" label or percentage text.
- **Insights**: `productivity_tip` type removed from both the generator and the `InsightType` union type (now 7 types). `scope_balance` all-professional message changed to neutral observation.
- **Tomorrow's focus**: Added `tomorrowFocus: Task[]` to `DayReport` interface. Capped at 5 tasks in both renders. Empty state is celebratory, not gap-highlighting.
- **Tests**: 9 tests updated (3 metrics, 6 writemode), 1 new test added (flag -c category). All 73 tests pass (78 total, 5 skipped).
