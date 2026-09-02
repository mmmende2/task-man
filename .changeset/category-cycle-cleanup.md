---
---

Internal cleanup from the category-cycle review (#64): dedupe the Tab-cycle candidate row into a shared `CategoryCandidateRow`/`DidYouMeanRow` component (was implemented separately in `CapturePane`, `EntryList`, and `PlanMode`), extract the repeated candidate-fallback logic into `candidatesFor`, drop the now-unread `topMatch` field, and memoize the two per-keystroke `effective*` category-match derivations in `WriteMode`. No behavior change.
