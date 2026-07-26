---
"task-man": patch
---

Refine stops re-asking "How urgent is this, really?" forever on old tasks. A stale todo (untouched >30 days, not high priority) was a queue-admitting `review`, so a task with every gap already filled — time, vibe, category — still entered the queue for a priority card whose only satisfying answer was `high`: answering `medium` or `low` left it stale, requeued it immediately, and refine asked the identical question every session. Two changes settle it:

- **Staleness is now measured from `updated_at`, not `created_at`.** `created_at` is immutable, so the old check had no termination condition at all. Answering the card writes a priority, which bumps `updated_at` and buys the nudge another 30 days of quiet. Skipping writes nothing, so a skipped task correctly stays stale.
- **The stale trigger is split off `priority_review` into its own `ride_along` aspect.** Staleness is a recurring condition, not a metadata gap, so it no longer admits a task to the queue on its own — it only adds a priority card to a task already queued for a real gap. Refine's queue is now strictly "tasks with metadata we don't have." The glance-once Claude review keeps its `review` kind and still queues brand-new Claude tasks; the two aspects share the `priority_review` routing key and collapse to one card when both fire.

This is the same shape as the two prior fixes in this area (v0.5.1, v0.6.0): a gate keyed on a field that never changes, so nothing could tell an already-answered task apart.
