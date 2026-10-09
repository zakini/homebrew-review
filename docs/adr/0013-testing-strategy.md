# 13. Testing strategy

Date: 2026-10-09

Status: Accepted

## Context

Everything needs testing, but tests must never call a real AI provider, and much of the tool depends on macOS and the user's real system. Work often happens in a Linux sandbox.

## Decision

- **Every task ships with its tests.**
- **Runner: Node's built-in `node:test`, run through `tsx --test`** (a `test` script). `tsx` is already a dependency, so this adds none, which matters given the supply-chain caution in [ADR 4](0004-pin-node-lts-and-harden-npm.md).
- **Mostly unit tests:** parsing `brew`, `mdls` and shell history output, the file reference search (allowlist, never-read paths, symlinks, whole-word matching, comment detection, file caps), key format checks, config file permissions, name resolution, the skip-the-AI rules, verdict counts, the no-terminal check and so on.
  - Keep code that shells out (`brew`, `mdls`) or touches the filesystem behind small injectable functions, so tests feed in recorded output instead of running real commands. `node:test`'s `mock.fn()`/`mock.method()` cover the rest. Avoid `mock.module()`, which is still experimental in Node 24.
- **Never call a real AI provider in tests.** Code that uses the AI takes the model as a parameter rather than creating it, so tests pass in one of the AI SDK's mock models (`ai/test`). As a safety net, run tests with `HOME` pointing at a temporary directory and `ANTHROPIC_API_KEY`, `XDG_CONFIG_HOME`, `HOMEBREW_XDG_CONFIG_HOME`, `ZDOTDIR` and `HOMEBREW_ZDOTDIR` unset, so nothing can find a real stored key or the developer's real dotfiles, and anything that builds a real model by mistake has no key and fails fast.
- **Split the code at the signals.** `gatherSignals(package)` returns a plain, JSON-serialisable `Signals` object, and `judge(signals, model)` turns it into a verdict. `brew review` runs one after the other in the same process.
  - Gathering needs no model, and checking it against a real system needs macOS. Judging needs a model but no Mac.
  - Signal-gathering code must never build a model or load the key.
  - Define `Signals` as a zod schema and derive the type from it, so saved signals can be validated at run time. The AI SDK uses zod for structured output, so zod should be needed anyway (confirm when adding the AI SDK).
- **A signals script for development** (e.g. `npm run signals -- <package>`) runs only `gatherSignals` and prints the JSON. It only exists when running from source. It isn't a `brew review` flag, and `brew review` never reads signals from a file.
- **Real macOS:** signal gathering is checked in a disposable macOS VM when working in the Linux sandbox (see [ADR 15](0015-macos-test-vm.md)). Signals captured there can become fixtures for `judge` tests or eval cases, after the user has checked them. That's the only way real macOS data reaches the AI side: as reviewed files in the repo.
- **A handful of in-process integration tests**, happy paths only. They call the CLI's top-level run function with a mock model, a stub `brew`, a temporary `HOME` and scripted prompt answers, and check a whole `brew review` and `brew review <package>` hang together (signals, judging, summary, uninstall calls). They run anywhere, including the Linux sandbox.
- **A true end-to-end run** (real macOS, `brew`, model and prompts) is the user's own manual testing.

## Consequences

- The code needs injectable dependencies throughout, rather than calling `brew`, the filesystem or the model directly.
- The prompt's quality is tested by the evals ([ADR 14](0014-evals-and-ci.md)), not the tests.

## Alternatives considered

- **Vitest:** nicer to use, but many more dependencies, and its main advantage (`vi.mock()` for whole modules) isn't needed with injectable functions.
- **End-to-end tests of the built CLI:** a separately spawned CLI can't be given a mock model without a backdoor in the shipped tool, and the paths it could test without one (`--help`, error exits) aren't worth it.
- **A `brew review` option to read signals from a file:** a user-facing flag with no user need; the `gatherSignals`/`judge` split gives the same separation in tests.
