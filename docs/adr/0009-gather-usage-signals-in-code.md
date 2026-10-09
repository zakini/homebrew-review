# 9. Gather usage signals in code

Date: 2026-10-09

Status: Accepted

## Context

Deciding whether a package is still in use needs evidence. Much of it can be collected cheaply and deterministically, and some of it is clear enough that asking an AI adds nothing but time and cost.

## Decision

"Recently" means **within the last 90 days**, fixed in code with no option to change it.

### Signals

Collected by `gatherSignals(package)`, which returns a plain, JSON-serialisable `Signals` object (see [ADR 13](0013-testing-strategy.md)).

**What the package is** (formulae and casks): its description and homepage from `brew info --json=v2`. The other signals say how a package is used, not what it does. For example, knowing `pinentry-mac` is a GPG helper explains why it's never run directly.

**Formulae:**
- **Dependents:** `brew uses --installed <formula>`. Removing a formula others depend on would break them, and `brew uninstall` refuses anyway.
- **Services:** whether `brew services list` shows it running or set to start.
- **Background jobs:** a launch agent or daemon (see Casks) whose `Program` or `ProgramArguments` names one of its binaries or its `$(brew --prefix)/opt/<formula>` path, and whether it's loaded.
- **Shell history:** uses of the formula's binaries (its `bin/` entries, from `brew list <formula>`) in zsh (`~/.zsh_history`, dated only with `EXTENDED_HISTORY`), bash (`~/.bash_history`, usually undated) and fish (`~/.local/share/fish/fish_history`). History is often short and only covers interactive use, so no match doesn't mean unused. Library formulae with no binaries (e.g. `openssl`) get no history signal.
- **Pinned** status and **install date**.

**Casks:**
- **Last opened:** `mdls -name kMDItemLastUsedDate -name kMDItemUseCount` on each app the cask installed (from the cask's `artifacts` in `brew info --json=v2`). It's only updated when an app is opened normally (Dock, Finder, `open`), and is missing where Spotlight doesn't index.
- **Background use:** launch agents and daemons in `~/Library/LaunchAgents`, `/Library/LaunchAgents` and `/Library/LaunchDaemons` that belong to it, and whether each is loaded. Match on `Label`, `AssociatedBundleIdentifiers`, `Program` or `ProgramArguments`, against the cask's bundle IDs and binaries and the labels in its `uninstall`/`zap` `launchctl:` stanzas (which `.pkg` and driver casks often have when they have nothing else). Parse the plists, which may be binary, and read only those keys. The arguments can hold tokens, so the model only ever gets a job's label and whether it's loaded.
- **Shell history:** uses of any binaries the cask installs (its `binary` artifacts, e.g. `code` from `visual-studio-code`), counted as for formulae.
- **Casks that aren't apps** (`.pkg` installers, command-line tools, drivers, plugins) only get their description, background use, shell history for any binaries, and references in files. Many have nothing to match on, so they get no usage signal and are likely to come out unsure.
- **Fonts** get no usage signals at all, not even references in files (font family names aren't search terms).

**References in files** (formulae and casks): see [ADR 10](0010-file-references-as-counts.md).

**Brewfiles** (`~/Brewfile`, `~/.Brewfile`, `$XDG_CONFIG_HOME/homebrew/Brewfile` and any `HOMEBREW_BUNDLE_FILE_GLOBAL`): a Brewfile lists most installed packages, so it shows the package was installed on purpose, not that it's used. Record "listed in `~/Brewfile`" as a separate fact.

**Never send shell history lines.** They often contain secrets typed into commands. Record only per-binary counts and dates, e.g. "`jq`: 14 uses, last on 2026-09-30".

### Skip the AI when the answer is clear

A package with a strong "keep" signal is reported as **in use**, with the reason, without calling the AI:
- other installed formulae depend on it;
- it runs as a service, or has a loaded launch agent or daemon that isn't just an updater. Many apps ship always-loaded updaters (e.g. Google Keystone, Microsoft AutoUpdate) that would otherwise mark every such app as in use. Recognise updaters by label (e.g. containing `update` or `keystone`). Updaters and jobs that aren't loaded go to the model as signals instead;
- it was used or opened recently.

**Fonts** also skip the AI, as **unsure**, with the reason "Fonts have no usage signals", since a description alone can't show use.

References in files never skip the AI: a match may be stale, so the model judges them.

## Consequences

- Users with hundreds of packages save time and API costs.
- Some packages, especially non-app casks and fonts, will often come out unsure.
- Only macOS is supported: `mdls`, launch agents and `/Library` don't exist on Linux. Linux support may come later.

## Alternatives considered

- **Screen Time's database:** private, needs Full Disk Access and changes between macOS versions.
- **Skipping the AI for any background item:** would mark every app with an always-loaded updater as in use.
