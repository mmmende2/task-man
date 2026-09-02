---
"task-man": patch
---

Fix the category Tab-cycle candidate row (added in the previous release) disappearing the moment you actually start cycling, on both the capture line and the review-pane category editor.

Tab finalizes the `-c` token into plain text with a trailing space, which made the live prefix-match state go inactive right as cycling began — so the "↳ Health · House Work  [tab] cycle" row vanished after the first Tab and stayed hidden through every subsequent one, even though the cycle itself was still advancing correctly under the hood.

- **Cycling now caps at 5 candidates** (matching the number the row can show) and shows a `+N more` count when a prefix matches more; a match beyond the cap is reached by typing more of the prefix instead of by Tab.
