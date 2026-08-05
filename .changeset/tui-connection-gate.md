---
"task-man": minor
---

**TUI:** remote mode now says when you need to log in instead of showing an empty task list.

A failed load was swallowed, leaving the list empty — indistinguishable from having no tasks.

- **A connection screen replaces the task list until a load succeeds**, naming the failure and the command that fixes it. Afterwards a banner takes over, so a deploy blip no longer blanks the list.
- **`client.mode: "remote"` without a `remote_url` now errors** instead of quietly reading the local store.
- **`i` opens an edit at the start of the line, `A` at the end** — Focus, Plan, and Write. Write's `cc` is gone; `A` edits a title there, and `c` no longer waits 300ms to open the category editor.
- **Category completions keep the stored casing**: typing `house` against `House Work` no longer saved `house Work`.
