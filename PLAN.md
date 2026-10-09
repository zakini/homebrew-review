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
- showing that something is happening while it works;
- a per-package confirmation before uninstalling.

The bash and `jq` handling got awkward, which is part of why it's being rebuilt.

## Decisions already made

- **Language:** TypeScript on Node. No Ruby beyond the formula file.
- **AI library:** the **Vercel AI SDK**, provider-agnostic. Do **not** use the Claude Agent SDK or other Claude-specific SDKs.
- **No search tools for the model, for now.** This reverses an earlier plan to give the model read-only filesystem tools. The code searches a fixed allowlist itself and passes the matches to the model as signals (see "References in files" under [Gather signals in code](#1-gather-signals-in-code)). Reasons:
  - Anything the model reads is sent to Anthropic, and open-ended search would eventually read a dotfile containing a token.
  - Each search step is another round trip, across 100+ packages.
  - A fixed search is deterministic and unit-testable, and keeps evals less noisy.
  - The code already knows the search terms: each formula's name and binaries, and each cask's app names, bundle IDs and binaries.
  - If evals show the model needs to search for itself, add one narrow AI SDK tool that searches the same allowlist and returns the same counts.
- **Auth:** users supply their own API key. **Anthropic only for now**, even though the AI SDK is provider-agnostic. The only source is a key stored by the CLI in a file (see [API key](#api-key)). This reverses an earlier plan to read `ANTHROPIC_API_KEY` first: `brew` filters the environment before running commands, so it never reaches `brew review`.
  - The macOS Keychain (via the `security` CLI) was considered and not chosen for now. Against other code running as the user it protects no better than a file, since items made by `security` can be read back by anything that calls it. It's also macOS-only, so Linux would need a second path. Its real benefit is keeping the key out of backups and dotfile syncs. It could be added later without changing the CLI. Avoid native modules like `keytar` either way.
- **One repo:** the TS source lives in this tap repo next to `Formula/`. No separate source repo and **no npm publishing**.
- **Distribution:** a formula that builds from source at install time, pointed at this repo by git tag:
  ```ruby
  url "https://github.com/zakini/homebrew-review.git", tag: "v0.1.0"
  head "https://github.com/zakini/homebrew-review.git", branch: "main"
  depends_on "node@24"

  def install
    system "npm", "install", *std_npm_args
    (bin/"brew-review").write_env_script libexec/"bin/brew-review",
      PATH: "#{Formula["node@24"].opt_bin}:$PATH",
      NODE_USE_ENV_PROXY: "1"
  end
  ```
  `node@24` is keg-only, so the `write_env_script` wrapper is needed to make the binary run on the pinned Node. `NODE_USE_ENV_PROXY=1` makes Node's built-in `fetch` (which the AI SDK uses) follow the `https_proxy`/`http_proxy` variables that `brew` passes through. Without it, `brew review` ignores proxies, which breaks it for users behind one. `brew` filters the variable itself out, so it has to be set in the wrapper.
- **Future distribution (decided, not for now): a bundled JS file on GitHub Releases.** The user dislikes the install-time `npm install`. Later, a GitHub Action on each tag will bundle everything into one `brew-review.js` with esbuild, attach it to the release, and update the formula's `url`/`sha256`, either by committing directly or by opening a PR. The formula will then just download that file:
  ```ruby
  url "https://github.com/zakini/homebrew-review/releases/download/v0.1.0/brew-review.js"
  sha256 "..."
  depends_on "node@24"

  def install
    libexec.install "brew-review.js"
    (bin/"brew-review").write_env_script libexec/"brew-review.js",
      PATH: "#{Formula["node@24"].opt_bin}:$PATH",
      NODE_USE_ENV_PROXY: "1"
  end
  ```
  This removes npm from the user's install and works on every platform. The release build becomes an esbuild bundle, and `tsc --noEmit` stays for type-checking. Alternatives that were considered and not chosen:
  - Homebrew bottles: `tests.yml`/`publish.yml` from `brew tap-new` are already set up for them, but they only cover the CI matrix's platforms.
  - Compiled binaries for each platform: no Node needed, but bigger downloads, a build matrix, and macOS code signing.

  Don't let current choices block this, but don't build it yet.
- **Node version: pin to the latest LTS.** That's Node 24 today. Node 26 becomes LTS on 2026-10-28. From Node 27, Node ships one major a year (April release, October LTS). Bump yearly in the formula (`depends_on` and the `Formula["node@…"]` line), `engines`, and the version files. Check `brew info node@26` exists before switching.
- **Follow Homebrew's precedents.** `brew review` should behave like a core `brew` command wherever a precedent exists: flag names and aliases, how package names resolve, `Error:`/`Warning:` messages, exit codes and `--help`. Where `brew` already does something (resolving names, checking what's installed, uninstalling), call `brew` and pass its output through rather than reimplementing it, so behaviour and messages match automatically.
  - **Exception for now: output style.** The CLI keeps @clack/prompts' boxed `intro`/`outro` style. In future, it may be aligned with `brew`'s plain `==>` headings and `Warning:`/`Error:` lines.
- **Testing: everything is tested.** Each task ships with its tests.
  - **Runner: Node's built-in `node:test`, run through `tsx --test`** (a `test` script). `tsx` is already a dependency, so this adds none, which matters given the supply-chain caution elsewhere. Vitest was considered: nicer to use, but many more dependencies, and its main advantage (`vi.mock()` for whole modules) isn't needed if the code follows the next point.
  - **Mostly unit tests:** parsing `brew`, `mdls` and shell history output, the file reference search (allowlist, never-read paths, symlinks, whole-word matching, comment detection, file caps), key format checks, config file permissions, name resolution, the skip-the-AI rules, verdict counts, the no-terminal check and so on. Keep code that shells out (`brew`, `mdls`) or touches the filesystem behind small injectable functions, so tests can feed in recorded output instead of running real commands; `node:test`'s `mock.fn()`/`mock.method()` cover the rest. Avoid `mock.module()`, which is still experimental in Node 24.
  - **Never call a real AI provider in tests.** Code that uses the AI takes the model as a parameter rather than creating it, so tests pass in one of the AI SDK's mock models (`ai/test`). As a safety net, run tests with `HOME` pointing at a temporary directory and `ANTHROPIC_API_KEY`, `XDG_CONFIG_HOME`, `HOMEBREW_XDG_CONFIG_HOME`, `ZDOTDIR` and `HOMEBREW_ZDOTDIR` unset. Then nothing can find a real stored key or the developer's real dotfiles, and anything that builds a real model by mistake has no key and fails fast.
  - **Split the code at the signals.** `gatherSignals(package)` returns a plain, JSON-serialisable `Signals` object, and `judge(signals, model)` turns it into a verdict. `brew review` runs one after the other in the same process. The split lets each half be tested on its own: gathering needs no model (and checking it against a real system needs macOS), and judging needs a model but no Mac. Signal-gathering code must never build a model or load the key.
  - **A signals script for development**, e.g. `npm run signals -- <package>`, runs only `gatherSignals` and prints the JSON. It only exists when running from source; it isn't a `brew review` flag, and `brew review` never reads signals from a file.
  - **Testing on real macOS:** when working in the Linux sandbox, signal gathering is tested in a disposable macOS VM (see [`docs/macos-test-vm.md`](docs/macos-test-vm.md)). The agent changes the VM's state (installs or removes packages, opens apps, edits dotfiles), runs the signals script and checks the output.
    - The VM has full `sudo` for the agent, so restricting commands inside it wouldn't hold. Control what's in it and what it can reach instead: **no API key or other credentials in the VM, and no route to `api.anthropic.com`.** If the agent runs `brew review` there anyway, it has no key to enter at the `set-key` prompt and no way to reach the API, and anything removed is in a throwaway clone.
    - Signals JSON captured in the VM can be saved as fixtures for `judge` unit tests or as the start of an eval case, after the user has checked it. That's the only way real macOS data reaches the AI side: as reviewed files in the repo.
  - **A handful of in-process integration tests**, happy paths only. They call the CLI's top-level run function with a mock model, a stub `brew`, a temporary `HOME` and scripted prompt answers, and check a whole `brew review` and `brew review <package>` hang together (signals, judging, summary, uninstall calls). They run anywhere, including the Linux sandbox. This replaces an earlier plan for end-to-end tests of the built CLI: a separately spawned CLI can't be given a mock model without a backdoor, and the paths it could test without one (`--help`, error exits) aren't worth it. A true end-to-end run (real macOS, `brew`, model and prompts) is the user's own manual testing.
  - **Evals for the AI prompt**, run separately from the tests because they call the real API and cost money. A set of labelled cases, each a saved `Signals` JSON file and the expected verdict, is fed to `judge` and scored against the real model. The signals can be generated by running the real signal-gathering code over a small fake home directory, or captured in the macOS test VM, then saved. The unit tests validate every saved case against the `Signals` schema, so cases fail loudly rather than going stale when the shape changes. That needs a runtime schema, since TypeScript types are erased: define `Signals` as a zod schema and derive the type from it. The AI SDK uses zod schemas for structured output, so zod should be needed anyway (confirm when adding the AI SDK, which isn't installed yet). The cases aren't specified here; the user will review them once they're added. Weight wrongly calling an in-use package "probably unused" far more heavily than other mistakes, since that's the error that leads to removing something the user needs.
- **CI: GitHub Actions on pull requests only** (`on: pull_request`), so pushes don't trigger runs. Alongside the tap's existing `brew test-bot` workflows:
  - **Checks workflow:** `npm ci`, then typecheck, lint and tests. Take the Node version from `.node-version` (`actions/setup-node`'s `node-version-file`). `.npmrc`'s `ignore-scripts` applies to `npm ci` too.
  - **Evals workflow:** required to pass before merging, but only run when the user approves it. Keep the prompt, the model ID, `judge` (including how it turns signals into the prompt), the `Signals` schema, the eval cases and the eval runner in their own files (e.g. `src/judge/**` for everything but the eval cases and runner, which go in `evals/**`) so changes to them can be detected. Changes to signal gathering don't affect the evals, which use saved signals. (This reverses an earlier plan to also run the evals when the signal-gathering code changes.)
    - **Don't use a `paths` filter.** A required check from a workflow that never runs stays "Expected — Waiting for status to be reported" and blocks every PR that doesn't touch those files.
    - **A `detect` job** runs on every PR and outputs whether those files changed (`git diff` against the base branch).
    - **An `evals` job** with `if: needs.detect.outputs.changed == 'true'` and `environment: evals`. The `evals` environment has the user as a required reviewer, so the job waits ("Review deployments") until approved, and its check stays pending until then. When nothing relevant changed, the job is skipped, and GitHub counts a skipped job as passing a required check.
    - **Make the `evals` job a required check.** Add a `concurrency` group so a new push cancels older runs still waiting for approval.
    - **Store `ANTHROPIC_API_KEY` as an `evals` environment secret**, not a repository secret, so only approved runs can read it. The eval runner builds the model from it and passes the model in, the same way tests pass mock models. It never goes through the CLI's stored-key loading.
    - Environment required reviewers need the repo to be public (they need a paid plan for private repos). Homebrew taps are public, so this is fine.
  - **Never use `pull_request_target`** for either. `pull_request` withholds secrets from fork PRs, which stops someone's PR code reading the API key. `pull_request_target` would give the key to their code.
  - Pin third-party actions to a commit SHA rather than a tag, in keeping with the supply-chain caution elsewhere.
- **The AI prompt isn't fixed by this plan.** It should be whatever best serves the [Goal](#goal), developed and checked against the evals.
- **CLI libraries:** **commander** (with **@commander-js/extra-typings** for inferred option/argument types) for argument parsing and subcommands, **@clack/prompts** for interactive prompts (confirm, select, masked password input for the API key).
  - citty was tried first and dropped: it treats the first positional as a subcommand name, so it can't support both `brew review <package>` and `brew review config …`, and it runs a parent command's `run` after its subcommand. commander dispatches to a subcommand only when the word matches one and otherwise passes it to the root action, keeps root options like `--model` working before a subcommand, and lists subcommands in root `--help`. yargs handled the same cases but has more dependencies, needs separate types, and prints full help on every error.

## Next task: CLI and config

Replace the hello-world command with the real CLI surface and API key handling. Set up the `test` script and the CI checks workflow (see Decisions) as part of this task; the evals workflow comes with the review process. The review process comes next (see [After that: the review process](#after-that-the-review-process)), so `review` can stay a stub that prints which packages it would review.

### Commands

- **`brew review`** reviews every package the user chose to install:
  - **Formulae installed on request** (`brew list --formula --installed-on-request`). Formulae installed only as dependencies are skipped.
  - **All installed casks** (`brew list --cask`). Casks can depend on other casks, and Homebrew records which were installed on request in each cask's install receipt, but no public command exposes it: `--installed-on-request` refuses `--cask`, and `brew info --json=v2` doesn't include the field for casks. Cask dependencies are rare, so review every cask rather than reading the internal receipts.
- **`brew review <package>`** reviews only that package. Accept fully qualified names (`homebrew/cask/docker`) as `brew` does. If it isn't installed, say so clearly and exit with an error.
- **`--formula`/`--formulae` and `--cask`/`--casks`**, as in core `brew` commands, and they can't be combined:
  - With no package, they limit the review to formulae or to casks.
  - With a package, they pick which one to review when a formula and a cask share a name. Without either flag, match `brew`: treat the name as the formula and print its warning (`Treating docker as a formula. For the cask, use homebrew/cask/docker or specify the --cask flag. To silence this message, use the --formula flag.`, from `package_conflicts_message` in `Library/Homebrew/cli/named_args.rb`). Resolving the name through `brew` itself, passing its stderr through, should give this for free.
- **`brew review config set-key`** stores the API key (see below).
- **`brew review config unset-key`** deletes the stored key. If there's no stored key, print an error and exit non-zero, as `brew uninstall` and `brew untap` do for things that aren't there.
- **No `--model` or `--yes`/`-y` options**, and remove them from the hello-world code. Add them only once real use shows a need. The model is fixed in code.
- **Interactive only.** Before any Clack prompt, check `process.stdin.isTTY`. Without a terminal, print a clear error and exit non-zero. Clack doesn't do this itself: it reads stdin as a terminal regardless, never handles end of input, so a prompt would hang until Node exits on the unsettled `await`, and piped input would be read as key presses.
- **No `config show`**: there's nothing useful to show yet without printing the key.

### API key

- **`config set-key` only takes the key through a masked prompt.** Never accept it as an argument, so it can't end up in shell history.
- **Check the key's format locally**, without an API request, both when it's entered and when it's read back from storage. Accept only Anthropic Console API keys (`sk-ant-api…`). Confirm the exact prefix against Anthropic's docs when implementing. Trim surrounding whitespace, and reject anything else with a message saying how to fix it.
- **A format check can't tell whether the key works**, so handle rejection at run time too. When the API rejects the key (an authentication error, HTTP 401), stop the review and tell the user plainly that the stored key was rejected and how to replace it (`brew review config set-key`). Don't print the key.
- **If no key is set when `brew review` starts**, warn that none is set, run the `config set-key` prompt, then carry on with the review. If there's no terminal to prompt in, print an error saying how to set a key and exit non-zero instead.
- **Always pass the stored key to the AI SDK's Anthropic provider explicitly**, after checking one exists. If it's given no key, the provider falls back to reading `ANTHROPIC_API_KEY` itself. Under `brew review` that variable is filtered out anyway, since the SDK runs in the same process as the CLI. But when the CLI runs outside `brew` (during development, in tests, or by running the installed script directly), the SDK would see it and quietly use a key `brew review` never would. Passing the key explicitly keeps every way of running the CLI consistent, and backs up the tests' safety net.
- **Store the key in a file** under `$XDG_CONFIG_HOME/brew-review/` (default `~/.config/brew-review/`). `brew` filters the environment before running commands, so `XDG_CONFIG_HOME` arrives as `HOMEBREW_XDG_CONFIG_HOME`. Read that first, falling back to `XDG_CONFIG_HOME` when run outside `brew`, then `~/.config`. Create the directory as `0700` and the file as `0600` when they're first written, rather than changing permissions afterwards, so the key is never readable by others even briefly.
- **Store the key under its provider's name**, e.g. `{"anthropic": {"apiKey": "…"}}`, not as a bare key. Adding providers later then won't need existing files converting.

## After that: the review process

How `brew review` decides whether each package from [Commands](#commands) is still in use. "Recently" means **within the last 90 days**, fixed in code with no option to change it.

### 1. Gather signals in code

Collect these cheaply and deterministically before involving the AI.

**What the package is** (both formulae and casks): its description and homepage from `brew info --json=v2`. The other signals say how a package is used, not what it does. For example, knowing `pinentry-mac` is a GPG helper explains why it's never run directly.

**Formulae:**
- **Dependents:** `brew uses --installed <formula>`. Removing a formula others depend on would break them, and `brew uninstall` refuses anyway.
- **Services:** whether `brew services list` shows it running or set to start.
- **Background jobs:** a launch agent or daemon (see Casks) whose `Program` or `ProgramArguments` names one of its binaries or its `$(brew --prefix)/opt/<formula>` path, and whether it's loaded.
- **Shell history:** uses of the formula's binaries (its `bin/` entries, from `brew list <formula>`) in zsh (`~/.zsh_history`, dated only with `EXTENDED_HISTORY`), bash (`~/.bash_history`, usually undated) and fish (`~/.local/share/fish/fish_history`). History is often short and only covers interactive use, so no match doesn't mean unused. Library formulae with no binaries (e.g. `openssl`) get no history signal.
- **Pinned** status and **install date**.

**Casks:**
- **Last opened:** `mdls -name kMDItemLastUsedDate -name kMDItemUseCount` on each app the cask installed (from the cask's `artifacts` in `brew info --json=v2`). It's only updated when an app is opened normally (Dock, Finder, `open`), and is missing where Spotlight doesn't index.
- **Background use:** launch agents and daemons in `~/Library/LaunchAgents`, `/Library/LaunchAgents` and `/Library/LaunchDaemons` that belong to it, and whether each is loaded. Match on `Label`, `AssociatedBundleIdentifiers`, `Program` or `ProgramArguments`, against the cask's bundle IDs and binaries and the labels in its `uninstall`/`zap` `launchctl:` stanzas (which `.pkg` and driver casks often have when they have nothing else). Parse the plists, which may be binary, and read only those keys. The arguments can hold tokens, so tell the model only the job's label and whether it's loaded, never its arguments.
- **Shell history:** uses of any binaries the cask installs (its `binary` artifacts, e.g. `code` from `visual-studio-code`), counted the same way as for formulae.
- **Casks that aren't apps** (`.pkg` installers, command-line tools, drivers, plugins) only get their description, the background use signal, shell history for any binaries, and references in files (below). Many have no app name, bundle ID, binary or `launchctl:` label to match on, so they get no usage signal at all and are likely to come out unsure.
- **Fonts** get no usage signals at all, not even references in files (font family names aren't search terms). They count as unsure without calling the AI, since a description alone can't show use.
- Don't use Screen Time's database: it's private, needs Full Disk Access and changes between macOS versions.

**References in files** (both formulae and casks):
- **Search terms:**
  - Formulae: the formula name and its binary names. The name catches library formulae with no binaries, e.g. `brew --prefix openssl` or `/opt/homebrew/opt/openssl`.
  - Casks: app names, bundle IDs and any binaries the cask installs (e.g. `code`).
  - Match whole words only, so `gh` doesn't match `high`. Short or common names will still match loosely; the model weighs that.
- **Search:**
  - Shell config: `~/.zshenv`, then `.zshrc`, `.zprofile` and `.zlogin` in `$ZDOTDIR` if it's set in the environment, else `~`; `~/.bashrc`, `~/.bash_profile`, `~/.bash_login`, `~/.profile`, `$XDG_CONFIG_HOME/fish/**`. This catches aliases, `eval "$(tool init)"` and `PATH` additions.
  - Git config: `~/.gitconfig` and `$XDG_CONFIG_HOME/git/config`, for pagers, diff tools and credential helpers.
  - Other app config: `$XDG_CONFIG_HOME/**` (default `~/.config`).
  - Version managers: `~/.tool-versions`.
  - Personal scripts: `~/bin`, `~/.local/bin`.
  - Scheduled jobs: `crontab -l`, which exits non-zero when there's no crontab; treat that as empty.
  - `brew` filters the environment before running commands, so `XDG_CONFIG_HOME` and `ZDOTDIR` arrive as `HOMEBREW_XDG_CONFIG_HOME` and `HOMEBREW_ZDOTDIR`. Read the `HOMEBREW_` names first, falling back to the plain names when run outside `brew` (as for the [key file](#api-key)).
  - Every recursive search has a depth and file size limit, skips binary files and doesn't follow symlink loops.
- **Brewfiles** (`~/Brewfile`, `~/.Brewfile`, `$XDG_CONFIG_HOME/homebrew/Brewfile` and any `HOMEBREW_BUNDLE_FILE_GLOBAL`) are left out of the search above. A Brewfile lists most installed packages, so it shows the package was installed on purpose, not that it's used. Tell the model "listed in `~/Brewfile`" as a separate fact.
- **Never read:**
  - `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.netrc`, `~/.git-credentials`, and the rest of `~/Library`.
  - Under `$XDG_CONFIG_HOME`: `git/credentials`, `gh/hosts.yml`, `gcloud/`, `rclone/`, `op/`, `fish/fish_variables` (fish's universal variables, often tokens), and our own `brew-review/`.
  - Any `.env*`, `*.pem`, `*.key` or `*credentials*` file.
  - Resolve symlinks first and check the real path, since dotfile managers like stow and chezmoi use symlinks that may point anywhere.
  - Even though no file content is sent (below), these aren't scanned at all.
- **Send the model counts, never file content.** For each match: the file path, which search term matched, how many lines matched, and whether they're all commented out. Only judge that for files whose format is known from their name or location (shell and fish config, git config, TOML, YAML, crontab: lines starting with `#`). For any other file, never call a line commented out, since a wrong guess would push towards "probably unused". For example: "`jq`: 3 lines in `~/bin/backup.sh`; `gh`: 1 commented-out line in `~/.zshrc`". Cap the files listed per package (e.g. 20, then a total), so `git` or `node` doesn't send hundreds.
  - This replaces an earlier plan to send excerpts with secrets hidden. Hiding secrets with patterns kept missing forms (fish's `set -gx`, `Authorization: Bearer …`, `curl -u`) and also hid real evidence (`password_command = "op read …"`). With counts only, there's nothing to hide.
  - The cost is that the model loses context around each match. If evals show it needs that, revisit.
- **References don't skip the AI** in step 2. A match may be stale, so the model judges them.
- **Project folders aren't searched for now.** They'd be a strong signal (`package.json` scripts, Makefiles, `mise.toml`), but there's no standard place they live and searching all of `~` is slow and risky. A setting listing project folders could come later.

### 2. Skip the AI when the answer is clear

Some packages are judged without calling the AI. A package with a strong "keep" signal is reported as in use, with the reason:
- other installed formulae depend on it;
- it runs as a service, or has a loaded launch agent or daemon that isn't just an updater. Many apps ship always-loaded updaters (e.g. Google Keystone, Microsoft AutoUpdate) that would otherwise mark every such app as in use. Recognise updaters by label (e.g. containing `update` or `keystone`). Updaters and jobs that aren't loaded go to the model as signals instead. (This narrows an earlier rule that skipped the AI for any background item.);
- it was used or opened recently.

Fonts also skip the AI, but as **unsure**, with the reason "Fonts have no usage signals" (see Casks above).

This saves time and API costs for users with hundreds of packages.

### 3. Ask the AI about the rest

**Model: Claude Haiku 4.5** (`claude-haiku-4-5-20251001`), fixed in code. A full review makes a lot of calls, so cost and speed matter more than peak judgement. Pin the dated ID so behaviour doesn't change underneath us. Switch to a more capable model later if Haiku's verdicts prove unreliable.

Give the model the gathered signals, including the references found in files. It has no tools of its own (see Decisions). It returns a verdict (**in use**, **probably unused** or **unsure**), a **one-line summary** of why (short enough to fit beside a package name in a terminal) and **full reasons** citing the evidence it was given.
- **Use the AI SDK's structured output** with a schema for those three fields, rather than parsing free text. Check how the AI SDK's Anthropic provider produces it for Haiku 4.5 (native structured outputs or a forced tool call) when implementing.
- **Review a few packages at once** (a small fixed number, e.g. 4), since 100+ packages one after another would be slow.
- **Show progress, not model output.** The old script streamed raw output only so the user could see something was happening. Show a single progress line instead, e.g. a Clack spinner with "Reviewing 37/121: ripgrep, jq, fd, bat". Don't show the model's text. This reverses an earlier plan to stream the model's text as progress, at the user's request.

**Recover from passing errors.** Rate limits (HTTP 429), overloaded or server errors (5xx), network failures and model replies that don't match the schema are retried with backoff a few times (respecting `retry-after`). If a package still fails, mark it **failed** and carry on (this reverses an earlier plan to count it as unsure, since nothing was judged), so one failure doesn't throw away a long review. Failed packages are never offered for removal in a full review (see step 4). In a full review, if most packages are failing (e.g. the network is down), stop and say why rather than marking everything failed. A rejected key is never retried (see [API key](#api-key)).

**Never send shell history lines to the model.** They often contain secrets typed into commands. Send only per-binary counts and dates, e.g. "`jq`: 14 uses, last on 2026-09-30".

### 4. Confirm before uninstalling

Nothing is removed without the user's explicit confirmation. Review every package first, then let the user choose from one summary:

1. **Counts of the rest**, e.g. "112 in use, 9 unsure, 2 failed". Packages that are in use (whether skipped in step 2 or judged by the AI) and unsure ones aren't listed individually. Failed packages (see [Recover from passing errors](#3-ask-the-ai-about-the-rest)) are listed by name with their error, but aren't offered for removal; the user can rerun `brew review <package>` for them.
2. **If no packages are probably unused**, say "Nothing looks unused" after the counts and exit successfully, skipping the rest of these steps.
3. **A Clack `multiselect` of the probably unused packages**, with the AI's one-line summary as each option's `hint`. Clack shows a hint beside the highlighted option (and ticked ones), so the reasons appear one at a time as the user moves through the list rather than all at once. **Nothing is ticked by default.**
4. **If any casks are selected, ask whether to zap them** (`--zap`, which also removes their app data and settings), defaulting to no. `--zap` is the only `brew uninstall` option that needs asking about; if `brew` adds similar ones, ask about those the same way.
5. **A final confirmation** naming how many packages will be removed and whether casks will be zapped.
6. **Uninstall one package at a time** with `brew uninstall` (plus `--zap` if chosen), passing its output through. If one fails, report it and carry on with the rest, then list any failures at the end.

**`brew review <package>`** always shows that package's verdict, one-line summary and full reasons, whatever the verdict, since the user asked about it specifically. If it skipped the AI (step 2), the reason from step 2 (a strong-keep reason, or the font reason) stands in for both the summary and the reasons. If its review fails after retries, show it as failed with the error in place of the verdict and reasons. A rejected key is the exception: it stops the run, as in a full review (see [API key](#api-key)). Otherwise it always offers to uninstall the package, whatever the verdict or error: a confirmation defaulting to no for a formula, or for a cask a single choice of keep (the default), uninstall, or uninstall and zap, so the zap decision is part of the one confirmation.

## Done: scaffold the project

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
6. **ESLint (flat config):** combine `@eslint/js` recommended, `typescript-eslint` `strictTypeChecked` plus `stylisticTypeChecked`, and `@stylistic/eslint-plugin` `configs.recommended`. Use type information wherever a config supports it: `parserOptions.projectService` + `tsconfigRootDir: import.meta.dirname`, with `allowDefaultProject` for `eslint.config.js` if it sits outside the tsconfig. Ignore `dist/`.
7. **Hello-world command** in `src/cli.ts`:
   - A commander program with a few argument types: a positional, a string option, a boolean flag, and maybe a subcommand.
   - Clack prompts of a few kinds: `text`, `confirm`, `select`, and maybe `password`.
   - Handle `isCancel` and use `intro`/`outro`.
8. Add `.gitignore` (`node_modules/`, `dist/`) and the `typecheck`/`lint`/`build`/`dev` scripts.
9. Check that `npm run typecheck`, `npm run lint`, `npm run build` and the built binary all work.

## Later tasks

- **Create `Formula/brew-review.rb`.** There is currently **no formula and no `Formula/` directory**. An untracked `brew tap-new`/`brew create` stub was deleted on purpose because it was boilerplate: it called `./configure`, had an empty `license ""`, a `system "false"` test, and `deny_network_access!`, which would block `npm install`. Write it fresh using the formula sketch above, with a real `test do` block (e.g. `--help` output). Check how `std_npm_args` interacts with devDependencies when building from a local directory, and build explicitly since `ignore-scripts` skips `prepare`.
- **Maybe later: handle Ctrl-C during a review**, e.g. offering the picker for packages already reviewed. Not for now.
- **Later: Linux support.** Homebrew runs on Linux, but `mdls`, launch agents and `/Library` are macOS-only. Ignore Linux for now.
- **Later: support other AI providers.** The AI SDK is already provider-agnostic, but the CLI only handles Anthropic. Supporting others needs:
  - storing a key for each provider, and knowing which provider a key belongs to;
  - each provider's own local key-format check;
  - a way to choose the active provider;
  - possibly a way to choose the model for a provider. Undecided: only add it if a real need appears, in line with leaving out `--model` for now.
- **Maybe later: a "Why?" details view** in the removal picker. If the one-line hints prove too short in real use, extend `@clack/core`'s multiselect with a key (e.g. `?`) that shows the AI's full reasons for the highlighted package. The full reasons are already returned, so only the prompt needs building.
- **Maybe later: `--include-unsure`**, adding unsure packages to the removal picker. Not for now.
- **Later: tell users what's sent to Anthropic**: the gathered `Signals` for each package that reaches the AI (see [Gather signals in code](#1-gather-signals-in-code)), such as package names and descriptions, app last-opened dates, install dates, launch job labels and whether they're loaded, file paths with match counts, and shell history counts and dates. Never file content or history lines. Generate the list from the `Signals` schema where possible, so it can't drift. Possibly a short notice in `config set-key` and a note in the README.
- **Later: remember packages the user keeps.** For now, every full review re-asks about the same probably unused packages. Options include an ignore list (e.g. `brew review config ignore <package>`) or a "never ask again" choice in the picker.
- **Later: cache verdicts between runs**, keyed on the package and its gathered signals, and reuse a verdict while the signals haven't changed. The key must also cover the prompt and model. Cached verdicts also need an age limit (e.g. 30 days), since the model judges dates such as last use and install against today, so the same signals can deserve a different verdict months later. For now, every run calls the AI again.
- **Maybe later: a non-interactive mode**, e.g. uninstalling without confirmation. Deliberately not supported for now; see "Interactive only" under [Commands](#commands).
- **Release flow (for now):** tag `vX.Y.Z`, bump the formula's `tag:`, push. The tap's CI (`brew test-bot`) runs on PRs.
- **Later: switch to GitHub Releases with a bundled JS file** (see "Future distribution" under Decisions). Build it after the tool itself works.

## Original script

The user's earlier attempt, copied verbatim. **It's for reference only:** it doesn't fully work, so don't treat its behaviour as requirements. It uses the `claude` CLI, but the new tool uses the Vercel AI SDK (see Decisions). Its `jq` filter showed streamed text, a "thinking..." marker, tool calls and tool result previews, but only so the user could see something was happening. The new tool shows a progress line instead (see [Ask the AI about the rest](#3-ask-the-ai-about-the-rest)).

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
