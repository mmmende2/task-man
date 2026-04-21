# Refine Mode — Rapid-Fire Question Component

A deliberately-chosen interactive mode that fires inline questions to drive prioritization, categorization, spelling correction, and AI task review. Phase 1 is a standalone mode for isolated testing. Future phases embed it as a lightweight overlay on Focus, Plan, and Write modes.

See also: [adhd-feature-specs.md](adhd-feature-specs.md)

---

## The Core Idea

Refine mode is a focused interrupt: a visually loud, keyboard-driven Q&A loop that processes one task at a time through a sequence of short, opinionated questions. Each question has a narrow answer set — no typing unless absolutely necessary. The entire interaction is designed to be done in seconds per task, not minutes.

The experience should feel like a card flip machine: rapid, satisfying, decisive.

---

## Phase 1 — Standalone Mode

Accessed via a new app mode key `r` (for **r**efine). Appears as a new `AppMode` value: `'refine'`. Added to `InteractiveApp.tsx` alongside the existing four modes.

```
f:focus  t:triage  w:write  m:metrics  r:refine
```

The mode shows one task at a time. After answering all questions (or skipping), it advances to the next task. The user can quit at any time with `q` or `esc`.

---

## Visual Design

The component must **demand attention**. In a terminal full of text, it needs to feel like something different is happening. Three design principles:

