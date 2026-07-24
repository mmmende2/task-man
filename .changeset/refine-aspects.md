---
"task-man": minor
---

Refactor Refine onto a single derived "aspect" model (`refine-aspects.ts`): the queue and the question cards are now derived from one ordered list instead of two parallel definitions kept in sync by hand, and both the TUI and web route each answer by a stable `reason` id instead of matching the card's prompt text. Behavior: cards ask gaps first (time → vibe → category), then the Claude scope/priority reviews, then focus; the Claude reviews are now **glance-once** — they appear only on a brand-new Claude task and never re-ask once you've engaged it. This settles the root cause of Refine re-asking scope/priority (those fields always carry a default, so there was no "answered" signal to detect). The "does it belong?" delete card is preserved.
