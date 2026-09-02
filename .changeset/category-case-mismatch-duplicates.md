---
"task-man": patch
---

TUI: retagging a task's category no longer creates a case-variant duplicate when you finish typing the name yourself instead of accepting the autocomplete ghost.

Pressing Enter on a category edit saved whatever case you'd typed verbatim, so typing `house work` against the stored `House Work` created a second, near-identical category instead of reusing it. Tab-accept in Plan mode had the same bug in a different shape: it spliced the ghost suffix onto the typed prefix (`h` + `ouse Work` → `house Work`) rather than swapping in the stored name outright.

- **Enter now snaps to the stored casing** when the typed text is an exact case-insensitive match, in both Write's review pane and Plan mode's retag editor.
- **Plan mode's Tab-accept replaces the typed text with the canonical name**, matching how Write's review pane already worked.
