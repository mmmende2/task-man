---
"task-man": minor
---

Editing gets a cursor in the TUI and a form on the web, and scope stops resetting after every capture.

**TUI.** Typing was append-only everywhere: characters landed at the end and backspace ate from the end, so fixing a typo mid-title meant retyping the rest.

- **←/→, Home/End and Ctrl-A/Ctrl-E work in every field** — capture, all inline edits, search, and Refine. Forward delete stays bound to backspace: Ink reports both Delete keys identically.
- **The inline subtask row echoes the raw capture buffer.** It rendered the *parsed* title, which trims — so a space typed after `:sub` left the cursor where it was and read as a dead key.
- **Triage's category panel is windowed** — the tail used to run off the frame unreachably — and `i`/`A` renames the cursored category across every task carrying it, both scopes included.
- **`c` retags a task in Triage,** with the same prefix completion Write's review pane has. **`e` edits a description in Write's review pane,** and existing descriptions show under the title. The capture flags `-d "…"` and `-f` are now named in the help line.
- **`S` (toggle scope) is gone** from Focus, Triage and Write. Scope moves through the web edit form or capture's `-s` flag.

**Web.**

- **Press-and-hold a row — or hit Edit in the open row — to edit it** in the capture form, prefilled. The hold loses to a scroll and swallows the tap that follows it.
- **Capture keeps its scope after each capture** instead of clearing it, so it stays on whatever the app-wide filter is set to.
- **Tapping a row unclamps its title.** Chips drop below so the full text wraps instead of hiding behind an ellipsis. Also opted out of iOS Safari text autosizing, which inflated any title long enough to wrap.
