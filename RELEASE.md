# ATGV AIATECH Assist v0.0.27

## Solution Architect — Custom Stack
- Selecting Custom Stack enables **Save Stack**. The prior automatic scan is deferred until after Save.
- Save Stack creates the project's `repository` folder when absent and clones the configured GitHub owner/repository into a missing or completely empty repository destination.
- Existing tracked/untracked project files are preserved. An existing valid checkout is accepted without an automatic update; use **Pull Repository** explicitly to fetch newer commits safely.
- Reject symlinks, nonempty non-Git folders, mismatched GitHub origins, a catalog repo used as the project repo, and switching from a previously prepared stack without the reset review.
- The Save action neither installs dependencies nor executes project code, commits, pushes, resets, or force updates Git.
- Scan after Save populates detected application targets. Existing **Scan Repository → Pull Repository** remains available once saved.

## My Work — 18 specialist agents
- Remove the generic persistent **What to do next** bar.
- Render Today's Tasks in a separate section, each with a navigation button to the relevant project settings, Business Requirement workflow, Jira issue, or role workspace.
- Separate project-management settings and shared project delivery risks from each specialist's personal task list.
- Exclude completed workflow tasks and finished Jira tickets when My Work is refreshed.
- Keep role-scoped, in-memory AI conversation history for only the current local calendar day and clear the visible transcript and AI history at midnight.

## Verification
- Add regression tests for absent/empty folder clones, dirty/non-Git folders, unexpected origins, 18-role task separation, task completion, safe task navigation, and midnight chat reset.
- Merge only after the full Node, Windows, UI and VSIX release checks are successful.
- Live GitHub private repository cloning depends on configured Git credential support. No PAT is written into Git URLs or repository files.
