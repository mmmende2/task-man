---
"task-man": minor
---

TUI: category autocomplete now lets you cycle through every candidate instead of only ever offering the top one.

A prefix like `h` could match several categories, but Tab always accepted the most-used one — there was no way to reach the others short of typing enough characters to disambiguate.

- **Tab now cycles through the ranked candidate list**, wrapping around; Enter saves whichever one is currently showing. This works in Write's review pane, its capture-line `-c` flag, and Plan mode's retag editor.
- **Plan mode's retag editor gains the candidate list** (`↳ Health · House Work`) that Write's panes already showed, so cycling is visible there too.
