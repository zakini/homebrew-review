# Agent instructions

## Review every change

Before telling the user a task is complete, dispatch a subagent to review the work. Tasks that change no files, such as answering a question, need no review.

- Only the agent the user is talking to runs the review. If you are a subagent doing delegated work, don't start a reviewer of your own.
- The reviewer only reports. Tell it not to edit files, commit, or run anything that changes the repo, and to send its findings back to you. You make any fixes.
- Give the reviewer the commits made for this task, plus any uncommitted changes and new untracked files, and the goal of the task. Don't give it your own conclusions, so its read isn't anchored on yours.
- Ask it to look for correctness bugs and for anything that contradicts `PLAN.md`. If the change edits `PLAN.md` itself, it should flag any decision being reversed rather than treat the new text as the reference.
- Check each finding yourself before acting on it. Fix the real ones, and tell the user what the review found, including anything you chose not to fix and why.
- Re-review if a fix changes behaviour or touches files the reviewer didn't see.
- If your tool has no way to start a subagent, review the full change yourself as if seeing it fresh, and tell the user no subagent review was run.
