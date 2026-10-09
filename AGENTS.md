# Agent instructions

## Commits

Keep commits small and atomic: one logical change per commit, such as a dependency swap, a refactor, or a feature built on them.

- Commit each change when it's done, without waiting to be asked. Don't push unless asked.
- Every commit should typecheck, lint and build on its own (`npm run typecheck`, `npm run lint`, `npm run build`).
- When a change makes or changes a decision, add an ADR in `docs/adr/` in the same commit, superseding any ADR it replaces rather than rewriting it (see `docs/adr/0001-record-architecture-decisions.md`). Update `PLAN.md` in the same commit when the roadmap changes.
- Only the agent the user is talking to commits. Subagents leave their changes uncommitted.
- Never stash, reset, overwrite or commit uncommitted work that isn't part of your task, such as the user's own in-progress edits.
- Only rewrite commits you made during the current task that haven't been pushed. Put other fixes in new commits.
- If you can't follow these rules safely, stop and ask the user.

## Review every change

Before telling the user a task is complete, dispatch a subagent to review the work. Tasks that change no files, such as answering a question, need no review.

- Only the agent the user is talking to runs the review. If you are a subagent doing delegated work, don't start a reviewer of your own.
- The reviewer only reports. Tell it not to edit files, commit, or run anything that changes the repo, and to send its findings back to you. You make any fixes.
- Give the reviewer the commits made for this task, plus any uncommitted changes and new untracked files, and the goal of the task. Don't give it your own conclusions, so its read isn't anchored on yours.
- Ask it to look for correctness bugs and for anything that contradicts the accepted ADRs in `docs/adr/` or `PLAN.md`. If the change edits an accepted ADR's decision rather than superseding it (fixing typos, links or factual errors is fine), or edits `PLAN.md` to reverse a decision, it should flag that rather than treat the new text as the reference.
- Check each finding yourself before acting on it. Fix the real ones, and tell the user what the review found, including anything you chose not to fix and why.
- Re-review if a fix changes behaviour or touches files the reviewer didn't see.
- If your tool has no way to start a subagent, review the full change yourself as if seeing it fresh, and tell the user no subagent review was run.
