---
"task-man": patch
---

Refine no longer dies when an optimistic store write fails. Answering a card writes fire-and-forget — the keypress handlers can't await, and the UI advances ahead of the write on purpose — but nothing owned the resulting promise. `launchInteractive` nets transport-shaped rejections (`ApiError`, `TypeError`, unreachable/denied) and deliberately rethrows everything else, and `Task <id> not found` is a plain `Error`: delete a task from the web while its card is on screen, answer that card, and the rethrow killed the TUI session.

All three fire-and-forget writes in refine (answer, undo, delete) now go through one `settleWrite` helper that reloads on success and logs the failure to the debug log on rejection, which is exactly what that code's own comment already promised ("on failure the 2s poll re-syncs truth"). The global handler still crashes loudly on genuinely unexpected rejections everywhere else.

This was also the cause of an intermittent CI failure: the un-owned writes outlived the test that issued them and rejected against the next test's store, failing the run at random with all assertions passing. Covered by a regression test that asserts no `unhandledRejection` escapes when the store rejects — verified to fail without the fix.
