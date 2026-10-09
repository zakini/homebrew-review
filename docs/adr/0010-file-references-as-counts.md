# 10. No model tools; send file references as counts

Date: 2026-10-09

Status: Accepted

## Context

References to a package in the user's dotfiles, scripts and config are good evidence it's in use. The old script let the model search `$HOME` freely. But anything the model reads is sent to Anthropic, and the user's files often hold secrets.

## Decision

- **The model gets no tools.** The code searches a fixed allowlist itself and sends the model only counts.
- **Search terms:**
  - Formulae: the formula name and its binary names. The name catches library formulae with no binaries, e.g. `brew --prefix openssl` or `/opt/homebrew/opt/openssl`.
  - Casks: app names, bundle IDs and any binaries the cask installs (e.g. `code`).
  - Match whole words only, so `gh` doesn't match `high`. Short or common names will still match loosely; the model weighs that.
- **Search** (with `XDG_CONFIG_HOME` and `ZDOTDIR` read as described in [ADR 6](0006-follow-homebrew-precedents.md)):
  - Shell config: `~/.zshenv`, then `.zshrc`, `.zprofile` and `.zlogin` in `$ZDOTDIR` if it's set, else `~`; `~/.bashrc`, `~/.bash_profile`, `~/.bash_login`, `~/.profile`, `$XDG_CONFIG_HOME/fish/**`. This catches aliases, `eval "$(tool init)"` and `PATH` additions.
  - Git config: `~/.gitconfig` and `$XDG_CONFIG_HOME/git/config`, for pagers, diff tools and credential helpers.
  - Other app config: `$XDG_CONFIG_HOME/**` (default `~/.config`).
  - Version managers: `~/.tool-versions`.
  - Personal scripts: `~/bin`, `~/.local/bin`.
  - Scheduled jobs: `crontab -l`, which exits non-zero when there's no crontab; treat that as empty.
  - Every recursive search has a depth and file size limit, skips binary files and doesn't follow symlink loops.
  - Brewfiles are left out of the search and recorded separately (see [ADR 9](0009-gather-usage-signals-in-code.md)).
- **Never read:**
  - `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.netrc`, `~/.git-credentials`, and the rest of `~/Library`.
  - Under `$XDG_CONFIG_HOME`: `git/credentials`, `gh/hosts.yml`, `gcloud/`, `rclone/`, `op/`, `fish/fish_variables` (fish's universal variables, often tokens), and our own `brew-review/`.
  - Any `.env*`, `*.pem`, `*.key` or `*credentials*` file.
  - Resolve symlinks first and check the real path, since dotfile managers like stow and chezmoi use symlinks that may point anywhere.
  - Even though no file content is sent, these aren't scanned at all.
- **Send counts, never file content.** For each match: the file path, which search term matched, how many lines matched, and whether they're all commented out. For example: "`jq`: 3 lines in `~/bin/backup.sh`; `gh`: 1 commented-out line in `~/.zshrc`".
  - Only judge "commented out" for files whose format is known from their name or location (shell and fish config, git config, TOML, YAML, crontab: lines starting with `#`). For any other file, never call a line commented out, since a wrong guess would push towards "probably unused".
  - Cap the files listed per package (e.g. 20, then a total), so `git` or `node` doesn't send hundreds.
- **Project folders aren't searched for now.** They'd be a strong signal (`package.json` scripts, Makefiles, `mise.toml`), but there's no standard place they live and searching all of `~` is slow and risky. A setting listing project folders could come later.

## Consequences

- No file content reaches Anthropic, so there's nothing to redact.
- The search is deterministic and unit-testable, and keeps evals less noisy.
- One model call per package, with no search round trips.
- The model loses the context around each match. If evals show it needs that, revisit.

## Alternatives considered

- **Read-only filesystem tools for the model** (as in the old script): open-ended search would eventually read a dotfile containing a token, and every search step is another round trip across 100+ packages. If evals show the model needs to search for itself, add one narrow AI SDK tool that searches the same allowlist and returns the same counts.
- **Sending excerpts with secrets hidden by patterns:** the patterns kept missing forms (fish's `set -gx`, `Authorization: Bearer …`, `curl -u`) and also hid real evidence (`password_command = "op read …"`).
