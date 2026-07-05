# Controls audit — key consistency across TUI modes

Audited 2026-07-03 alongside the scope-surfacing work; remediations applied
2026-07-04. Sources: `useVimKeys.ts` (Focus/Plan), `WriteMode.tsx` (own
handler), `RefineMode.tsx` (own handler), `MetricsMode.tsx` (own handler),
`InteractiveApp.tsx` (globals).

## The key map (after remediation)

| Key | Global | Focus | Plan | Write capture | Write review | Metrics | Refine |
|-----|--------|-------|------|---------------|--------------|---------|--------|
| `f` `t` `w` `m` `r` | switch mode | — | — | (typed as text) | `w`→capture | switch | — |
| `~` | cycle scope filter | ✓ | ✓ | ✓ | ✓ | no visible effect ⚠ | — |
| `q` | quit app | ✓ | ✓ | (text) | (unbound) | ✓ | exit mode ⚠ |
| `j`/`k`, `gg`/`G` | — | nav | nav | — | nav | — | nav (list Qs) |
| `x` | — | done | done | — | (unbound) | — | — |
| `S` | — | scope | scope | — | scope | — | (unbound) |
| `dd` | — | cut (hold) | cut (hold) | — | cut (hold) | — | — |
| `p`/`P` | — | paste ↓/↑ (holding) | paste ↓/↑ (holding) | — | paste ↓/↑ (holding); `P` = cycle priority (normal) | — | — |
| `n`/`N` | — | — | — | — | — | — | skip question / skip task |
| `i`/`A` | — | edit title | edit title | — | `i` = to capture / edit subtask ⚠ | — | — |
| `cc` | — | — | — | — | clear-title edit | — | — |
| `c` (timeout) | — | — | — | — | edit category | — | — |
| `o`/`O` | — | create | create | — | — | — | — |
| `D` | — | edit completion date | (emitted, ignored) | — | — | go to date | — |
| `e` | — | edit description | edit description | — | — | (unbound) | edit title (card) |
| `Space` | — | (unbound) | toggle focused | — | toggle focused | — | — |
| `Tab` | — | subtask nav | (accepted) | accept category ghost | subtask nav | — | — |
| `u` | — | undo | undo | — | undo | — | undo answer |
| `/` | — | search | search | — | — | — | — |
| `T` | — | — | — | — | cycle time filter | — | — |
| `h`/`l` | — | — | pane switch | — | — | — | — |
| `s` | — | (unbound) | (unbound) | — | (unbound) | — | — |

## Remediated 2026-07-04 (per Mario)

- **`S` = Scope** in Focus, Plan, and Write review (was lowercase `s` in
  review only; `s` is now unbound everywhere — reserved).
- **Refine skip is `n`/`N`** (question/task) — vim-style "next". `n` also
  reads as "no" on the yes/no and confirm cards, which is the same outcome.
  This frees `S` from its skip-task collision.
- **Metrics' `e` (print report + exit) removed** — reports/email live in MCP
  `task_end_day`; Metrics is on-screen only. `e` now means one thing:
  edit description (plus Refine's in-card title edit).
- **Write review `dd` is cut-and-confirm** like Focus/Plan: `dd` holds,
  `p`/`P` pastes below/above (subtask nav re-parents), Esc confirms the
  delete. One undo entry per resolved operation.
- **`p` means paste everywhere; priority cycling moved to `P`** (Write
  review normal mode).

## Remaining (accepted for now)

1. **`q` in Refine exits the mode, not the app** (footer says `q:quit`).
   Defensible mid-card-flip; cosmetic.

(Resolved 2026-07-04: **Metrics is scope-aware everywhere** — `~` in TUI
Metrics rebuilds the report scoped, and the web page has the scope chip,
both through `buildDayReport(..., { scope })` / `/api/metrics?scope=…`.
Scope filtering uses parent-scope semantics (`filterByScope` in
task-filters.ts): a subtask counts under its parent's scope, since the
subtask's own field can lag behind a parent `S`-toggle. Scoped reports
carry no insight line — the insight is a whole-day artifact with persisted
dedupe state.)

(Resolved 2026-07-04: focused-toggle unified on `Space` — Plan and Write
review both use it; Write review's `f` binding is gone, so `f` means exactly
one thing everywhere: go to Focus mode. Mario's original ask — `f` to toggle
focus in Plan — was declined to keep that guarantee.)

(Resolved 2026-07-05: **unfocusing has a home** — Plan (triage) pins a
`★ focused (N)` group at the top so focused tasks can be rounded up and
`Space`-unfocused in one place, mirroring the web Backlog. Unfocusing drops
the task into its category below with the id-anchored cursor following.
Footer now reads `spc:focus/unfocus`. See docs/tui-focused-group-plan.md.)

## CLI retirement — done 2026-07-04

`add`, `list`, `done`, `start`, `focus`/`unfocus`, `session-refocus`, and
`end-day` are removed (humans → TUI/web; Claude → MCP, whose `task_end_day`
covers reports + email). Remaining commands are operational: the interactive
TUI, `watch`, `serve`, `login`, `config`.
