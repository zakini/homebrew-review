# 7. Commands and scope

Date: 2026-10-09

Status: Accepted

## Context

The tool should review the packages the user chose to install, not their dependencies, and offer to remove the ones that look unused. Options should only be added once real use shows a need.

## Decision

- **`brew review`** reviews every package the user chose to install:
  - **Formulae installed on request** (`brew list --formula --installed-on-request`). Formulae installed only as dependencies are skipped.
  - **All installed casks** (`brew list --cask`). Casks can depend on other casks, and Homebrew records which were installed on request in each cask's install receipt, but no public command exposes it: `--installed-on-request` refuses `--cask`, and `brew info --json=v2` doesn't include the field for casks. Cask dependencies are rare, so review every cask rather than reading the internal receipts.
- **`brew review <package>`** reviews only that package. Accept fully qualified names (`homebrew/cask/docker`) as `brew` does. If it isn't installed, say so clearly and exit with an error.
- **`--formula`/`--formulae` and `--cask`/`--casks`**, as in core `brew` commands, and they can't be combined:
  - With no package, they limit the review to formulae or to casks.
  - With a package, they pick which one to review when a formula and a cask share a name. Without either flag, match `brew`: treat the name as the formula and print its warning (`Treating docker as a formula. For the cask, use homebrew/cask/docker or specify the --cask flag. To silence this message, use the --formula flag.`, from `package_conflicts_message` in `Library/Homebrew/cli/named_args.rb`). Resolving the name through `brew` itself and passing its stderr through should give this for free.
- **`brew review config set-key`** and **`brew review config unset-key`** manage the API key (see [ADR 8](0008-api-key-handling.md)).
- **Interactive only.** Before any Clack prompt, check `process.stdin.isTTY`. Without a terminal, print a clear error and exit non-zero. Clack doesn't do this itself: it reads stdin as a terminal regardless and never handles end of input, so a prompt would hang until Node exits on the unsettled `await`, and piped input would be read as key presses.
- **Not included, until real use shows a need:**
  - `--model`: the model is fixed in code.
  - `--yes`/`-y` or any other way to skip confirmations, and any non-interactive mode.
  - `config show`: there's nothing useful to show without printing the key.

## Consequences

- Scripted or unattended use isn't possible. A non-interactive mode may come later.
- Every cask is reviewed, including the rare ones installed only as another cask's dependency.
