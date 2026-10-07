# brew-review: plan

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
- showing the agent's progress while it works;
- a per-package confirmation before uninstalling.

The bash and `jq` handling got awkward, which is part of why it's being rebuilt.

## Decisions already made

- **Language:** TypeScript on Node. No Ruby beyond the formula file.
- **AI library:** the **Vercel AI SDK**, provider-agnostic. Do **not** use the Claude Agent SDK or other Claude-specific SDKs. The filesystem tools (read file, grep, glob) have to be written as AI SDK tools. Keep them read-only and scoped to sensible paths, because they search the user's home directory.
- **Auth:** users supply their own API key. Respect the provider env vars first (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …), then fall back to a key stored by the CLI. Storage is undecided: a `0600` config file in `$XDG_CONFIG_HOME`/`~/.config/brew-review/`, and/or the macOS Keychain via the `security` CLI. Avoid native modules like `keytar`.
- **One repo:** the TS source lives in this tap repo next to `Formula/`. No separate source repo and **no npm publishing**.
- **Distribution:** a formula that builds from source at install time, pointed at this repo by git tag:
  ```ruby
  url "https://github.com/zakini/homebrew-review.git", tag: "v0.1.0"
  head "https://github.com/zakini/homebrew-review.git", branch: "main"
  depends_on "node@24"

  def install
    system "npm", "install", *std_npm_args
    (bin/"brew-review").write_env_script libexec/"bin/brew-review",
      PATH: "#{Formula["node@24"].opt_bin}:$PATH"
  end
  ```
  `node@24` is keg-only, so the `write_env_script` wrapper is needed to make the binary run on the pinned Node.
- **Future distribution (decided, not for now): a bundled JS file on GitHub Releases.** The user dislikes the install-time `npm install`. Later, a GitHub Action on each tag will bundle everything into one `brew-review.js` with esbuild, attach it to the release, and update the formula's `url`/`sha256`, either by committing directly or by opening a PR. The formula will then just download that file:
  ```ruby
  url "https://github.com/zakini/homebrew-review/releases/download/v0.1.0/brew-review.js"
  sha256 "..."
  depends_on "node@24"

  def install
    libexec.install "brew-review.js"
    (bin/"brew-review").write_env_script libexec/"brew-review.js",
      PATH: "#{Formula["node@24"].opt_bin}:$PATH"
  end
  ```
  This removes npm from the user's install and works on every platform. The release build becomes an esbuild bundle, and `tsc --noEmit` stays for type-checking. Alternatives that were considered and not chosen:
  - Homebrew bottles: `tests.yml`/`publish.yml` from `brew tap-new` are already set up for them, but they only cover the CI matrix's platforms.
  - Compiled binaries for each platform: no Node needed, but bigger downloads, a build matrix, and macOS code signing.

  Don't let current choices block this, but don't build it yet.
- **Node version: pin to the latest LTS.** That's Node 24 today. Node 26 becomes LTS on 2026-10-28. From Node 27, Node ships one major a year (April release, October LTS). Bump yearly in the formula (`depends_on` and the `Formula["node@…"]` line), `engines`, and the version files. Check `brew info node@26` exists before switching.
- **CLI libraries:** **citty** for argument parsing and subcommands, **@clack/prompts** for interactive prompts (confirm, select, masked password input for the API key).

## Next task: scaffold the project

1. **npm project** (`package.json`, `"type": "module"`, `bin: { "brew-review": "dist/cli.js" }`, `files: ["dist"]`).
2. **Pin Node 24 in a way fnm respects:**
   - `.node-version` containing `24` (fnm reads `.node-version` and `.nvmrc`).
   - `"engines": { "node": "^24" }`. fnm can also resolve from `engines.node`.
   - The user's Mac has Node v24.14.0 and fnm 1.39.0. This work may run in a Linux Docker sandbox (`sbx`) where those tools differ or are missing, and where `brew` may not be installed. Check what's available rather than assuming.
