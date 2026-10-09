# 12. Confirm and uninstall flow

Date: 2026-10-09

Status: Accepted

## Context

Nothing may be removed without the user's explicit confirmation. Showing every package's reasons at once would be overwhelming.

## Decision

### Full review (`brew review`)

Review every package first, then let the user choose from one summary:

1. **Counts**, e.g. "112 in use, 9 unsure, 2 failed". In-use and unsure packages aren't listed individually. Failed packages are listed by name with their error, but aren't offered for removal; the user can rerun `brew review <package>` for them.
2. **If no packages are probably unused**, say "Nothing looks unused" and exit successfully.
3. **A Clack `multiselect` of the probably unused packages**, with the one-line summary as each option's `hint`. Clack shows a hint beside the highlighted option (and ticked ones), so reasons appear one at a time as the user moves through the list. **Nothing is ticked by default.**
4. **If any casks are selected, ask whether to zap them** (`--zap`, which also removes their app data and settings), defaulting to no. `--zap` is the only `brew uninstall` option that needs asking about; if `brew` adds similar ones, ask about those the same way.
5. **A final confirmation** naming how many packages will be removed and whether casks will be zapped.
6. **Uninstall one package at a time** with `brew uninstall` (plus `--zap` if chosen), passing its output through. If one fails, report it and carry on, then list any failures at the end.

### Single package (`brew review <package>`)

- Always show the verdict, one-line summary and full reasons, whatever the verdict, since the user asked about it specifically.
  - If it skipped the AI, the reason from [ADR 9](0009-gather-usage-signals-in-code.md) (a strong-keep reason, or the font reason) stands in for both the summary and the reasons.
  - If its review failed after retries, show it as failed with the error in place of the verdict and reasons.
  - A rejected key stops the run, as in a full review.
- Then always offer to uninstall it, whatever the verdict or error: a confirmation defaulting to no for a formula, or for a cask a single choice of keep (the default), uninstall, or uninstall and zap, so the zap decision is part of the one confirmation.

## Consequences

- Unsure packages can't be removed from a full review; the user reviews them individually. An `--include-unsure` option may come later.
- Every full review re-asks about the same probably unused packages the user chose to keep. Remembering those may come later.
- If the one-line hints prove too short, a "Why?" view (e.g. a `?` key built on `@clack/core`'s multiselect) could show the full reasons, which are already returned.
