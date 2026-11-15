# ATGV AIATECH Assist v0.3.59

## Fixed Run Server after catalog migration

- Preserve valid `migration/<stack>-catalog-<version>-<sha>` branch names when project settings are normalized. Previously the registry accepted only `bootstrap/*` and silently replaced migration branches with empty strings, causing repeated **Approved stack branch is missing** errors even when Save Stack completed successfully.
- Recover previously affected saved projects during explicit Run Server or Test & Run: read local Git refs and restore only one recognized ATGV migration/bootstrap branch pointing to the **exact saved SHA** and **matching stack ID**. Keep the current checkout unchanged and preserve existing tested evidence.
- If the pinned SHA is absent, a branch has moved, or multiple branches match, stop with an actionable error rather than guessing, resetting branches, force-pushing or inventing approval.
- In detached isolated Architect previews, attribute the running app to the saved logical branch only after matching the verified worktree path and exact Git SHA. This permits secure health verification when Developer has another branch checked out.
- Do not remove user files or disturb main, approved work, Jira, or unrelated application processes.
- Maintain v0.3.58 free-port selection and actual preview-address display.

## Based on uploaded diagnostic log

The supplied November 15 unified log for `tech-cockpit-confluence` recorded two Run Server failures at `architect-preview-worktree.js:16`, both because the saved stack branch was blank. The root cause was the narrower branch validation in `src/projects.js`, not a port collision.

## Limitations

Automatic recovery requires an existing **local** migration/bootstrap branch at the recorded SHA. The code does not fetch missing refs automatically or grant Developer approval without valid test and server verification.