3. **Pin the package manager to npm:**
   - `"packageManager": "npm@11.14.1"` for Corepack (the user's Mac has npm 11.14.1 and Corepack 0.34.6).
   - Consider also adding npm's native `devEngines` (`runtime` + `packageManager`, `onFail: "error"`).
   - Verify before relying on these: Corepack only shims npm after `corepack enable npm`, and Corepack is no longer bundled with Node 25+, though it still is with 24. Tell the user about both caveats.
4. **Harden npm with a project `.npmrc`:**
   - `min-release-age=7` refuses package versions published less than 7 days ago (needs npm 11.10+).
   - `ignore-scripts=true` stops dependencies' install scripts running. It also stops the project's own `prepare` script running on `npm install`, so builds must call `npm run build` explicitly.
5. **TypeScript:**
   - Extend `@tsconfig/node24` and `@tsconfig/strictest` (the user called this "ts-base"; it's the tsconfig/bases project).
   - Add `@total-typescript/ts-reset` via a `src/reset.d.ts` that imports it.
   - Add `@types/node@24`.
   - **Don't use Node's built-in type stripping** for development or release. The user chose a proper build step instead.
   - **Development uses `tsx`:** `"dev": "tsx src/cli.ts"`, with `tsx watch` available while iterating. tsx doesn't type-check, so typechecking and linting stay separate scripts. Don't use ts-node; it's poorly maintained lately and awkward with ESM.
   - **Builds use `tsc`**, compiling to `dist/`, via a `build` script. Don't rely on `prepare` to build on `npm install`, because `ignore-scripts` skips it. This is fine even though development uses tsx: strictest's `isolatedModules` keeps code to what both tools compile the same way. Moving the release build to an esbuild bundle comes later, with the GitHub Releases change (see Decisions).
6. **ESLint (flat config):** combine `@eslint/js` recommended, `typescript-eslint` `recommendedTypeChecked`, and `@stylistic/eslint-plugin` `configs.recommended`. Use type information wherever a config supports it: `parserOptions.projectService` + `tsconfigRootDir: import.meta.dirname`, with `allowDefaultProject` for `eslint.config.js` if it sits outside the tsconfig. Ignore `dist/`.
7. **Hello-world command** in `src/cli.ts`:
   - A citty `defineCommand` with a few argument types: a positional, a string option, a boolean flag, and maybe a subcommand.
   - Clack prompts of a few kinds: `text`, `confirm`, `select`, and maybe `password`.
   - Handle `isCancel` and use `intro`/`outro`.
8. Add `.gitignore` (`node_modules/`, `dist/`) and the `typecheck`/`lint`/`build`/`dev` scripts.
9. Check that `npm run typecheck`, `npm run lint`, `npm run build` and the built binary all work.

## Later tasks

- **Create `Formula/brew-review.rb`.** There is currently **no formula and no `Formula/` directory**. An untracked `brew tap-new`/`brew create` stub was deleted on purpose because it was boilerplate: it called `./configure`, had an empty `license ""`, a `system "false"` test, and `deny_network_access!`, which would block `npm install`. Write it fresh using the formula sketch above, with a real `test do` block (e.g. `--help` output). Check how `std_npm_args` interacts with devDependencies when building from a local directory, and build explicitly since `ignore-scripts` skips `prepare`.
- **Build the review flow:** gather installed packages and their details, find likely removal candidates (with AI help and streamed progress), present them, and confirm before uninstalling. Design this fresh against the [Goal](#goal), using the old script only for ideas.
- **CLI design** (rough idea from discussion): `brew review` runs the loop, `brew review config set-key` and `brew review config show` manage the key, and `--model <id>` overrides the model.
- **Release flow (for now):** tag `vX.Y.Z`, bump the formula's `tag:`, push. The tap's CI (`brew test-bot`) runs on PRs.
- **Later: switch to GitHub Releases with a bundled JS file** (see "Future distribution" under Decisions). Build it after the tool itself works.

## Original script

The user's earlier attempt, copied verbatim. **It's for reference only:** it doesn't fully work, so don't treat its behaviour as requirements. It uses the `claude` CLI, but the new tool uses the Vercel AI SDK (see Decisions). The `jq` filter gives an idea of the progress output the user found useful: streamed text, a "thinking..." marker, each tool call with its input, and a one-line, 200-character preview of each tool result.

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
