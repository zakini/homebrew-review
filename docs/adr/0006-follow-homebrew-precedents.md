# 6. Follow Homebrew's precedents

Date: 2026-10-09

Status: Accepted

## Context

`brew review` is a Homebrew external command, so users will expect it to behave like `brew`'s own commands.

## Decision

- **Behave like a core `brew` command wherever a precedent exists:** flag names and aliases, how package names resolve, `Error:`/`Warning:` messages, exit codes and `--help`.
- **Where `brew` already does something** (resolving names, checking what's installed, uninstalling), call `brew` and pass its output through rather than reimplementing it, so behaviour and messages match automatically.
- **Exception for now: output style.** The CLI keeps Clack's boxed `intro`/`outro` style. It may be aligned with `brew`'s plain `==>` headings and `Warning:`/`Error:` lines later.
- **Work within `brew`'s environment filtering.** `bin/brew` runs commands with a filtered environment (`env -i`, keeping `HOME`, `PATH`, proxy variables and a few others, plus every `HOMEBREW_*` variable). Some user variables are passed on only with a `HOMEBREW_` prefix, including `XDG_CONFIG_HOME` and `ZDOTDIR`, which arrive as `HOMEBREW_XDG_CONFIG_HOME` and `HOMEBREW_ZDOTDIR`. Read the `HOMEBREW_` name first, falling back to the plain name when run outside `brew`, then the default.

## Consequences

- Any other environment variable, such as `ANTHROPIC_API_KEY` or `NODE_USE_ENV_PROXY`, never reaches `brew review` from the user's shell. This shapes key handling ([ADR 8](0008-api-key-handling.md)) and the formula's wrapper ([ADR 3](0003-distribute-as-source-built-formula.md)).
