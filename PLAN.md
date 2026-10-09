# brew-review: plan

The roadmap. Decisions and their reasoning are in [architecture decision records](docs/adr/README.md); this file links to them rather than repeating them.

## Goal

Build a Homebrew external command, `brew review`, that:

1. Reviews the user's installed Homebrew packages.
2. Picks out the ones that are candidates for removal.
3. Asks the user to confirm before removing anything. Nothing is uninstalled without explicit confirmation.

It's written in TypeScript and distributed through this tap (`zakini/homebrew-review`), so users run `brew install zakini/review/brew-review` and then `brew review`.

## Background: the earlier bash attempt

The user's first attempt was a bash script. It's **a reference, not the spec**: it doesn't fully work, and the new tool doesn't need to copy its behaviour or structure. The full script is under [Original script](#original-script) because it isn't in this repo.

Roughly, it went through each package from `brew list --installed-on-request` one at a time, asked an AI agent (`claude -p` with read-only file search over `$HOME`) whether the package was still in use, streamed the agent's output through a `jq` filter, and then asked keep/uninstall. Ideas worth taking from it:
- searching the user's files for evidence a package is used;
- showing that something is happening while it works;
- a per-package confirmation before uninstalling.

## Done: scaffold the project

The npm project, Node and npm pinning, `.npmrc` hardening, TypeScript, ESLint and a hello-world commander/Clack command, with `typecheck`, `lint`, `build` and `dev` scripts. See [ADR 4](docs/adr/0004-pin-node-lts-and-harden-npm.md) and [ADR 5](docs/adr/0005-build-and-cli-tooling.md).

## Next task: CLI and config

Replace the hello-world command with the real CLI surface and API key handling:

- The commands, flags and interactive-only check from [ADR 7](docs/adr/0007-commands-and-scope.md). Remove the hello-world `--model` and `--yes`/`-y` options.
- `config set-key` and `config unset-key`, and key storage and checks, from [ADR 8](docs/adr/0008-api-key-handling.md).
- The `test` script and tests for all of the above ([ADR 13](docs/adr/0013-testing-strategy.md)).
- The CI checks workflow ([ADR 14](docs/adr/0014-evals-and-ci.md)).

`review` can stay a stub that prints which packages it would review.

## After that: the review process

- `gatherSignals`, the skip-the-AI rules and the file reference search: [ADR 9](docs/adr/0009-gather-usage-signals-in-code.md) and [ADR 10](docs/adr/0010-file-references-as-counts.md).
- The signals script and the `Signals` zod schema: [ADR 13](docs/adr/0013-testing-strategy.md).
- `judge` with Haiku, structured output, parallel reviews, progress and retries: [ADR 11](docs/adr/0011-judge-with-haiku.md).
- The summary, picker and uninstall flow: [ADR 12](docs/adr/0012-confirm-and-uninstall-flow.md).
- The evals and the evals workflow: [ADR 14](docs/adr/0014-evals-and-ci.md).

## Later tasks

- **Create `Formula/brew-review.rb`** from the sketch in [ADR 3](docs/adr/0003-distribute-as-source-built-formula.md). There's currently no formula and no `Formula/` directory.
- **Build the macOS test VM** ([ADR 15](docs/adr/0015-macos-test-vm.md), [`docs/macos-test-vm.md`](docs/macos-test-vm.md)). Check that SSH from the sandbox to a VM works before anything else.
- **Release flow (for now):** tag `vX.Y.Z`, bump the formula's `tag:`, push.
- **Later: switch to GitHub Releases with a bundled JS file** ([ADR 3](docs/adr/0003-distribute-as-source-built-formula.md)). Build it after the tool itself works.
- **Later: tell users what's sent to Anthropic**: the gathered `Signals` for each package that reaches the AI, such as package names and descriptions, app last-opened dates, install dates, launch job labels and whether they're loaded, file paths with match counts, and shell history counts and dates. Never file content or history lines. Generate the list from the `Signals` schema where possible, so it can't drift. Possibly a short notice in `config set-key` and a note in the README.
- **Later: remember packages the user keeps.** For now, every full review re-asks about the same probably unused packages. Options include an ignore list (e.g. `brew review config ignore <package>`) or a "never ask again" choice in the picker.
- **Later: cache verdicts between runs**, keyed on the package and its gathered signals, plus the prompt and model, and reuse a verdict while those haven't changed. For now, every run calls the AI again. Cached verdicts need an age limit (e.g. 30 days), since the model judges dates such as last use and install against today, so the same signals can deserve a different verdict months later.
- **Later: support other AI providers** (see Consequences in [ADR 8](docs/adr/0008-api-key-handling.md)).
- **Later: Linux support.** `mdls`, launch agents and `/Library` are macOS-only.
- **Maybe later: handle Ctrl-C during a review**, e.g. offering the picker for packages already reviewed.
- **Maybe later: a "Why?" details view** in the removal picker ([ADR 12](docs/adr/0012-confirm-and-uninstall-flow.md)).
- **Maybe later: `--include-unsure`**, adding unsure packages to the removal picker.
- **Maybe later: a non-interactive mode**, e.g. uninstalling without confirmation ([ADR 7](docs/adr/0007-commands-and-scope.md)).

## Original script

The user's earlier attempt, copied verbatim. **It's for reference only:** it doesn't fully work, so don't treat its behaviour as requirements. It uses the `claude` CLI, but the new tool uses the Vercel AI SDK ([ADR 2](docs/adr/0002-typescript-and-vercel-ai-sdk.md)). Its `jq` filter showed streamed text, a "thinking..." marker, tool calls and tool result previews, but only so the user could see something was happening. The new tool shows a progress line instead ([ADR 11](docs/adr/0011-judge-with-haiku.md)).

```bash
#!/usr/bin/env bash

trap 'echo; exit 130' INT

function check_usage() {
    local package="$1"

    claude \
        --model haiku \
        --permission-mode dontAsk \
        --restricted \
        --print \
        --output-format stream-json \
        --include-partial-messages \
        --verbose \
        --tools "Read Grep Glob" \
        --add-dir "$HOME" \
        -- \
        "I am cleaning up my homebrew installation. I have $package installed via homebrew. Am I actively using it? If so, where is it used? If not, should I uninstall it? Search my whole system for usage, not just the current directory." \
        < /dev/null \
        | jq --unbuffered -j '
            if .type == "stream_event" then
                .event as $e
                | if $e.type == "content_block_start" and $e.content_block.type == "thinking" then
                    "\nthinking...\n"
                elif $e.type == "content_block_delta" and $e.delta.type == "text_delta" then
                    $e.delta.text
                else "" end
            elif .type == "assistant" then
                ( .message.content[]?
                  | select(.type == "tool_use")
                  | "\n" + .name + " " + (.input | tojson) + "\n" )
            elif .type == "user" then
                ( .message.content[]?
                  | select(.type == "tool_result")
                  | (if .is_error then "  [denied/error] " else "  [ok] " end)
                    + ( .content
                        | if   type == "string" then .
                          elif type == "array"  then (map(select(.type == "text") | .text) | join(" "))
                          else tojson end
                        | gsub("\n"; " ")
                        | .[0:200] )
                    + "\n" )
            elif .type == "result" then "\n"
            else "" end
        '
}

installed=$(brew list --installed-on-request)
for i in $installed; do
    brew show "$i"
    echo

    check_usage "$i"

    echo -n "Do you want to keep $i? (Y/n) "
    read -n 1 -r < /dev/tty
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        brew uninstall "$i"
    fi
    echo
done
```