1. **High-contrast box** — double border, vivid color (cyan or magenta, matching the app's accent palette)
2. **Pulsing indicator** — an animated `●` or `▶` character next to the current question, cycling brightness (reuse the `PULSE_COLORS` pattern from `PulsingProgressBar.tsx`)
3. **Prominent task context** — the task being refined is shown at the top in full, full-width, bold

Layout sketch (terminal-width box):

```
╔══════════════════════════════════════════════════════════╗
║  REFINE  [3 remaining]                                   ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Update the API docs for v2 authentication flow          ║
║  created_by: claude  |  priority: medium  |  no scope    ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  ▶ Should this be focused for tomorrow?                  ║
║                                                          ║
║    [y] Yes  ·  [n] No  ·  [s] Skip  ·  [esc] Quit       ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

The `▶` pulses through colors: `#00ffff → #00cccc → #009999 → #00cccc` at ~350ms intervals.

After answering, the question area briefly flashes confirmation (`✓ focused`) before sliding to the next question or task.

---

## Question Types

Questions are composed from a small set of **answer types**. Each type has a fixed key binding scheme.

### Type A — Yes / No

```
▶ Is this task complete?
  [y] Yes  ·  [n] No  ·  [s] Skip
```

Keys: `y` / `n` / `s` (skip) / `esc` (quit mode)

### Type B — Pick from list (vim-style navigation)

```
▶ What priority should this be?
  → urgent
    high
    medium
    low
  [j/k] navigate  [enter/→] select  [s] skip
```

Selection moves with `j`/`k` (or `↑`/`↓`). Confirm with `enter` or `→`. The selected item shows `→` cursor and is highlighted in the accent color.

### Type C — Number selection

```
▶ Which scope?
  [1] personal
  [2] professional
  [3] skip
```

Keys: `1`/`2`/`3` etc. Number mapping makes it single-keypress, no navigation required.

### Type D — Text correction

```
▶ Suggested spelling correction:
  "Udpate the API docs for v2 authentication flow"
      ↓
  "Update the API docs for v2 authentication flow"

  [y] Accept  ·  [n] Keep original  ·  [e] Edit manually
```

`e` drops into a single-line edit (reuse `InlineEdit.tsx` pattern, or same `vimMode: 'insert'` approach). `esc` from edit cancels without applying.

### Type E — Confirm / dismiss (for AI-generated tasks)

```
▶ This task was created by Claude. Keep it?
  [y] Keep  ·  [d] Delete  ·  [e] Edit title  ·  [s] Skip
```

---

## Question Queue — What Gets Asked

Refine mode builds a queue of tasks to review, then asks at most **3 questions per task** in Phase 1 (configurable later). Questions are skipped if they're not applicable or already answered.

### Question selection logic (priority order)

1. **Spelling/title correction** — if a quick heuristic (common transpositions, all-caps, trailing spaces) or future AI pass flags the title. Type D.

2. **Missing scope** — if `scope` is null/undefined. Type C (`1` personal / `2` professional / `3` skip).

3. **Priority review** — if task was created by Claude (`created_by: 'claude'`) or has been `todo` for more than 7 days without a priority above medium. Type B.

4. **Focus nomination** — if task is not focused and today's focused count < `config.focus.maxFocused`. Type A.

5. **AI task review** — if `created_by === 'claude'` and task has no description. Type E (keep / delete / edit).

6. **Category assignment** — if `categories` is empty. Type C with up to 5 numbered options drawn from the user's existing category set + `[s] skip`.

The engine picks the first 3 applicable questions from this ordered list per task. If a task has no applicable questions, it is skipped silently.

### Task queue — what to refine

In Phase 1 (standalone mode), the queue contains:
- All `status: 'todo'` tasks with no `scope` set, **or**
- All tasks `created_by: 'claude'`, **or**
- All tasks that have been `todo` for > 7 days

Sorted by: most urgent first (urgent → high → medium → low), then oldest first.

**Cap at 20 tasks** per session to prevent the session from becoming overwhelming. Show `[3 remaining]` in the header (counting tasks, not questions).

If the queue is empty when refine mode is entered, show a celebratory empty state:

```
╔══════════════════════════════════════════════════════════╗
║  REFINE                                                  ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Nothing needs refine. Clean slate.                      ║
║                                                          ║
║  [esc] or [q] to exit                                    ║
╚══════════════════════════════════════════════════════════╝
```

---

## Progress & Momentum

- **Header counter** updates live: `[3 remaining]` → `[2 remaining]` after each task is fully refined.
- **Between tasks**: a brief `→ next` flash (150ms) before the next task card appears. No long animations — fast transitions reinforce the rapid-fire feeling.
- **After all tasks complete**: show a completion flash:
  ```
  REFINE COMPLETE  ✓ 7 tasks reviewed
  ```
  Then auto-return to the previous mode after 1.5s, or immediately on any keypress.

---

## Key Bindings Summary

| Key | Context | Action |
|-----|---------|--------|
| `y` | Yes/No, confirm | Affirmative answer |
| `n` | Yes/No | Negative answer |
| `t` | Yes/No (alternate) | True (alias for `y`) |
| `f` | Yes/No (alternate) | False (alias for `n`) |
| `1`–`9` | Number selection | Select item at position |
| `j` / `↓` | List navigation | Move cursor down |
| `k` / `↑` | List navigation | Move cursor up |
| `enter` / `→` | List navigation | Confirm selected item |
| `e` | Any question | Edit mode (drop into InlineEdit) |
| `s` | Any question | Skip this question |
| `S` | Any question | Skip this entire task |
| `esc` / `q` | Anywhere | Exit refine mode |
| `u` | After answer | Undo last answer (restores task state) |

The `u` undo is important — rapid-fire means fat-finger mistakes happen. Single-level undo (last action only) is sufficient for Phase 1.

---

## Implementation Plan

### New files
- `cli/src/ui/modes/RefineMode.tsx` — the full refine experience
- `cli/src/ui/modes/RefineQuestion.tsx` — renders a single question (type A/B/C/D/E)
- `cli/src/ui/hooks/usePulse.ts` — extracts the pulsing animation into a reusable hook (currently inline in `PulsingProgressBar.tsx`)

### Modified files
- `cli/src/ui/types.ts` — add `'refine'` to `AppMode`
- `cli/src/ui/InteractiveApp.tsx` — wire `r` key → `switchMode('refine')`, render `<RefineMode />`
- `cli/src/ui/shared/Header.tsx` — show `REFINE` as mode label
- `cli/src/ui/shared/Footer.tsx` — refine-mode footer hints
- `cli/src/ui/shared/PulsingProgressBar.tsx` → extract pulse logic into `usePulse.ts`

### State shape (RefineMode internal)

```typescript
interface RefineState {
  queue: Task[];                  // all tasks to review (built once on mount)
  taskIndex: number;              // current task in queue
  questionIndex: number;         // current question for this task
  questions: QuestionDef[];      // built per-task on advance
  lastAction: UndoSnapshot | null; // for 'u' undo
  phase: 'asking' | 'between' | 'complete';
}

interface QuestionDef {
  type: 'yesno' | 'list' | 'number' | 'correction' | 'confirm';
  prompt: string;
  options?: { label: string; value: string }[];
  onAnswer: (value: string) => Promise<void>;
}
```

### Footer hints (refine mode)

```
[s]kip task  [u]ndo  [q]uit              [s]kip  [y/n]  [1-9]  [jk]nav
```

---

## Creative Question Phrasings

Avoid robotic prompts. The questions should feel light and human:

**Priority:**
- "How urgent is this, really?" (not "What priority should this be?")
- "Does this block anything?" → y → promote to high

**Focus nomination:**
- "Pull this into tomorrow's focus?"
- "Add this to the short list?"

**Scope:**
- "Work thing or personal thing?"

**AI task review:**
- "Claude added this — does it belong?"
- "Keep what Claude wrote?"

**Category:**
- "File this under...?"

**Spelling correction:**
- "Quick fix — does this look right?"

---

## Future Phases (not in scope for Phase 1)

- **Phase 2** — Refine overlay on Triage mode: after pressing `a` (AI assist), 3 rapid-fire prioritization questions fire inline without leaving Triage mode
- **Phase 3** — Post-write refine: after adding a task in Write mode, if scope/category is missing, a single refine question fires before returning to the input (optional, behind config flag)
- **Phase 4** — AI spelling/title pass: send all titles to Claude in batch, flag likely errors back into the refine queue
- **Phase 5** — Smart session refine: at session start, if there are unscoped/old tasks, refine fires automatically (max 3 questions total, not 3 per task)
