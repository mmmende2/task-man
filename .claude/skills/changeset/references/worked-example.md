# Worked example: cutting a changeset entry by 60%

The real entry that shipped as part of v0.6.1, before and after, with an account
of every cut. Read this when a draft is over budget and it isn't obvious what to
lose.

## Before (~230 words)

> Refine stops re-asking "How urgent is this, really?" forever on old tasks. A stale
> todo (untouched >30 days, not high priority) was a queue-admitting `review`, so a
> task with every gap already filled — time, vibe, category — still entered the queue
> for a priority card whose only satisfying answer was `high`: answering `medium` or
> `low` left it stale, requeued it immediately, and refine asked the identical question
> every session. Two changes settle it:
>
> - **Staleness is now measured from `updated_at`, not `created_at`.** `created_at` is
>   immutable, so the old check had no termination condition at all. Answering the card
>   writes a priority, which bumps `updated_at` and buys the nudge another 30 days of
>   quiet. Skipping writes nothing, so a skipped task correctly stays stale.
> - **The stale trigger is split off `priority_review` into its own `ride_along`
>   aspect.** Staleness is a recurring condition, not a metadata gap, so it no longer
>   admits a task to the queue on its own — it only adds a priority card to a task
>   already queued for a real gap. Refine's queue is now strictly "tasks with metadata
>   we don't have." The glance-once Claude review keeps its `review` kind and still
>   queues brand-new Claude tasks; the two aspects share the `priority_review` routing
>   key and collapse to one card when both fire.
>
> This is the same shape as the two prior fixes in this area (v0.5.1, v0.6.0): a gate
> keyed on a field that never changes, so nothing could tell an already-answered task
> apart.

## After (~90 words)

> Refine stops re-asking "How urgent is this, really?" on old tasks.
>
> A stale todo (untouched >30 days, not high priority) could admit itself to the queue,
> so only answering `high` cleared it — `medium` or `low` requeued it next session.
>
> - **Staleness reads `updated_at`, not `created_at`.** Answering writes a priority,
>   bumping `updated_at`; skipping leaves it stale.
> - **The stale trigger moves off `priority_review` to a `ride_along` aspect.** It no
>   longer queues tasks alone, only adds a card to tasks already queued for a real gap.
>   The Claude review keeps its `review` kind; both share the `priority_review` key and
>   collapse into one card.
>
> Same bug as v0.5.1 and v0.6.0: a gate on an immutable field never terminates.

## What got cut, and why

- **"was a queue-admitting `review`"** — implementation detail; the behavior is what
  mattered.
- **"time, vibe, category"** — examples that restated "every gap already filled."
- **"Two changes settle it:"** — the bullets announce themselves.
- **"`created_at` is immutable, so the old check had no termination condition"** — the
  closing line already says this.
- **"Staleness is a recurring condition, not a metadata gap"** — rationale the reader
  doesn't need to act on.
- **"Refine's queue is now strictly 'tasks with metadata we don't have.'"** — restates
  the preceding sentence.

## The pattern behind the cuts

Every cut is one of three kinds:

1. **Said twice.** A fact in the intro repeated in a bullet, or a bullet's rationale
   restated in the closing line. Keep the instance closest to where a reader needs it.
2. **Rationale the reader can't act on.** Why a design is coherent isn't a decision
   anyone makes differently. State what changed; skip the defense.
3. **Examples that restate their own summary.** If the general statement is clear, the
   enumeration is filler.

Note what *survived*: every identifier (`updated_at`, `priority_review`,
`ride_along`, `review`), the threshold (>30 days), the failure mode, and the
version precedent. Brevity is a word count, not a fact count — the after entry
loses no information a reader would act on.
