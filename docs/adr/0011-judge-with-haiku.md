# 11. Judge packages with Claude Haiku 4.5

Date: 2026-10-09

Status: Accepted

## Context

Packages without a clear answer from their signals (see [ADR 9](0009-gather-usage-signals-in-code.md)) need judging. A full review can mean 100+ model calls.

## Decision

- **Model: Claude Haiku 4.5** (`claude-haiku-4-5-20251001`), fixed in code. Cost and speed matter more than peak judgement. Pin the dated ID so behaviour doesn't change underneath us. Switch to a more capable model if Haiku's verdicts prove unreliable.
- **`judge(signals, model)`** sends the gathered signals and returns:
  - a verdict: **in use**, **probably unused** or **unsure**;
  - a **one-line summary** of why, short enough to fit beside a package name in a terminal;
  - **full reasons** citing the evidence it was given.
- **Use the AI SDK's structured output** with a schema for those fields, rather than parsing free text. Check how the Anthropic provider produces it for Haiku 4.5 (native structured outputs or a forced tool call) when implementing.
- **The prompt isn't fixed here.** It should be whatever best serves the goal, developed and checked against the evals (see [ADR 14](0014-evals-and-ci.md)).
- **Review a few packages at once** (a small fixed number, e.g. 4), since 100+ packages one after another would be slow.
- **Show progress, not model output:** a single progress line, e.g. a Clack spinner with "Reviewing 37/121: ripgrep, jq, fd, bat". The old script streamed raw output only so the user could see something was happening.
- **Recover from passing errors.** Rate limits (HTTP 429), overloaded or server errors (5xx), network failures and replies that don't match the schema are retried with backoff a few times, respecting `retry-after`.
  - A package that still fails is marked **failed**, not unsure, since nothing was judged. The review carries on, so one failure doesn't throw away a long review.
  - In a full review, if most packages are failing (e.g. the network is down), stop and say why rather than marking everything failed.
  - A rejected key is never retried (see [ADR 8](0008-api-key-handling.md)).

## Consequences

- Haiku's judgement may be weaker than larger models', which the evals should show.
- How failed packages are shown is covered in [ADR 12](0012-confirm-and-uninstall-flow.md).

## Alternatives considered

- **Streaming the model's text as progress:** unreadable with several packages in flight, and not what the user needs.
- **Counting failed packages as unsure:** hides that they weren't judged.
- **Jev (TypeSafe AI):** a model built for typed decisions with calibrated confidence. In early access, with no AI SDK provider. Could be compared against the evals once other providers are supported.
