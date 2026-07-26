---
name: changeset
description: Write a changeset for a task-man change — the frontmatter, the bump level, and the changelog prose. Every PR to this repo needs one and CI's `changeset` job fails without it, so use this whenever you finish a change, are about to commit or open a PR, are asked for a changeset or changelog entry, or CI reports a missing changeset. Also use when editing an existing `.changeset/*.md`, when unsure whether a change needs a release at all, or when a draft entry needs tightening.
---

A changeset is one file in `.changeset/` that does two jobs: it tells Changesets
how to bump the version, and its body becomes the `cli/CHANGELOG.md` entry
verbatim at release time. Nobody edits that changelog by hand — what you write
here is what ships.

Write the file directly with the Write tool. Don't run `npx changeset`: it's an
interactive prompt that will hang. (`npx changeset add --empty` is safe and
non-interactive, but it emits a random name like `giant-lights-sit.md` that you
then have to rename, so writing the file yourself is simpler.)

## The file

Path: `.changeset/<descriptive-slug>.md`. The slug names the change —
`refine-stale-todo-loop.md`, `tui-version-stamp.md`, `web-version-display.md` —
so the pending-release directory can be read at a glance.

## Frontmatter

```markdown
---
"task-man": patch
---

Entry text starts here.
```

**Always name `task-man`, never `task-man-web`** — including for web-only
changes. `cli` and `web` are a Changesets `fixed` group (`.changeset/config.json`),
so bumping either bumps both; naming only `task-man` keeps `cli/CHANGELOG.md` as
the single product changelog and leaves `web/CHANGELOG.md` as a thin
"Updated dependencies" pointer. A web-only change still writes `"task-man"`.

Bump level:

| Level | Use for |
|-------|---------|
| `minor` | New user-visible capability, or a behavior-changing refactor |
| `patch` | Bug fixes and behavior corrections — the common case |
| *(empty)* | No runtime change at all |

Empty frontmatter is two `---` lines with nothing between them:

```markdown
---
---

CI: publish.yml no longer serves the Docker `runtime` stage from the gha cache…
```

That satisfies CI's `changeset` job without cutting a release. Use it for CI,
deploy infra, docs, and repo tooling — anything that can't change what a user
experiences from the app. If a change touches infra *and* fixes user-visible
behavior, it's a `patch`, not empty.

`major` is unused pre-1.0.

## Naming the surface: `Web:` / `TUI:`

`cli/CHANGELOG.md` covers every surface — TUI, web, MCP server, HTTP server —
so a reader needs to know within the first few words whether an entry concerns
them.

Lead with `Web:` or `TUI:` when the change is **only** visible on that one
surface:

> **Web:** the nav menu and Status page now show the deployed version…

Omit the prefix when the change is shared, lives in core (store, handlers,
types), or is infrastructural — a prefix there would wrongly narrow it. If a fix
lands in shared logic but the reader should know both front ends benefit, say so
in the prose instead of prefixing: *"Fixes both the TUI and web."*

The same shape works for naming a feature area rather than a surface — `Refine:`,
`Deploy:` — when that's the more useful orientation.

## Writing the entry

The entry is read by someone scanning a release to decide whether it affects
them. Optimize for that: outcome first, mechanism only where they'd otherwise
guess wrong.

### Shape

```
<One sentence: the user-visible change. Present tense, no preamble.>

<One paragraph: the old behavior that was wrong. Behavior, not code tour.>

- **<Bold: what changed, named>.** <Only the consequence a reader can't infer.>
- **<...>**

<Optional one line: the pattern or precedent.>
```

Short entries stop after the first sentence or two. Only reach for bullets when
there are genuinely separable changes.

### Rules

1. Lead with the outcome, never with "This PR" / "We changed" / "Two changes settle it."
2. Say each fact once. If the intro states it, the bullet doesn't.
3. Keep identifiers verbatim in backticks. Cut every other noun that isn't load-bearing.
4. Explain a mechanism only where the reader would otherwise guess wrong. Don't
   justify invariants (`created_at` is immutable) — state the fix and move on.
5. Symmetric pairs collapse: "answering does X, skipping does not" beats two sentences.
6. No hedges, no "Note that", no meta-commentary about the change list itself.

### Budgets

The actual forcing function — hard limits, not aspirations:

- Entry ≤ 120 words
- Opening sentence ≤ 20 words
- Each bullet ≤ 35 words
- A first draft should lose ~60% of its words and keep every fact

### Self-check

Delete each sentence and ask: does a reader lose a decision they'd make
differently? If no, it stays deleted. Then reread the bullets for facts already
stated in the intro.

## Calibration

Before (~230 words) → after (~90), same facts:

> Refine stops re-asking "How urgent is this, really?" on old tasks.
>
> A stale todo (untouched >30 days, not high priority) could admit itself to the
> queue, so only answering `high` cleared it — `medium` or `low` requeued it next
> session.
>
> - **Staleness reads `updated_at`, not `created_at`.** Answering writes a
>   priority, bumping `updated_at`; skipping leaves it stale.
> - **The stale trigger moves off `priority_review` to a `ride_along` aspect.** It
>   no longer queues tasks alone, only adds a card to tasks already queued for a
>   real gap. The Claude review keeps its `review` kind; both share the
>   `priority_review` key and collapse into one card.
>
> Same bug as v0.5.1 and v0.6.0: a gate on an immutable field never terminates.

For the full before/after with a line-by-line account of what got cut and why,
read `references/worked-example.md`. Worth reading when a draft is over budget
and it isn't obvious what to lose.

## Before you're done

- Frontmatter names `task-man` (or is empty), never `task-man-web`.
- Filename is a descriptive slug, not the auto-generated random one.
- Opening sentence is under 20 words and leads with the outcome.
- `Web:`/`TUI:` present if and only if the change is confined to that surface.
- Entry is under 120 words, or the extra length is carrying facts a reader acts on.
