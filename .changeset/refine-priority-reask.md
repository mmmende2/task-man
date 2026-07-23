---
"task-man": patch
---

Refine stops re-asking priority (and re-queuing) a Claude-created task once it's been refined. The `from_claude` queue reason and the "How urgent is this, really?" priority card now clear once the task has both a time estimate and a vibe, instead of firing forever off `created_by === 'claude'` (which never changes, and priority always has a value, so nothing could tell an already-reviewed task apart). One shared `needsClaudeRefine` predicate keeps the queue and the cards in sync. Fixes both the TUI and web.
