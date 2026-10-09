# 2. TypeScript on Node with the Vercel AI SDK

Date: 2026-10-09

Status: Accepted

## Context

The user's first attempt was a bash script calling `claude -p` and filtering its output with `jq` (see [`PLAN.md`](../../PLAN.md#original-script)). The bash and `jq` handling got awkward, which is part of why it's being rebuilt.

## Decision

- Write the tool in **TypeScript on Node**. No Ruby beyond the formula file.
- Use the **Vercel AI SDK**, which is provider-agnostic, for all AI calls. Don't use the Claude Agent SDK or other Claude-specific SDKs.
- Only Anthropic is supported for now (see [ADR 8](0008-api-key-handling.md)), but the SDK keeps other providers open.

## Consequences

- Supporting other providers later needs CLI and key handling changes, not a rewrite of the AI code.
- Anything the Claude Agent SDK would have provided, such as tools, has to be written as AI SDK features. For now the model gets no tools at all (see [ADR 10](0010-file-references-as-counts.md)).
