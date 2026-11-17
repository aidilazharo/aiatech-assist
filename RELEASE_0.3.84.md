# ATGV AIATECH Assist v0.3.84 — Git default-branch clone fixes and BA navigation cleanup

## Repo Sync — source branch detection
- Source branch is optional; blank means resolve the real default branch from GitHub repository metadata with Source PAT read permission.
- Explicit branch selection remains strict: never silently fall back from a missing selected branch to a different branch.
- Replace ambiguous `git clone: Remote branch main not found` errors with actionable Source branch guidance.
- Refuse to clone an empty Repo B when its configured PR base branch has no commit. Preserve files, never initialize or push to main implicitly.
- Keep independent PATs, protected Repo B main, reviewed sync branch and pull-request creation for the Repo A → Repo B feature.

## SDLC Library
- Retain the SDLC catalog's required `main` authority. Explain a missing library `main` branch or misconfigured repository URL rather than displaying raw Git clone errors.

## Business Analyst → My Work
- Remove redundant **Switch Project** action from Jira-only, unlinked BR Epic cards while preserving **View Jira** and the global project selector.
- Do not modify approved BR evidence, Jira link mappings, or project data.

## Regression coverage
- `test/v384-repo-sync-default-branch.test.js`: non-main Source default, missing explicit Source branch, empty destination base, read-only Source metadata validation and UI.
- `test/v383-ba-br-panel-switch-project.test.js`: BR panel action removal and global project selector preservation.

## Publication
- Changes committed directly to extension `main`; no new PR was created.
- Source-level syntax and assertion preflight completed; the full extension-host and integration suite still requires execution in CI or a locally checked-out source tree.
