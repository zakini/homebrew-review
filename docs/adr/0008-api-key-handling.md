# 8. API key handling

Date: 2026-10-09

Status: Accepted

## Context

Users supply their own API key. The AI SDK is provider-agnostic, but supporting several providers means storing several keys and choosing between them, which isn't needed yet. `brew` filters the environment before running commands (see [ADR 6](0006-follow-homebrew-precedents.md)), so a key in `ANTHROPIC_API_KEY` never reaches `brew review`.

## Decision

- **Anthropic only for now.**
- **The only key source is a file stored by the CLI.**
  - It lives under `$XDG_CONFIG_HOME/brew-review/`, reading `HOMEBREW_XDG_CONFIG_HOME` first, then `XDG_CONFIG_HOME` when run outside `brew`, then `~/.config`.
  - Create the directory as `0700` and the file as `0600` when they're first written, rather than changing permissions afterwards, so the key is never readable by others even briefly.
  - Store the key under its provider's name, e.g. `{"anthropic": {"apiKey": "…"}}`, so adding providers later won't need existing files converting.
- **`config set-key`** only takes the key through a masked prompt, never as an argument, so it can't end up in shell history.
- **`config unset-key`** deletes the stored key. If there's no stored key, print an error and exit non-zero, as `brew uninstall` and `brew untap` do for things that aren't there.
- **Check the key's format locally**, without an API request, both when it's entered and when it's read back from storage. Accept only Anthropic Console API keys (`sk-ant-api…`; confirm the exact prefix against Anthropic's docs when implementing). Trim surrounding whitespace, and reject anything else with a message saying how to fix it.
- **Handle rejection at run time.** A format check can't tell whether the key works. When the API rejects the key (an authentication error, HTTP 401), stop the run and tell the user plainly that the stored key was rejected and how to replace it (`brew review config set-key`). Never retry it and never print the key.
- **If no key is set when `brew review` starts**, warn that none is set, run the `config set-key` prompt, then carry on. If there's no terminal to prompt in, print an error saying how to set a key and exit non-zero.
- **Always pass the stored key to the AI SDK's Anthropic provider explicitly**, after checking one exists. Given no key, the provider falls back to reading `ANTHROPIC_API_KEY` itself. Under `brew review` that variable is filtered out anyway, since the SDK runs in the same process as the CLI. But when the CLI runs outside `brew` (during development, in tests, or by running the installed script directly), the SDK would see it and quietly use a key `brew review` never would. Passing the key explicitly keeps every way of running the CLI consistent, and backs up the tests' safety net (see [ADR 13](0013-testing-strategy.md)).

## Consequences

- Users must run `config set-key` (or answer its prompt on first run); an environment variable won't work.
- Supporting other providers later needs a key for each provider, knowing which provider a key belongs to, each provider's own format check, a way to choose the active provider, and possibly a way to choose a provider's model (only if a real need appears).

## Alternatives considered

- **`ANTHROPIC_API_KEY` first, falling back to the file:** never works under `brew`, which filters the variable out.
- **`HOMEBREW_ANTHROPIC_API_KEY`:** would pass `brew`'s filter, but adds a second source for little benefit.
- **The macOS Keychain (via the `security` CLI):** against other code running as the user it protects no better than a file, since items made by `security` can be read back by anything that calls it. It's also macOS-only, so Linux would need a second path. Its real benefit is keeping the key out of backups and dotfile syncs. It could be added later without changing the CLI. Avoid native modules like `keytar` either way.
- **Accepting the key as an argument:** it would end up in shell history.
