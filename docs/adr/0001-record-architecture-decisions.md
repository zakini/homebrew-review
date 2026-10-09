# 1. Record architecture decisions

Date: 2026-10-09

Status: Accepted

## Context

The plan for `brew review` grew to hold every decision, its reasoning and notes on which earlier decisions it reversed, alongside the roadmap. It became too long to read or keep consistent.

## Decision

Record each significant decision as an architecture decision record (ADR) in `docs/adr/`, as described in [Martin Fowler's bliki](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html).

- One decision per file, named `NNNN-short-title.md` and numbered in order.
- Each has a date, a status (Proposed, Accepted, Superseded by ADR N), then Context, Decision, Consequences and, where useful, Alternatives considered.
- Once accepted, an ADR isn't rewritten. A changed decision gets a new ADR that supersedes the old one, and the old one's status is updated to point to it. Fixing typos, broken links or factual errors that don't change the decision is fine.
- `docs/adr/README.md` lists every ADR and its status.
- [`PLAN.md`](../../PLAN.md) is the roadmap: the goal and background, what's done, the next task and later tasks, plus the original script for reference. It links to ADRs rather than repeating them.

The first ADRs (2 to 15) were written together from the earlier plan. Decisions that changed while planning, before any code depended on them, are recorded only in their final form, with the rejected options under Alternatives considered. Git history has the rest.

## Consequences

- Each decision can be read and reviewed on its own.
- Superseded ADRs stay, so the reasoning behind past choices isn't lost.
- Agents add or supersede ADRs in the same commit as the change they describe (see `AGENTS.md`).
